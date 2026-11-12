import type { AppConfig } from './config';
import type { DB } from './db';
import { AppError } from './lib/util';

/** Состояние приложения: до прохождения мастера db и config пусты. */
export const ctx: { db: DB | null; config: AppConfig | null } = { db: null, config: null };

export function getDb(): DB {
  if (!ctx.db) throw new AppError(503, 'SETUP_REQUIRED', 'Сервис ещё не настроен');
  return ctx.db;
}

export function getConfig(): AppConfig {
  if (!ctx.config) throw new AppError(503, 'SETUP_REQUIRED', 'Сервис ещё не настроен');
  return ctx.config;
}
