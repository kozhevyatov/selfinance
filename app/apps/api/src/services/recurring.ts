import { sql } from 'kysely';
import { addDays, daysBetween, daysInMonth, monthOf, shiftMonth, toISODate, type Recurring } from '@selfinance/shared';
import type { DB } from '../db';
import type { RecurringTable } from '../db/types';
import { num, nowIso } from '../lib/util';

/**
 * Дата следующего платежа.
 * Берём последнюю оплату + период (1, 2, 3, 6 или 12 месяцев) или текущий месяц, если оплат ещё не было;
 * пропущенный платёж сдвигает дату на один период; день — из правила, но не больше длины месяца.
 */
export function nextDue(rule: RecurringTable, skips: Set<string>, today: string): string {
  const step = Math.max(1, Number(rule.interval_months) || 1);
  let month: string;
  if (rule.last_paid_date) {
    month = shiftMonth(monthOf(rule.last_paid_date), step);
  } else {
    const created = rule.created_at.slice(0, 10);
    const base = created > today ? today : created;
    month = monthOf(base);
    if (Number(base.slice(8)) > rule.day_of_month) month = shiftMonth(month, 1);
  }
  for (let i = 0; i < 36 && skips.has(month); i++) month = shiftMonth(month, step);
  const [y, m] = month.split('-').map(Number);
  return toISODate(y, m, Math.min(rule.day_of_month, daysInMonth(y, m)));
}

/** Разница в днях: due − today (отрицательная — просрочка). */
export const daysUntil = (today: string, due: string) => (due >= today ? daysBetween(today, due) - 1 : -(daysBetween(due, today) - 1));

export async function loadSkips(db: DB, ids: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!ids.length) return map;
  const rows = await db.selectFrom('recurring_skips').selectAll().where('recurring_id', 'in', ids).execute();
  for (const r of rows) {
    if (!map.has(r.recurring_id)) map.set(r.recurring_id, new Set());
    map.get(r.recurring_id)!.add(r.month);
  }
  return map;
}

export function toRecurring(r: RecurringTable, skips: Set<string>, today: string): Recurring {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    categoryId: r.category_id,
    accountId: r.account_id,
    amount: Number(r.amount),
    amountVaries: !!r.amount_varies,
    dayOfMonth: r.day_of_month,
    dayPinned: !!r.day_pinned,
    intervalMonths: Math.max(1, Number(r.interval_months) || 1),
    remindDays: r.remind_days,
    isPaused: !!r.is_paused,
    lastPaidDate: r.last_paid_date,
    nextDue: nextDue(r, skips, today),
  };
}

export async function getRule(db: DB, budgetId: string, id: string) {
  return db
    .selectFrom('recurring')
    .selectAll()
    .where('id', '=', id)
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

/**
 * Пересчитывает правило по привязанным операциям:
 * последняя дата оплаты, день месяца (если не закреплён), последняя сумма, «сумма плавает».
 */
export async function recomputeRule(db: DB, ruleId: string | null | undefined) {
  if (!ruleId) return;
  const rule = await db.selectFrom('recurring').selectAll().where('id', '=', ruleId).executeTakeFirst();
  if (!rule) return;
  const last = await db
    .selectFrom('transactions')
    .select(['date', 'amount'])
    .where('recurring_id', '=', ruleId)
    .where('deleted_at', 'is', null)
    .orderBy('date', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
  const distinct = await db
    .selectFrom('transactions')
    .select(sql<number>`count(distinct amount)`.as('n'))
    .where('recurring_id', '=', ruleId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  const patch: Partial<RecurringTable> = { last_paid_date: last?.date ?? null, updated_at: nowIso() };
  if (last) {
    patch.amount = Number(last.amount);
    if (!rule.day_pinned) patch.day_of_month = Number(last.date.slice(8));
    if (num(distinct?.n) > 1) patch.amount_varies = 1;
  }
  await db.updateTable('recurring').set(patch).where('id', '=', ruleId).execute();
}

/** Ближайшая похожая операция без привязки (та же категория и тип, ±5 дней от даты платежа). */
export async function findMatch(db: DB, rule: RecurringTable, due: string) {
  if (!rule.category_id) return undefined;
  let q = db
    .selectFrom('transactions')
    .selectAll()
    .where('budget_id', '=', rule.budget_id)
    .where('deleted_at', 'is', null)
    .where('recurring_id', 'is', null)
    .where('type', '=', rule.type)
    .where('category_id', '=', rule.category_id)
    .where('date', '>=', addDays(due, -5))
    .where('date', '<=', addDays(due, 5));
  if (rule.last_paid_date) q = q.where('date', '>', rule.last_paid_date);
  return q.orderBy('date', 'desc').executeTakeFirst();
}
