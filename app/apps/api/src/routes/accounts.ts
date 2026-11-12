import type { FastifyInstance } from 'fastify';
import { accountCreateSchema, accountUpdateSchema, reconcileSchema, todayISO } from '@selfinance/shared';
import { getDb } from '../context';
import { requireUser } from '../lib/auth';
import { badRequest, notFound, nowIso, uuidv7 } from '../lib/util';
import { accountBalances, getAccount, listAccounts, toAccount } from '../services/accounts';
import { requireBudget } from '../services/budgets';

type P = { budgetId: string; accountId: string };

export default async function accountRoutes(app: FastifyInstance) {
  app.get<{ Params: { budgetId: string }; Querystring: { archived?: string } }>('/budgets/:budgetId/accounts', async (req) => {
    const user = await requireUser(req);
    await requireBudget(getDb(), req.params.budgetId, user.id);
    return listAccounts(getDb(), req.params.budgetId, req.query.archived === '1');
  });

  app.post<{ Params: { budgetId: string } }>('/budgets/:budgetId/accounts', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const input = accountCreateSchema.parse(req.body);
    if (input.parentAccountId && !(await getAccount(db, budgetId, input.parentAccountId))) {
      throw badRequest('Родительский счёт не найден');
    }
    const now = nowIso();
    const maxSort = await db.selectFrom('accounts').select((eb) => eb.fn.max('sort').as('m')).where('budget_id', '=', budgetId).executeTakeFirst();
    const row = {
      id: uuidv7(),
      budget_id: budgetId,
      name: input.name,
      kind: input.kind,
      is_frozen: (input.isFrozen ?? (input.kind === 'deposit' || input.kind === 'savings')) ? 1 : 0,
      parent_account_id: input.parentAccountId ?? null,
      bank_name: input.bankName ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      sort: Number(maxSort?.m ?? 0) + 1,
      is_archived: 0,
      note: input.note ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    await db.insertInto('accounts').values(row).execute();
    if (input.initialBalance) {
      await db
        .insertInto('transactions')
        .values({
          id: uuidv7(), budget_id: budgetId, type: 'adjustment', amount: input.initialBalance, date: todayISO(user.timezone), time: null,
          account_id: row.id, to_account_id: null, category_id: null, comment: 'Начальный остаток', created_by: user.id,
          transfer_group_id: null, recurring_id: null, created_at: now, updated_at: now, deleted_at: null,
        })
        .execute();
    }
    return toAccount(row, input.initialBalance ?? 0);
  });

  app.patch<{ Params: P }>('/budgets/:budgetId/accounts/:accountId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, accountId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const acc = await getAccount(db, budgetId, accountId);
    if (!acc) throw notFound('Счёт не найден');
    const input = accountUpdateSchema.parse(req.body);
    if (input.parentAccountId === accountId) throw badRequest('Счёт не может быть вложен сам в себя');
    const patch: Record<string, unknown> = { updated_at: nowIso() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.isFrozen !== undefined) patch.is_frozen = input.isFrozen ? 1 : 0;
    if (input.bankName !== undefined) patch.bank_name = input.bankName ?? null;
    if (input.parentAccountId !== undefined) patch.parent_account_id = input.parentAccountId ?? null;
    if (input.color !== undefined) patch.color = input.color ?? null;
    if (input.icon !== undefined) patch.icon = input.icon ?? null;
    if (input.note !== undefined) patch.note = input.note ?? null;
    if (input.isArchived !== undefined) patch.is_archived = input.isArchived ? 1 : 0;
    if (input.sort !== undefined) patch.sort = input.sort;
    await db.updateTable('accounts').set(patch).where('id', '=', accountId).execute();
    const updated = (await getAccount(db, budgetId, accountId))!;
    const balances = await accountBalances(db, budgetId);
    return toAccount(updated, balances.get(accountId) ?? 0);
  });

  /** Удаление: если по счёту есть операции — счёт архивируется. */
  app.delete<{ Params: P }>('/budgets/:budgetId/accounts/:accountId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, accountId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const acc = await getAccount(db, budgetId, accountId);
    if (!acc) throw notFound('Счёт не найден');
    const used = await db
      .selectFrom('transactions')
      .select('id')
      .where('deleted_at', 'is', null)
      .where((eb) => eb.or([eb('account_id', '=', accountId), eb('to_account_id', '=', accountId)]))
      .limit(1)
      .executeTakeFirst();
    const now = nowIso();
    if (used) {
      await db.updateTable('accounts').set({ is_archived: 1, updated_at: now }).where('id', '=', accountId).execute();
      return { archived: true };
    }
    await db.updateTable('accounts').set({ deleted_at: now, updated_at: now }).where('id', '=', accountId).execute();
    return { deleted: true };
  });

  /** Сверка: фактический остаток → корректировка на разницу. */
  app.post<{ Params: P }>('/budgets/:budgetId/accounts/:accountId/reconcile', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, accountId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    if (!(await getAccount(db, budgetId, accountId))) throw notFound('Счёт не найден');
    const { actualBalance, date } = reconcileSchema.parse(req.body);
    const current = (await accountBalances(db, budgetId)).get(accountId) ?? 0;
    const diff = actualBalance - current;
    if (diff !== 0) {
      const now = nowIso();
      await db
        .insertInto('transactions')
        .values({
          id: uuidv7(), budget_id: budgetId, type: 'adjustment', amount: diff, date: date ?? todayISO(user.timezone), time: null,
          account_id: accountId, to_account_id: null, category_id: null, comment: 'Сверка баланса', created_by: user.id,
          transfer_group_id: null, recurring_id: null, created_at: now, updated_at: now, deleted_at: null,
        })
        .execute();
    }
    return { balance: actualBalance, adjustment: diff };
  });
}
