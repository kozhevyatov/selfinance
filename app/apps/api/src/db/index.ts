import { Kysely, MysqlDialect, SqliteDialect } from 'kysely';
import SQLite from 'better-sqlite3';
import mysql from 'mysql2';
import mysqlPromise from 'mysql2/promise';
import type { DbConfigInput } from '@selfinance/shared';
import { SQLITE_PATH, ensureDataDir } from '../config';
import type { Database } from './types';
import { migrate } from './migrations';

export type DB = Kysely<Database>;

export function createDb(cfg: DbConfigInput): DB {
  if (cfg.type === 'sqlite') {
    ensureDataDir();
    const sqlite = new SQLite(SQLITE_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('busy_timeout = 5000');
    return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
  }
  return new Kysely<Database>({
    dialect: new MysqlDialect({
      pool: mysql.createPool({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        connectionLimit: 8,
        charset: 'utf8mb4',
        supportBigNumbers: true,
        bigNumberStrings: false,
        dateStrings: true,
      }),
    }),
  });
}

/** Для MySQL — создаёт базу, если её ещё нет. Бросает ошибку, если подключиться нельзя. */
export async function prepareDatabase(cfg: DbConfigInput): Promise<void> {
  if (cfg.type !== 'mysql') return;
  const conn = await mysqlPromise.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    connectTimeout: 8000,
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.end();
  }
}

export async function openDb(cfg: DbConfigInput): Promise<DB> {
  await prepareDatabase(cfg);
  const db = createDb(cfg);
  await migrate(db);
  return db;
}
