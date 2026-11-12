import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { dbConfigSchema, parseLogin, setupSchema } from '@selfinance/shared';
import { VERSION, saveConfig } from '../config';
import { ctx } from '../context';
import { createDb, openDb, prepareDatabase } from '../db';
import { hashPassword, issueTokens } from '../lib/auth';
import { AppError, badRequest, nowIso, uuidv7 } from '../lib/util';
import { createBudget } from '../services/budgets';
import { getRegistrationMode, setSetting } from '../services/settings';

function dbErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  switch (err.code) {
    case 'ECONNREFUSED': return 'Сервер БД не отвечает (connection refused)';
    case 'ENOTFOUND': case 'EAI_AGAIN': return 'Хост БД не найден';
    case 'ETIMEDOUT': return 'Истекло время подключения к БД';
    case 'ER_ACCESS_DENIED_ERROR': return 'Неверный логин или пароль БД';
    case 'ER_DBACCESS_DENIED_ERROR': return 'Нет прав на эту базу данных';
    default: return err.message ?? 'Не удалось подключиться к БД';
  }
}

export default async function setupRoutes(app: FastifyInstance) {
  app.get('/meta', async () => ({
    setupDone: !!ctx.db,
    registration: ctx.db ? await getRegistrationMode(ctx.db) : 'closed',
    version: VERSION,
  }));

  app.post('/setup/test-db', async (req) => {
    if (ctx.db) throw new AppError(409, 'ALREADY_SETUP', 'Сервис уже настроен');
    const cfg = dbConfigSchema.parse(req.body);
    try {
      await prepareDatabase(cfg);
      const db = createDb(cfg);
      await sql`select 1`.execute(db);
      await db.destroy();
      return { ok: true };
    } catch (e) {
      throw badRequest(dbErrorMessage(e));
    }
  });

  app.post('/setup', async (req) => {
    if (ctx.db) throw new AppError(409, 'ALREADY_SETUP', 'Сервис уже настроен');
    const input = setupSchema.parse(req.body);
    const login = parseLogin(input.admin.login);
    if (!login) throw badRequest('Проверьте email или телефон', { 'admin.login': 'Введите email или номер телефона' });

    let db;
    try {
      db = await openDb(input.db);
    } catch (e) {
      throw badRequest(dbErrorMessage(e));
    }

    // База уже содержит пользователей (например, переподключили существующую MariaDB) —
    // просто сохраняем конфиг, админа не создаём.
    const existing = await db.selectFrom('users').select('id').limit(1).executeTakeFirst();
    const config = saveConfig(input.db);
    ctx.db = db;
    ctx.config = config;
    if (existing) return { done: true, existing: true };

    const now = nowIso();
    const user = {
      id: uuidv7(),
      email: login.kind === 'email' ? login.value : null,
      phone: login.kind === 'phone' ? login.value : null,
      name: input.admin.name,
      password_hash: await hashPassword(input.admin.password),
      is_admin: 1,
      is_blocked: 0,
      timezone: input.timezone || 'Europe/Moscow',
      created_at: now,
      updated_at: now,
    };
    await db.insertInto('users').values(user).execute();
    await createBudget(db, user.id, 'Личный', 'personal');
    await setSetting(db, 'registration', input.registration);

    return { done: true, existing: false, auth: await issueTokens(user, 'Мастер настройки') };
  });
}
