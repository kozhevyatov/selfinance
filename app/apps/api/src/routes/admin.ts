import type { FastifyInstance } from 'fastify';
import {
  adminSettingsSchema,
  adminUserCreateSchema,
  adminUserUpdateSchema,
  inviteCreateSchema,
  parseLogin,
  type AdminUser,
  type Invite,
} from '@selfinance/shared';
import { VERSION } from '../config';
import { ctx, getDb } from '../context';
import type { InvitesTable, UsersTable } from '../db/types';
import { hashPassword, requireAdmin } from '../lib/auth';
import { badRequest, notFound, nowIso, randomToken, uuidv7 } from '../lib/util';
import { createBudget } from '../services/budgets';
import { getRegistrationMode, setSetting } from '../services/settings';

const toAdminUser = (u: UsersTable): AdminUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  isAdmin: !!u.is_admin,
  isBlocked: !!u.is_blocked,
  createdAt: u.created_at,
});

const toInvite = (i: InvitesTable): Invite => ({
  id: i.id,
  code: i.code,
  expiresAt: i.expires_at,
  usedBy: i.used_by,
  usedAt: i.used_at,
  createdAt: i.created_at,
});

export default async function adminRoutes(app: FastifyInstance) {
  app.get('/admin/settings', async (req) => {
    await requireAdmin(req);
    return {
      registration: await getRegistrationMode(getDb()),
      version: VERSION,
      dbType: ctx.config?.db.type ?? null,
    };
  });

  app.patch('/admin/settings', async (req) => {
    await requireAdmin(req);
    const input = adminSettingsSchema.parse(req.body);
    await setSetting(getDb(), 'registration', input.registration);
    return input;
  });

  app.get('/admin/users', async (req) => {
    await requireAdmin(req);
    const rows = await getDb().selectFrom('users').selectAll().orderBy('created_at').execute();
    return rows.map(toAdminUser);
  });

  app.post('/admin/users', async (req) => {
    const db = getDb();
    await requireAdmin(req);
    const input = adminUserCreateSchema.parse(req.body);
    const login = parseLogin(input.login);
    if (!login) throw badRequest('Проверьте email или телефон', { login: 'Введите email или номер телефона' });
    const taken = await db
      .selectFrom('users')
      .select('id')
      .where(login.kind === 'email' ? 'email' : 'phone', '=', login.value)
      .executeTakeFirst();
    if (taken) throw badRequest('Такой пользователь уже есть', { login: 'Уже зарегистрирован' });
    const now = nowIso();
    const user: UsersTable = {
      id: uuidv7(),
      email: login.kind === 'email' ? login.value : null,
      phone: login.kind === 'phone' ? login.value : null,
      name: input.name,
      password_hash: await hashPassword(input.password),
      is_admin: input.isAdmin ? 1 : 0,
      is_blocked: 0,
      timezone: 'Europe/Moscow',
      created_at: now,
      updated_at: now,
    };
    await db.insertInto('users').values(user).execute();
    await createBudget(db, user.id, 'Личный', 'personal');
    return toAdminUser(user);
  });

  app.patch<{ Params: { userId: string } }>('/admin/users/:userId', async (req) => {
    const db = getDb();
    const me = await requireAdmin(req);
    const input = adminUserUpdateSchema.parse(req.body);
    const user = await db.selectFrom('users').selectAll().where('id', '=', req.params.userId).executeTakeFirst();
    if (!user) throw notFound('Пользователь не найден');
    if (user.id === me.id && (input.isBlocked || input.isAdmin === false)) {
      throw badRequest('Нельзя заблокировать себя или снять с себя права администратора');
    }
    const patch: Partial<UsersTable> = { updated_at: nowIso() };
    if (input.isBlocked !== undefined) patch.is_blocked = input.isBlocked ? 1 : 0;
    if (input.isAdmin !== undefined) patch.is_admin = input.isAdmin ? 1 : 0;
    if (input.password) patch.password_hash = await hashPassword(input.password);
    await db.updateTable('users').set(patch).where('id', '=', user.id).execute();
    // при блокировке и смене пароля — завершаем все сессии пользователя
    if (input.isBlocked || input.password) {
      await db.updateTable('refresh_tokens').set({ revoked_at: nowIso() }).where('user_id', '=', user.id).where('revoked_at', 'is', null).execute();
    }
    return toAdminUser((await db.selectFrom('users').selectAll().where('id', '=', user.id).executeTakeFirstOrThrow()));
  });

  app.get('/admin/invites', async (req) => {
    await requireAdmin(req);
    const rows = await getDb().selectFrom('invites').selectAll().orderBy('created_at', 'desc').limit(100).execute();
    return rows.map(toInvite);
  });

  app.post('/admin/invites', async (req) => {
    const me = await requireAdmin(req);
    const { days } = inviteCreateSchema.parse(req.body ?? {});
    const now = new Date();
    const row: InvitesTable = {
      id: uuidv7(),
      code: randomToken(9),
      created_by: me.id,
      expires_at: new Date(now.getTime() + days * 86400_000).toISOString(),
      used_by: null,
      used_at: null,
      created_at: now.toISOString(),
    };
    await getDb().insertInto('invites').values(row).execute();
    return toInvite(row);
  });

  app.delete<{ Params: { inviteId: string } }>('/admin/invites/:inviteId', async (req) => {
    await requireAdmin(req);
    await getDb().deleteFrom('invites').where('id', '=', req.params.inviteId).where('used_by', 'is', null).execute();
    return { ok: true };
  });
}
