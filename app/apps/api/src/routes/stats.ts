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
  type Anomaly,
  type Capital,
  type CategoryMatrix,
  type CategoryStat,
  type InsightTx,
  type Insights,
  type Summary,
  isCreditKind,
  matrixQuerySchema,
  splitCapital,
  weekday,
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
  if (from.endsWith('-01-01') && to === from.slice(0, 4) + '-12-31') {
    const year = Number(from.slice(0, 4)) - 1;
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
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


/** Родитель каждой категории бюджета: id → категория верхнего уровня. */
async function topOfFn(db: DB, budgetId: string) {
  const cats = await db.selectFrom('categories').select(['id', 'parent_id', 'exclude_from_limit']).where('budget_id', '=', budgetId).execute();
  const parentOf = new Map<string, string | null>(cats.map((c) => [c.id, c.parent_id]));
  const excluded = new Set(cats.filter((c) => c.exclude_from_limit).map((c) => c.id));
  return {
    topOf: (id: string | null): string | null => (id ? parentOf.get(id) ?? id : null),
    isExcluded: (id: string | null) => !!id && (excluded.has(id) || excluded.has(parentOf.get(id) ?? '')),
  };
}

/** Дата первой операции бюджета (null — операций ещё нет). */
async function firstTxDate(db: DB, budgetId: string): Promise<string | null> {
  const r = await db
    .selectFrom('transactions')
    .select(sql<string | null>`min(date)`.as('d'))
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return r?.d ?? null;
}

/** Расходы по категориям верхнего уровня за период. */
async function expenseByTop(db: DB, budgetId: string, from: string, to: string, f: F, topOf: (id: string | null) => string | null) {
  const q = db
    .selectFrom('transactions')
    .select(['category_id', sql<number>`sum(amount)`.as('total')])
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .where('type', '=', 'expense')
    .where('date', '>=', from)
    .where('date', '<=', to);
  const rows = await applyF(q, f).groupBy('category_id').execute();
  const m = new Map<string | null, number>();
  for (const r of rows) {
    const k = topOf(r.category_id);
    m.set(k, (m.get(k) ?? 0) + num(r.total));
  }
  return m;
}

/** Порог «заметного» отклонения категории: не меньше 500 ₽ и 3% от обычных расходов периода. */
const ANOMALY_MIN = 50000;
const ANOMALY_PCT = 0.2;

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

    const flows = await applyF(db.selectFrom('transactions')
      .select([sql<string>`substr(date, 1, 7)`.as('month'), 'type', sql<number>`sum(amount)`.as('total')])
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .where('date', '>=', from)
      .where('date', '<=', end)
      .where('type', 'in', ['income', 'expense']), f)
      .groupBy([sql`substr(date, 1, 7)`, 'type'])
      .execute();

    // балансы счетов на конец каждого месяца — для разбивки на свободные / замороженные / долг
    const accRows = await db
      .selectFrom('accounts')
      .select(['id', 'kind', 'is_frozen'])
      .where('budget_id', '=', budgetId)
      .execute();
    const accKind = new Map(accRows.map((a) => [a.id, a]));
    const outRows = await db
      .selectFrom('transactions')
      .select([
        'account_id',
        sql<string>`substr(date, 1, 7)`.as('month'),
        sql<number>`sum(case when type in ('income', 'adjustment') then amount when type in ('expense', 'transfer') then -amount else 0 end)`.as('total'),
      ])
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .where('date', '<=', end)
      .groupBy(['account_id', sql`substr(date, 1, 7)`])
      .execute();
    const inRows = await db
      .selectFrom('transactions')
      .select(['to_account_id', sql<string>`substr(date, 1, 7)`.as('month'), sql<number>`sum(amount)`.as('total')])
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .where('type', '=', 'transfer')
      .where('to_account_id', 'is not', null)
      .where('date', '<=', end)
      .groupBy(['to_account_id', sql`substr(date, 1, 7)`])
      .execute();
    const deltas: { acc: string; month: string; v: number }[] = [
      ...outRows.map((r) => ({ acc: r.account_id, month: r.month, v: num(r.total) })),
      ...inRows.filter((r) => r.to_account_id).map((r) => ({ acc: r.to_account_id!, month: r.month, v: num(r.total) })),
    ].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
    const bal = new Map<string, number>();
    let di = 0;
    const splitAt = (month: string) => {
      for (; di < deltas.length && deltas[di].month <= month; di++) bal.set(deltas[di].acc, (bal.get(deltas[di].acc) ?? 0) + deltas[di].v);
      let free = 0;
      let frozen = 0;
      let debt = 0;
      for (const [id, b] of bal) {
        const a = accKind.get(id);
        if (a && isCreditKind(a.kind)) {
          if (b > 0) free += b;
          else debt -= b;
        } else if (a?.is_frozen) frozen += b;
        else free += b;
      }
      return { free, frozen, debt };
    };

    const out: DynamicsPoint[] = [];
    for (let i = 0; i < months; i++) {
      const month = shiftMonth(firstMonth, i);
      const get = (type: string) => num(flows.find(r => r.month === month && r.type === type)?.total);
      const split = splitAt(month);
      out.push({ month, income: get('income'), expense: get('expense'), capital: split.free + split.frozen - split.debt, ...split });
    }
    return out;
  });
  /** Подробности периода: дни недели, крупнейшие операции, обязательные/свободные, аномалии категорий. */
  app.get<{ Params: { budgetId: string } }>('/budgets/:budgetId/stats/insights', async (req): Promise<Insights> => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id);
    const query = rangeQuerySchema.parse(req.query);
    const { from, to } = query;
    if (from > to) throw badRequest('Начало периода позже конца');
    if (daysBetween(from, to) > 3700) throw badRequest('Слишком длинный период');
    const f = await makeFilter(db, budgetId, query);
    const today = todayISO(user.timezone);
    const cats = await topOfFn(db, budgetId);

    const base = () =>
      db
        .selectFrom('transactions')
        .where('budget_id', '=', budgetId)
        .where('deleted_at', 'is', null)
        .where('date', '>=', from)
        .where('date', '<=', to);

    const counts = await applyF(base().where('type', 'in', ['income', 'expense']).where('transfer_group_id', 'is', null), f)
      .select(['type', 'category_id', sql<number>`count(*)`.as('n'), sql<number>`sum(amount)`.as('total')])
      .groupBy(['type', 'category_id']).execute();
    const categoryCounts = { income: new Map<string | null, number>(), expense: new Map<string | null, number>() };
    let expenseTotal = 0;
    const operationCounts = { expense: 0, income: 0 };
    for (const r of counts) {
      if (r.type !== 'income' && r.type !== 'expense') continue;
      const id = query.categoryId ? r.category_id : cats.topOf(r.category_id);
      const map = categoryCounts[r.type];
      const n = num(r.n);
      map.set(id, (map.get(id) ?? 0) + n);
      operationCounts[r.type] += n;
      if (r.type === 'expense') expenseTotal += num(r.total);
    }
    const expenseCount = operationCounts.expense;
    const rank = (map: Map<string | null, number>) => [...map].map(([categoryId, count]) => ({ categoryId, count }))
      .sort((a, b) => b.count - a.count || (a.categoryId ?? '').localeCompare(b.categoryId ?? '')).slice(0, 10);
    const frequentCategories = { expense: rank(categoryCounts.expense), income: rank(categoryCounts.income) };

    // дни недели: сумма расходов и сколько таких дней в периоде (по сегодня)
    const daily = await applyF(base().select(['date', sql<number>`sum(amount)`.as('total')]).where('type', '=', 'expense'), f)
      .groupBy('date')
      .execute();
    const wd = Array.from({ length: 7 }, (_, i) => ({ weekday: i, total: 0, days: 0, avg: 0 }));
    for (const r of daily) {
      if (r.date <= today) wd[weekday(r.date)].total += num(r.total);
    }
    const last = today < to ? today : to;
    if (last >= from) {
      const n = daysBetween(from, last);
      const w0 = weekday(from);
      for (let i = 0; i < 7; i++) wd[(w0 + i) % 7].days = Math.floor(n / 7) + (i < n % 7 ? 1 : 0);
    }
    for (const w of wd) w.avg = w.days ? Math.round(w.total / w.days) : 0;

    // крупнейшие операции
    const top = async (type: 'expense' | 'income'): Promise<InsightTx[]> => {
      const rows = await applyF(
        base().select(['id', 'date', 'amount', 'category_id', 'account_id', 'comment']).where('type', '=', type).where('transfer_group_id', 'is', null),
        f,
      )
        .orderBy('amount', 'desc')
        .orderBy('date', 'desc')
        .orderBy('id', 'desc')
        .limit(10)
        .execute();
      return rows.map((r) => ({ id: r.id, date: r.date, amount: num(r.amount), categoryId: r.category_id, accountId: r.account_id, comment: r.comment }));
    };

    // обязательные / свободные
    const mrows = await applyF(
      base()
        .select(['category_id', sql<number>`case when recurring_id is null then 0 else 1 end`.as('is_rec'), 'planned_id', sql<number>`sum(amount)`.as('total')])
        .where('type', '=', 'expense'),
      f,
    )
      .groupBy(['category_id', sql`case when recurring_id is null then 0 else 1 end`, 'planned_id'])
      .execute();
    const mandatory = { regular: 0, excludedCats: 0, planned: 0, free: 0 };
    for (const r of mrows) {
      const a = num(r.total);
      if (num(r.is_rec) === 1) mandatory.regular += a;
      else if (cats.isExcluded(r.category_id)) mandatory.excludedCats += a;
      else if (r.planned_id) mandatory.planned += a;
      else mandatory.free += a;
    }

    // аномалии: категории против среднего за 3 прошлых периода
    const anomalies: Anomaly[] = [];
    let anomalyPeriods = 0;
    const isCurrent = today >= from && today <= to;
    const daysTotal = daysBetween(from, to);
    const daysElapsed = isCurrent ? daysBetween(from, today) : daysTotal;
    const first = await firstTxDate(db, budgetId);
    if (first && today >= from && daysElapsed >= 3) {
      const curMap = await expenseByTop(db, budgetId, from, last, f, cats.topOf);
      const sum = new Map<string | null, number>();
      let r = { from, to };
      for (let i = 0; i < 3; i++) {
        r = previousRange(r.from, r.to);
        if (r.to < first) break; // раньше бюджет не вёлся
        anomalyPeriods++;
        // для текущего периода сравниваем с тем же числом дней прошлого
        const end = isCurrent ? addDays(r.from, daysElapsed - 1) : r.to;
        const m = await expenseByTop(db, budgetId, r.from, end < r.to ? end : r.to, f, cats.topOf);
        for (const [k, v] of m) sum.set(k, (sum.get(k) ?? 0) + v);
      }
      if (anomalyPeriods) {
        const keys = new Set([...curMap.keys(), ...sum.keys()]);
        const avgTotal = [...sum.values()].reduce((a, b) => a + b, 0) / anomalyPeriods;
        const minDiff = Math.max(ANOMALY_MIN, Math.round(avgTotal * 0.03));
        for (const k of keys) {
          const amount = curMap.get(k) ?? 0;
          const expected = Math.round((sum.get(k) ?? 0) / anomalyPeriods);
          const diff = amount - expected;
          const pct = expected ? diff / expected : null;
          if (Math.abs(diff) < minDiff) continue;
          if (pct !== null && Math.abs(pct) < ANOMALY_PCT) continue;
          anomalies.push({ categoryId: k, amount, expected, diff, pct: pct === null ? null : Math.round(pct * 100) / 100 });
        }
        anomalies.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        anomalies.splice(8);
      }
    }

    return {
      from,
      to,
      expenseCount,
      incomeCount: operationCounts.income,
      frequentCategories,
      avgExpense: expenseCount ? Math.round(expenseTotal / expenseCount) : 0,
      weekdays: wd,
      topExpense: await top('expense'),
      topIncome: await top('income'),
      mandatory,
      anomalies,
      anomalyPeriods,
    };
  });

  /** Категории × месяцы: траты каждой категории (или подкатегорий выбранной) по месяцам. */
  app.get<{ Params: { budgetId: string } }>('/budgets/:budgetId/stats/matrix', async (req): Promise<CategoryMatrix> => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id);
    const query = matrixQuerySchema.parse(req.query);
    const { to, months, type } = query;
    const f = await makeFilter(db, budgetId, query);
    const cats = await topOfFn(db, budgetId);
    const firstMonth = shiftMonth(to, -(months - 1));
    const from = monthRange(firstMonth).from;
    const end = monthRange(to).to;
    const list = Array.from({ length: months }, (_, i) => shiftMonth(firstMonth, i));

    const q = db
      .selectFrom('transactions')
      .select([sql<string>`substr(date, 1, 7)`.as('month'), 'category_id', sql<number>`sum(amount)`.as('total')])
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .where('type', '=', type)
      .where('date', '>=', from)
      .where('date', '<=', end);
    const rows = await applyF(q, f)
      .groupBy([sql`substr(date, 1, 7)`, 'category_id'])
      .execute();

    // с фильтром по категории строки — её подкатегории, иначе — категории верхнего уровня
    const key = (id: string | null) => (query.categoryId ? id : cats.topOf(id));
    const map = new Map<string | null, number[]>();
    for (const r of rows) {
      const i = list.indexOf(r.month);
      if (i < 0) continue;
      const k = key(r.category_id);
      let v = map.get(k);
      if (!v) map.set(k, (v = new Array(months).fill(0)));
      v[i] += num(r.total);
    }

    const first = await firstTxDate(db, budgetId);
    const today = todayISO(user.timezone).slice(0, 7);
    const activeMonths = list.filter((m) => (!first || m >= first.slice(0, 7)) && m <= today).length;
    const out = [...map.entries()].map(([categoryId, values]) => {
      const total = values.reduce((a, b) => a + b, 0);
      return { categoryId, values, total, avg: activeMonths ? Math.round(total / activeMonths) : 0, max: Math.max(...values) };
    });
    out.sort((a, b) => b.total - a.total);
    return { months: list, activeMonths, rows: out };
  });
}
