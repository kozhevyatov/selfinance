import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyError } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { PORT, VERSION, loadConfig } from './config';
import { ctx } from './context';
import { openDb } from './db';
import { AppError } from './lib/util';
import setupRoutes from './routes/setup';
import authRoutes from './routes/auth';
import budgetRoutes from './routes/budgets';
import accountRoutes from './routes/accounts';
import categoryRoutes from './routes/categories';
import transactionRoutes from './routes/transactions';
import statsRoutes from './routes/stats';
import adminRoutes from './routes/admin';
import recurringRoutes from './routes/recurring';
import limitRoutes from './routes/limits';
import plannedRoutes from './routes/planned';

const here = path.dirname(fileURLToPath(import.meta.url));
// в контейнере: /app/api/server.js → /app/web; при разработке фронт отдаёт Vite
const WEB_DIR = process.env.WEB_DIR ?? path.resolve(here, '../web');

async function main() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
  });

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, fields: err.fields } });
    }
    if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join('.') || '_';
        if (!fields[key]) fields[key] = issue.message;
      }
      return reply.status(400).send({ error: { code: 'VALIDATION', message: 'Проверьте поля', fields } });
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.status(status).send({
      error: { code: (err as FastifyError).code ?? 'INTERNAL', message: status >= 500 ? 'Внутренняя ошибка сервера' : err.message },
    });
  });

  app.get('/api/health', async () => ({ ok: true, version: VERSION, setupDone: !!ctx.db }));

  await app.register(
    async (api) => {
      await api.register(setupRoutes);
      await api.register(authRoutes);
      await api.register(budgetRoutes);
      await api.register(accountRoutes);
      await api.register(categoryRoutes);
      await api.register(transactionRoutes);
      await api.register(statsRoutes);
      await api.register(adminRoutes);
      await api.register(recurringRoutes);
      await api.register(limitRoutes);
      await api.register(plannedRoutes);
    },
    { prefix: '/api/v1' },
  );

  const hasWeb = fs.existsSync(path.join(WEB_DIR, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: WEB_DIR,
      prefix: '/',
      wildcard: false,
      cacheControl: false,
      setHeaders(res: { setHeader: (k: string, v: string) => void }, filePath: string) {
        // файлы с хешем в имени не меняются — кешируем надолго; остальное всегда проверяем
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
        if (filePath.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/');
      },
    });
  }
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || !hasWeb || req.method !== 'GET') {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Не найдено' } });
    }
    // SPA: любые другие пути отдают index.html
    return reply.sendFile('index.html');
  });

  const config = loadConfig();
  if (config) {
    try {
      ctx.db = await openDb(config.db);
      ctx.config = config;
      app.log.info(`БД подключена (${config.db.type})`);
    } catch (e) {
      app.log.error(e, 'Не удалось подключиться к БД из config.json');
      throw e;
    }
  } else {
    app.log.info('config.json не найден — откройте сервис в браузере и пройдите мастер настройки');
  }

  await app.listen({ host: '0.0.0.0', port: PORT });

  const shutdown = async () => {
    await app.close();
    await ctx.db?.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
