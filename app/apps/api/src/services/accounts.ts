import { sql } from 'kysely';
import type { Account } from '@selfinance/shared';
import type { DB } from '../db';
import type { AccountsTable } from '../db/types';
import { num } from '../lib/util';

/** Балансы всех счетов бюджета, вычисленные из операций. */
export async function accountBalances(db: DB, budgetId: string): Promise<Map<string, number>> {
  const out = await db
    .selectFrom('transactions')
    .select([
      'account_id',
      sql<number>`sum(case when type in ('income', 'adjustment') then amount when type in ('expense', 'transfer') then -amount else 0 end)`.as('total'),
    ])
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .groupBy('account_id')
    .execute();

  const inc = await db
    .selectFrom('transactions')
    .select(['to_account_id', sql<number>`sum(amount)`.as('total')])
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .where('type', '=', 'transfer')
    .where('to_account_id', 'is not', null)
    .groupBy('to_account_id')
    .execute();

  const map = new Map<string, number>();
  for (const r of out) map.set(r.account_id, num(r.total));
  for (const r of inc) if (r.to_account_id) map.set(r.to_account_id, (map.get(r.to_account_id) ?? 0) + num(r.total));
  return map;
}

export function toAccount(a: AccountsTable, balance: number): Account {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    isFrozen: !!a.is_frozen,
    bankName: a.bank_name,
    parentAccountId: a.parent_account_id,
    color: a.color,
    icon: a.icon,
    note: a.note,
    sort: a.sort,
    isArchived: !!a.is_archived,
    balance,
  };
}

export async function listAccounts(db: DB, budgetId: string, includeArchived = false): Promise<Account[]> {
  let q = db.selectFrom('accounts').selectAll().where('budget_id', '=', budgetId).where('deleted_at', 'is', null);
  if (!includeArchived) q = q.where('is_archived', '=', 0);
  const rows = await q.orderBy('sort').orderBy('created_at').execute();
  const balances = await accountBalances(db, budgetId);
  return rows.map((r) => toAccount(r, balances.get(r.id) ?? 0));
}

export async function getAccount(db: DB, budgetId: string, id: string) {
  return db
    .selectFrom('accounts')
    .selectAll()
    .where('id', '=', id)
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}
