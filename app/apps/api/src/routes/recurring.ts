import type { FastifyInstance } from 'fastify';
import {
  recurringCreateSchema,
  recurringLinkSchema,
  recurringUpdateSchema,
  todayISO,
  type UpcomingPayment,
} from '@selfinance/shared';
import { getDb } from '../context';
import type { DB } from '../db';
import type { RecurringTable } from '../db/types';
import { requireUser } from '../lib/auth';
import { badRequest, notFound, nowIso, uuidv7 } from '../lib/util';
import { getAccount } from '../services/accounts';
import { requireBudget } from '../services/budgets';
import { daysUntil, findMatch, getRule, loadSkips, nextDue, recomputeRule, toRecurring } from '../services/recurring';
import { toTx } from './transactions';

type P = { budgetId: string; rid: string };

async function checkRefs(db: DB, budgetId: string, type: 'income' | 'expense', categoryId?: string | null, accountId?: string | null) {
  if (categoryId) {
    const cat = await db
      .selectFrom('categories')
      .select(['id', 'type'])
      .where('id', '=', categoryId)
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!cat || cat.type !== type) throw badRequest('Категория не подходит', { categoryId: 'Категория не найдена' });
  }
  if (accountId && !(await getAccount(db, budgetId, accountId))) throw badRequest('Счёт не найден', { accountId: 'Счёт не найден' });
}

