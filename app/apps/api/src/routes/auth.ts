import type { FastifyInstance } from 'fastify';
import {
  loginSchema,
  normalizeEmail,
  normalizePhone,
  parseLogin,
  refreshSchema,
  registerSchema,
  updateMeSchema,
} from '@selfinance/shared';
import { getDb } from '../context';
import { hashPassword, issueTokens, requireUser, revokeRefresh, rotateRefresh, toUser, verifyPassword } from '../lib/auth';
import { AppError, badRequest, forbidden, nowIso, unauthorized, uuidv7 } from '../lib/util';
import { createBudget } from '../services/budgets';
import { getRegistrationMode } from '../services/settings';

async function findByLogin(login: { kind: 'email' | 'phone'; value: string }) {
  return getDb()
    .selectFrom('users')
    .selectAll()
    .where(login.kind === 'email' ? 'email' : 'phone', '=', login.value)
    .executeTakeFirst();
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req) => {
    const db = getDb();
    const input = registerSchema.parse(req.body);
    const mode = await getRegistrationMode(db);
    if (mode === 'closed') throw forbidden('Регистрация закрыта. Обратитесь к администратору');

    const login = parseLogin(input.login);
    if (!login) throw badRequest('Проверьте email или телефон', { login: 'Введите email или номер телефона' });
    if (await findByLogin(login)) {
      throw badRequest('Такой пользователь уже есть', { login: login.kind === 'email' ? 'Этот email уже зарегистрирован' : 'Этот телефон уже зарегистрирован' });
    }

    let invite: { id: string } | undefined;
    if (mode === 'invite') {
      if (!input.inviteCode) throw forbidden('Регистрация только по приглашению');
      invite = await db
        .selectFrom('invites')
        .select('id')
        .where('code', '=', input.inviteCode)
        .where('used_by', 'is', null)
        .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', nowIso())]))
        .executeTakeFirst();
      if (!invite) throw forbidden('Приглашение недействительно или уже использовано');
    }

    const now = nowIso();
    const user = {
      id: uuidv7(),
      email: login.kind === 'email' ? login.value : null,
      phone: login.kind === 'phone' ? login.value : null,
      name: input.name,
      password_hash: await hashPassword(input.password),
      is_admin: 0,
      is_blocked: 0,
      timezone: input.timezone || 'Europe/Moscow',
      created_at: now,
      updated_at: now,
    };
    await db.insertInto('users').values(user).execute();
    if (invite) await db.updateTable('invites').set({ used_by: user.id, used_at: now }).where('id', '=', invite.id).execute();
    await createBudget(db, user.id, 'Личный', 'personal');
    return issueTokens(user, input.deviceName);
  });

  app.post('/auth/login', async (req) => {
    const input = loginSchema.parse(req.body);
    const login = parseLogin(input.login);
    const user = login ? await findByLogin(login) : undefined;
    if (!user || !(await verifyPassword(user.password_hash, input.password))) {
      throw unauthorized('Неверный логин или пароль');
    }
    if (user.is_blocked) throw forbidden('Пользователь заблокирован');
    return issueTokens(user, input.deviceName);
  });

  app.post('/auth/refresh', async (req) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    return rotateRefresh(refreshToken);
  });

  app.post('/auth/logout', async (req) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await revokeRefresh(refreshToken);
    return { ok: true };
  });

  app.get('/auth/me', async (req) => toUser(await requireUser(req)));

  app.patch('/auth/me', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const input = updateMeSchema.parse(req.body);
    const patch: Record<string, unknown> = { updated_at: nowIso() };

    if (input.name !== undefined) patch.name = input.name;
    if (input.timezone !== undefined) patch.timezone = input.timezone;

    let email = user.email;
    let phone = user.phone;
    if (input.email !== undefined) {
      email = input.email ? normalizeEmail(input.email) : null;
      if (input.email && !email) throw badRequest('Неверный email', { email: 'Неверный email' });
      if (email && email !== user.email) {
        const taken = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
        if (taken) throw badRequest('Email уже занят', { email: 'Этот email уже используется' });
      }
      patch.email = email;
    }
    if (input.phone !== undefined) {
      phone = input.phone ? normalizePhone(input.phone) : null;
      if (input.phone && !phone) throw badRequest('Неверный телефон', { phone: 'Неверный номер телефона' });
      if (phone && phone !== user.phone) {
        const taken = await db.selectFrom('users').select('id').where('phone', '=', phone).executeTakeFirst();
        if (taken) throw badRequest('Телефон уже занят', { phone: 'Этот телефон уже используется' });
      }
      patch.phone = phone;
    }
    if (!email && !phone) throw badRequest('Нужен email или телефон для входа');

    if (input.newPassword) {
      if (!input.currentPassword || !(await verifyPassword(user.password_hash, input.currentPassword))) {
        throw new AppError(400, 'BAD_PASSWORD', 'Текущий пароль неверный', { currentPassword: 'Неверный пароль' });
      }
      patch.password_hash = await hashPassword(input.newPassword);
    }

    await db.updateTable('users').set(patch).where('id', '=', user.id).execute();
    const updated = await db.selectFrom('users').selectAll().where('id', '=', user.id).executeTakeFirstOrThrow();
    return toUser(updated);
  });

  app.get('/auth/sessions', async (req) => {
    const user = await requireUser(req);
    const rows = await getDb()
      .selectFrom('refresh_tokens')
      .select(['id', 'device_name', 'created_at', 'expires_at'])
      .where('user_id', '=', user.id)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', nowIso())
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((r) => ({ id: r.id, deviceName: r.device_name, createdAt: r.created_at, expiresAt: r.expires_at }));
  });

  app.delete<{ Params: { id: string } }>('/auth/sessions/:id', async (req) => {
    const user = await requireUser(req);
    await getDb()
      .updateTable('refresh_tokens')
      .set({ revoked_at: nowIso() })
      .where('id', '=', req.params.id)
      .where('user_id', '=', user.id)
      .execute();
    return { ok: true };
  });
}
