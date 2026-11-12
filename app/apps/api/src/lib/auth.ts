import { SignJWT, jwtVerify } from 'jose';
import { hash, verify } from '@node-rs/argon2';
import type { FastifyRequest } from 'fastify';
import type { User } from '@selfinance/shared';
import { getConfig, getDb } from '../context';
import type { UsersTable } from '../db/types';
import { forbidden, nowIso, randomToken, sha256, unauthorized, uuidv7 } from './util';

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 30;

const secret = () => new TextEncoder().encode(getConfig().jwtSecret);

export const hashPassword = (password: string) => hash(password);
export const verifyPassword = (passwordHash: string, password: string) =>
  verify(passwordHash, password).catch(() => false);

export function toUser(u: UsersTable): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    isAdmin: !!u.is_admin,
    timezone: u.timezone,
  };
}

export async function issueTokens(user: UsersTable, deviceName?: string | null) {
  const accessToken = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(secret());

  const refreshToken = randomToken(32);
  const now = new Date();
  await getDb()
    .insertInto('refresh_tokens')
    .values({
      id: uuidv7(),
      user_id: user.id,
      token_hash: sha256(refreshToken),
      device_name: deviceName ?? null,
      expires_at: new Date(now.getTime() + REFRESH_DAYS * 86400_000).toISOString(),
      created_at: now.toISOString(),
      revoked_at: null,
    })
    .execute();

  return { accessToken, refreshToken, user: toUser(user) };
}

/** Обменивает refresh-токен на новую пару (старый отзывается). */
export async function rotateRefresh(refreshToken: string) {
  const db = getDb();
  const row = await db
    .selectFrom('refresh_tokens')
    .selectAll()
    .where('token_hash', '=', sha256(refreshToken))
    .executeTakeFirst();
  if (!row || row.revoked_at || row.expires_at < nowIso()) throw unauthorized('Сессия истекла, войдите снова');
  const user = await db.selectFrom('users').selectAll().where('id', '=', row.user_id).executeTakeFirst();
  if (!user || user.is_blocked) throw unauthorized('Пользователь заблокирован');
  await db.updateTable('refresh_tokens').set({ revoked_at: nowIso() }).where('id', '=', row.id).execute();
  return issueTokens(user, row.device_name);
}

export async function revokeRefresh(refreshToken: string) {
  await getDb()
    .updateTable('refresh_tokens')
    .set({ revoked_at: nowIso() })
    .where('token_hash', '=', sha256(refreshToken))
    .execute();
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: UsersTable;
  }
}

/** Проверяет Bearer-токен и возвращает пользователя. */
export async function requireUser(req: FastifyRequest): Promise<UsersTable> {
  if (req.user) return req.user;
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw unauthorized();
  let sub: string | undefined;
  try {
    const { payload } = await jwtVerify(token, secret());
    sub = payload.sub;
  } catch {
    throw unauthorized('Токен недействителен');
  }
  if (!sub) throw unauthorized();
  const user = await getDb().selectFrom('users').selectAll().where('id', '=', sub).executeTakeFirst();
  if (!user || user.is_blocked) throw unauthorized('Пользователь заблокирован');
  req.user = user;
  return user;
}

export async function requireAdmin(req: FastifyRequest) {
  const user = await requireUser(req);
  if (!user.is_admin) throw forbidden('Только для администратора');
  return user;
}
