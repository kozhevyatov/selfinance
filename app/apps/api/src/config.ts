import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DbConfigInput } from '@selfinance/shared';

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
export const PORT = Number(process.env.PORT ?? 1444);
declare const __APP_VERSION__: string | undefined;
/** Версия вшивается при сборке из app/package.json; при разработке (tsx) — из npm. */
export const VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : process.env.npm_package_version ?? '0.0.0-dev';

/** Откуда проверять обновления: репозиторий GitHub и ветка. UPDATE_CHECK=0 — не проверять. */
export const UPDATE_REPO = process.env.UPDATE_REPO ?? 'kozhevyatov/selfinance';
export const UPDATE_BRANCH = process.env.UPDATE_BRANCH ?? 'main';
export const UPDATE_CHECK = !['0', 'false', 'off', 'no'].includes((process.env.UPDATE_CHECK ?? '').toLowerCase());

const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

export interface AppConfig {
  db: DbConfigInput;
  jwtSecret: string;
  createdAt: string;
}

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadConfig(): AppConfig | null {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw) as AppConfig;
  } catch {
    return null;
  }
}

export function saveConfig(db: DbConfigInput): AppConfig {
  ensureDataDir();
  const config: AppConfig = {
    db,
    jwtSecret: crypto.randomBytes(48).toString('base64url'),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
  return config;
}

export const SQLITE_PATH = path.join(DATA_DIR, 'selfinance.db');
