import type { FastifyInstance } from 'fastify';
import { sql, type SelectQueryBuilder } from 'kysely';
import {
  addDays,
  dynamicsQuerySchema,
  type DynamicsPoint,
  daysBetween,
  daysInMonth,
  parseISODate,
  rangeQuerySchema,
  shiftMonth,
  monthRange,
  todayISO,
  type Capital,
  type CategoryStat,
  type Summary,
  splitCapital,
} from '@selfinance/shared';
import { getDb } from '../context';
import type { DB } from '../db';
import type { Database } from '../db/types';
import { requireUser } from '../lib/auth';
import { badRequest, num } from '../lib/util';
import { listAccounts } from '../services/accounts';
import { requireBudget } from '../services/budgets';
import { expectedIncome } from '../services/planned';

/** Категория вместе с подкатегориями — для фильтра статистики. undefined — без фильтра. */
async function categorySet(db: DB, budgetId: string, categoryId?: string): Promise<string[] | undefined> {
  if (!categoryId) return undefined;
  const rows = await db
    .selectFrom('categories')
    .select('id')
    .where('budget_id', '=', budgetId)
    .where((eb) => eb.or([eb('id', '=', categoryId), eb('parent_id', '=', categoryId)]))
    .execute();
  if (!rows.length) throw badRequest('Категория не найдена');
  return rows.map((r) => r.id);
}

/** Фильтр статистики: категории (с подкатегориями), счёт, кто внёс операцию. */
interface F {
  cats?: string[];
  accountId?: string;
  userId?: string;
}

function applyF<O>(q: SelectQueryBuilder<Database, 'transactions', O>, f: F): SelectQueryBuilder<Database, 'transactions', O> {
  if (f.cats) q = q.where('category_id', 'in', f.cats);
  if (f.accountId) q = q.where('account_id', '=', f.accountId);
  if (f.userId) q = q.where('created_by', '=', f.userId);
  return q;
}

async function makeFilter(db: DB, budgetId: string, q: { categoryId?: string; accountId?: string; userId?: string }): Promise<F> {
  return { cats: await categorySet(db, budgetId, q.categoryId), accountId: q.accountId, userId: q.userId };
}

const hasFilter = (f: F) => !!(f.cats || f.accountId || f.userId);

async function totals(db: DB, budgetId: string, from: string, to: string, f: F) {
  const base = () =>
    db
      .selectFrom('transactions')
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .where('date', '>=', from)
      .where('date', '<=', to);
  const rows = await applyF(base().select(['type', sql<number>`sum(amount)`.as('total')]).where('transfer_group_id', 'is', null), f)
    .groupBy('type')
    .execute();
  // переводы между бюджетами — отдельно: «получено из других бюджетов» / «передано в другие»
  const cross = f.cats
    ? undefined
    : await applyF(
        base()
          .select([
            sql<number>`sum(case when amount > 0 then amount else 0 end)`.as('pos'),
            sql<number>`sum(case when amount < 0 then -amount else 0 end)`.as('neg'),
          ])
          .where('transfer_group_id', 'is not', null),
        f,
      ).executeTakeFirst();
  const get = (t: string) => num(rows.find((r) => r.type === t)?.total);
  const income = get('income');
  const expense = get('expense');
  return { income, expense, net: income - expense, adjustments: get('adjustment'), crossIn: num(cross?.pos), crossOut: num(cross?.neg) };
}

/** Целый календарный месяц? */
function isWholeMonth(from: string, to: string) {
  const a = parseISODate(from);
  const b = parseISODate(to);
  return a.d === 1 && a.y === b.y && a.m === b.m && b.d === daysInMonth(b.y, b.m);
}