export default async function recurringRoutes(app: FastifyInstance) {
  app.get<{ Params: { budgetId: string } }>('/budgets/:budgetId/recurring', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    await requireBudget(db, req.params.budgetId, user.id);
    const rows = await db
      .selectFrom('recurring')
      .selectAll()
      .where('budget_id', '=', req.params.budgetId)
      .where('deleted_at', 'is', null)
      .execute();
    const today = todayISO(user.timezone);
    const skips = await loadSkips(db, rows.map((r) => r.id));
    return rows
      .map((r) => toRecurring(r, skips.get(r.id) ?? new Set(), today))
      .sort((a, b) => (a.isPaused === b.isPaused ? (a.nextDue < b.nextDue ? -1 : 1) : a.isPaused ? 1 : -1));
  });

  /** Ближайшие платежи для плашки на главной. */
  app.get<{ Params: { budgetId: string } }>('/budgets/:budgetId/recurring/upcoming', async (req): Promise<UpcomingPayment[]> => {
    const db = getDb();
    const user = await requireUser(req);
    await requireBudget(db, req.params.budgetId, user.id);
    const rows = await db
      .selectFrom('recurring')
      .selectAll()
      .where('budget_id', '=', req.params.budgetId)
      .where('deleted_at', 'is', null)
      .where('is_paused', '=', 0)
      .execute();
    const today = todayISO(user.timezone);
    const skips = await loadSkips(db, rows.map((r) => r.id));
    const out: UpcomingPayment[] = [];
    for (const r of rows) {
      const s = skips.get(r.id) ?? new Set<string>();
      const due = nextDue(r, s, today);
      const daysLeft = daysUntil(today, due);
      if (daysLeft > r.remind_days) continue;
      const match = await findMatch(db, r, due);
      out.push({ recurring: toRecurring(r, s, today), dueDate: due, daysLeft, match: match ? toTx(match) : null });
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft);
  });

  app.post<{ Params: { budgetId: string } }>('/budgets/:budgetId/recurring', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const input = recurringCreateSchema.parse(req.body);
    const now = nowIso();
    let row: RecurringTable;

    if ('transactionId' in input) {
      const tx = await db
        .selectFrom('transactions')
        .selectAll()
        .where('id', '=', input.transactionId)
        .where('budget_id', '=', budgetId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!tx) throw notFound('Операция не найдена');
      if (tx.type !== 'income' && tx.type !== 'expense') throw badRequest('Регулярным может быть только доход или расход');
      if (tx.recurring_id) {
        const existing = await getRule(db, budgetId, tx.recurring_id);
        if (existing) return toRecurring(existing, new Set(), todayISO(user.timezone));
      }
      let name = input.name?.trim() || tx.comment?.trim() || '';
      if (!name && tx.category_id) {
        const cat = await db.selectFrom('categories').select('name').where('id', '=', tx.category_id).executeTakeFirst();
        name = cat?.name ?? '';
      }
      row = {
        id: uuidv7(), budget_id: budgetId, name: (name || 'Регулярный платёж').slice(0, 100), type: tx.type,
        category_id: tx.category_id, account_id: tx.account_id, amount: Number(tx.amount), amount_varies: 0,
        day_of_month: Number(tx.date.slice(8)), day_pinned: 0, interval_months: input.intervalMonths ?? 1, remind_days: input.remindDays ?? 3, is_paused: 0,
        last_paid_date: tx.date, created_at: now, updated_at: now, deleted_at: null,
      };
      await db.insertInto('recurring').values(row).execute();
      await db.updateTable('transactions').set({ recurring_id: row.id, updated_at: now }).where('id', '=', tx.id).execute();
    } else {
      await checkRefs(db, budgetId, input.type, input.categoryId, input.accountId);
      row = {
        id: uuidv7(), budget_id: budgetId, name: input.name, type: input.type,
        category_id: input.categoryId ?? null, account_id: input.accountId ?? null, amount: input.amount, amount_varies: 0,
        day_of_month: input.dayOfMonth, day_pinned: input.dayPinned ? 1 : 0, interval_months: input.intervalMonths ?? 1, remind_days: input.remindDays ?? 3, is_paused: 0,
        last_paid_date: null, created_at: now, updated_at: now, deleted_at: null,
      };
      await db.insertInto('recurring').values(row).execute();
    }
    return toRecurring(row, new Set(), todayISO(user.timezone));
  });

  app.patch<{ Params: P }>('/budgets/:budgetId/recurring/:rid', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, rid } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const rule = await getRule(db, budgetId, rid);
    if (!rule) throw notFound('Регулярный платёж не найден');
    const input = recurringUpdateSchema.parse(req.body);
    await checkRefs(db, budgetId, rule.type, input.categoryId, input.accountId);
    const patch: Partial<RecurringTable> = { updated_at: nowIso() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.amountVaries !== undefined) patch.amount_varies = input.amountVaries ? 1 : 0;
    if (input.categoryId !== undefined) patch.category_id = input.categoryId ?? null;
    if (input.accountId !== undefined) patch.account_id = input.accountId ?? null;
    if (input.dayOfMonth !== undefined) patch.day_of_month = input.dayOfMonth;
    if (input.dayPinned !== undefined) patch.day_pinned = input.dayPinned ? 1 : 0;
    if (input.intervalMonths !== undefined) patch.interval_months = input.intervalMonths;
    if (input.remindDays !== undefined) patch.remind_days = input.remindDays;
    if (input.isPaused !== undefined) patch.is_paused = input.isPaused ? 1 : 0;
    await db.updateTable('recurring').set(patch).where('id', '=', rid).execute();
    const updated = (await getRule(db, budgetId, rid))!;
    const skips = await loadSkips(db, [rid]);
    return toRecurring(updated, skips.get(rid) ?? new Set(), todayISO(user.timezone));
  });

  /** Удаление правила: операции остаются, просто отвязываются. */
  app.delete<{ Params: P }>('/budgets/:budgetId/recurring/:rid', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, rid } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    if (!(await getRule(db, budgetId, rid))) throw notFound('Регулярный платёж не найден');
    const now = nowIso();
    await db.updateTable('transactions').set({ recurring_id: null }).where('recurring_id', '=', rid).execute();
    await db.updateTable('recurring').set({ deleted_at: now, updated_at: now }).where('id', '=', rid).execute();
    return { ok: true };
  });

  /** Пропустить ближайший платёж. */
  app.post<{ Params: P }>('/budgets/:budgetId/recurring/:rid/skip', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, rid } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const rule = await getRule(db, budgetId, rid);
    if (!rule) throw notFound('Регулярный платёж не найден');
    const skips = (await loadSkips(db, [rid])).get(rid) ?? new Set<string>();
    const month = nextDue(rule, skips, todayISO(user.timezone)).slice(0, 7);
    await db.insertInto('recurring_skips').values({ recurring_id: rid, month }).execute();
    return { skipped: month };
  });

  /** Засчитать существующую операцию как оплату. */
  app.post<{ Params: P }>('/budgets/:budgetId/recurring/:rid/link', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, rid } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const rule = await getRule(db, budgetId, rid);
    if (!rule) throw notFound('Регулярный платёж не найден');
    const { transactionId } = recurringLinkSchema.parse(req.body);
    const tx = await db
      .selectFrom('transactions')
      .select(['id', 'type', 'recurring_id'])
      .where('id', '=', transactionId)
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!tx || tx.type !== rule.type) throw badRequest('Эта операция не подходит');
    await db.updateTable('transactions').set({ recurring_id: rid, updated_at: nowIso() }).where('id', '=', transactionId).execute();
    await recomputeRule(db, tx.recurring_id);
    await recomputeRule(db, rid);
    return { ok: true };
  });
}
