import type { RegistrationMode } from '@selfinance/shared';
import type { DB } from '../db';

export async function getSetting(db: DB, name: string): Promise<string | null> {
  const row = await db.selectFrom('settings').select('value').where('name', '=', name).executeTakeFirst();
  return row?.value ?? null;
}

export async function setSetting(db: DB, name: string, value: string) {
  const exists = await db.selectFrom('settings').select('name').where('name', '=', name).executeTakeFirst();
  if (exists) await db.updateTable('settings').set({ value }).where('name', '=', name).execute();
  else await db.insertInto('settings').values({ name, value }).execute();
}

export async function getRegistrationMode(db: DB): Promise<RegistrationMode> {
  const v = await getSetting(db, 'registration');
  return v === 'open' || v === 'invite' || v === 'closed' ? v : 'closed';
}