function previousRange(from: string, to: string) {
  if (isWholeMonth(from, to)) return monthRange(shiftMonth(from.slice(0, 7), -1));
  const len = daysBetween(from, to);
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

async function byCategory(db: DB, budgetId: string, from: string, to: string, type: 'income' | 'expense', f: F): Promise<CategoryStat[]> {
  const q = db
    .selectFrom('transactions')
    .select(['category_id', sql<number>`sum(amount)`.as('total')])
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .where('type', '=', type)
    .where('date', '>=', from)
    .where('date', '<=', to);
  const rows = await applyF(q, f).groupBy('category_id').execute();
  const allCats = await db.selectFrom('categories').select(['id', 'parent_id']).where('budget_id', '=', budgetId).execute();
  const parentOf = new Map(allCats.map((c) => [c.id, c.parent_id]));

  const top = new Map<string | null, CategoryStat>();
  for (const r of rows) {
    const amount = num(r.total);
    const cid = r.category_id;
    const parent = cid ? parentOf.get(cid) ?? null : null;
    const key = parent ?? cid ?? null;
    let s = top.get(key);
    if (!s) top.set(key, (s = { categoryId: key, amount: 0, subs: [] }));
    s.amount += amount;
    if (parent && cid) s.subs.push({ categoryId: cid, amount });
  }
  const list = [...top.values()];
  list.forEach((s) => s.subs.sort((a, b) => b.amount - a.amount));
  return list.sort((a, b) => b.amount - a.amount);
}

export default async function statsRoutes(app: FastifyInstance) {
  app.get<{ Params: { budgetId: string } }>('/budgets/:budgetId/stats/summary', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id);
    const query = rangeQuerySchema.parse(req.query);
    const { from, to } = query;
    const f = await makeFilter(db, budgetId, query);
    if (from > to) throw badRequest('Начало периода позже конца');
    if (daysBetween(from, to) > 3700) throw badRequest('Слишком длинный период');

    const today = todayISO(user.timezone);
    const cur = await totals(db, budgetId, from, to, f);
    const prevRange = previousRange(from, to);
    const prev = await totals(db, budgetId, prevRange.from, prevRange.to, f);

    const daysTotal = daysBetween(from, to);
    const isCurrent = today >= from && today <= to;
    const daysElapsed = today < from ? 0 : isCurrent ? daysBetween(from, today) : daysTotal;

    // для текущего периода сравниваем с тем же числом дней прошлого
    let prevToDate: Summary['prevToDate'] = null;
    if (isCurrent) {
      const end = addDays(prevRange.from, daysElapsed - 1);
      const t = await totals(db, budgetId, prevRange.from, end < prevRange.to ? end : prevRange.to, f);
      prevToDate = { income: t.income, expense: t.expense, net: t.net };
    }

    const avgPerDay = daysElapsed ? Math.round(cur.expense / daysElapsed) : 0;

    const dailyQ = db
      .selectFrom('transactions')
      .select(['date', 'type', sql<number>`sum(amount)`.as('total')])
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .where('type', 'in', ['income', 'expense'])
      .where('date', '>=', from)
      .where('date', '<=', to);
    const dailyRows = await applyF(dailyQ, f).groupBy(['date', 'type']).execute();
    const dailyMap = new Map<string, { date: string; expense: number; income: number }>();
    if (daysTotal <= 400) {
      for (let d = from; d <= to; d = addDays(d, 1)) dailyMap.set(d, { date: d, expense: 0, income: 0 });
    }
    for (const r of dailyRows) {
      const e = dailyMap.get(r.date) ?? { date: r.date, expense: 0, income: 0 };
      if (r.type === 'expense') e.expense += num(r.total);
      else e.income += num(r.total);
      dailyMap.set(r.date, e);
    }

    const summary: Summary = {
      from,
      to,
      ...cur,
      prev: { ...prevRange, income: prev.income, expense: prev.expense, net: prev.net },
      prevToDate,
      daysTotal,
      daysElapsed,
      avgPerDay,
      avgPerWeek: avgPerDay * 7,
      forecastExpense: isCurrent ? avgPerDay * daysTotal : null,
      expectedIncome: await expectedIncome(db, budgetId, from, to, today, cur.income, f),
      daily: [...dailyMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
      expenseByCategory: await byCategory(db, budgetId, from, to, 'expense', f),
      incomeByCategory: await byCategory(db, budgetId, from, to, 'income', f),
    };
    return summary;
  });

  app.get<{ Params: { budgetId: string } }>('/budgets/:budgetId/stats/capital', async (req): Promise<Capital> => {
    const db = getDb();
    const user = await requireUser(req);
    await requireBudget(db, req.params.budgetId, user.id);
    const accounts = await listAccounts(db, req.params.budgetId);
    return { ...splitCapital(accounts), accounts };
  });

  /** Помесячная динамика: приход, расход и капитал (все счета) на конец каждого месяца. */
  app.get<{ Params: { budgetId: string } }>('/budgets/:budgetId/stats/dynamics', async (req): Promise<DynamicsPoint[]> => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id);
    const query = dynamicsQuerySchema.parse(req.query);
    const { to, months } = query;
    const f = await makeFilter(db, budgetId, query);
    const firstMonth = shiftMonth(to, -(months - 1));
    const from = monthRange(firstMonth).from;
    const end = monthRange(to).to;

    // капитал до начала периода: доходы + корректировки − расходы (переводы внутри бюджета дают ноль)
    const before = await db
      .selectFrom('transactions')
      .select(sql<number>`sum(case when type in ('income', 'adjustment') then amount when type = 'expense' then -amount else 0 end)`.as('total'))
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .where('date', '<', from)
      .executeTakeFirst();

    const rows = await db
      .selectFrom('transactions')
      .select([sql<string>`substr(date, 1, 7)`.as('month'), 'type', sql<number>`sum(amount)`.as('total')])
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .where('date', '>=', from)
      .where('date', '<=', end)
      .where('type', 'in', ['income', 'expense', 'adjustment'])
      .groupBy([sql`substr(date, 1, 7)`, 'type'])
      .execute();

    // с фильтром приход/расход считаем только по нему, капитал — по всему бюджету
    let catRows = rows;
    if (hasFilter(f)) {
      const q = db
        .selectFrom('transactions')
        .select([sql<string>`substr(date, 1, 7)`.as('month'), 'type', sql<number>`sum(amount)`.as('total')])
        .where('budget_id', '=', budgetId)
        .where('deleted_at', 'is', null)
        .where('date', '>=', from)
        .where('date', '<=', end)
        .where('type', 'in', ['income', 'expense']);
      catRows = await applyF(q, f)
        .groupBy([sql`substr(date, 1, 7)`, 'type'])
        .execute();
    }

    let capital = num(before?.total);
    const out: DynamicsPoint[] = [];
    for (let i = 0; i < months; i++) {
      const month = shiftMonth(firstMonth, i);
      const get = (t: string) => num(rows.find((r) => r.month === month && r.type === t)?.total);
      capital += get('income') - get('expense') + get('adjustment');
      const getCat = (t: string) => num(catRows.find((r) => r.month === month && r.type === t)?.total);
      out.push({ month, income: getCat('income'), expense: getCat('expense'), capital });
    }
    return out;
  });
}
