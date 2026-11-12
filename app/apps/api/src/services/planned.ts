import {
  daysInMonth,
  monthOf,
  shiftMonth,
  toISODate,
  type ForecastStep,
  type Planned,
  type PlannedItem,
  type PlannedOverview,
} from '@selfinance/shared';
import type { DB } from '../db';
import type { PlannedTable, RecurringTable } from '../db/types';
import { nowIso } from '../lib/util';
import { listAccounts } from './accounts';
import { daysUntil, loadSkips, nextDue } from './recurring';

export async function getPlan(db: DB, budgetId: string, id: string) {
  return db
    .selectFrom('planned')
    .selectAll()
    .where('id', '=', id)
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

export function toPlanned(p: PlannedTable): Planned {
  return {
    id: p.id,
    name: p.name,
    amount: Number(p.amount),
    date: p.date,
    categoryId: p.category_id,
    accountId: p.account_id,
    comment: p.comment,
    status: p.status,
    excludeFromLimit: !!p.exclude_from_limit,
    transactionId: p.transaction_id,
    doneAt: p.done_at,
    createdAt: p.created_at,
  };
}

/** Покупка по плану сохранена — план закрывается. */
export async function completePlan(db: DB, planId: string, txId: string) {
  const now = nowIso();
  await db
    .updateTable('planned')
    .set({ status: 'done', transaction_id: txId, done_at: now, updated_at: now })
    .where('id', '=', planId)
    .execute();
}

/** Операцию покупки удалили — план снова активен. */
export async function reopenPlan(db: DB, planId: string | null | undefined, txId: string) {
  if (!planId) return;
  await db
    .updateTable('planned')
    .set({ status: 'active', transaction_id: null, done_at: null, updated_at: nowIso() })
    .where('id', '=', planId)
    .where('transaction_id', '=', txId)
    .execute();
}

/** Даты регулярного расхода от ближайшей (возможно, просроченной) до horizon включительно. */
export function occurrences(rule: RecurringTable, skips: Set<string>, today: string, horizon: string): string[] {
  const step = Math.max(1, Number(rule.interval_months) || 1);
  const out: string[] = [];
  let due = nextDue(rule, skips, today);
  for (let i = 0; i < 60 && due <= horizon; i++) {
    out.push(due);
    let month = shiftMonth(monthOf(due), step);
    for (let j = 0; j < 36 && skips.has(month); j++) month = shiftMonth(month, step);
    const [y, m] = month.split('-').map(Number);
    due = toISODate(y, m, Math.min(rule.day_of_month, daysInMonth(y, m)));
  }
  return out;
}

/**
 * Прогноз: свободные деньги минус регулярные расходы и планы с датой, по порядку дат.
 * Доходы не прибавляются (осторожный прогноз). Просроченное считается сегодняшним.
 */
export async function buildOverview(db: DB, budgetId: string, today: string): Promise<PlannedOverview> {
  const accounts = await listAccounts(db, budgetId);
  const free = accounts.filter((a) => !a.isFrozen).reduce((s, a) => s + a.balance, 0);

  const rows = await db
    .selectFrom('planned')
    .selectAll()
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .where('status', '=', 'active')
    .execute();
  const plans = rows.map(toPlanned);
  const eff = (d: string) => (d < today ? today : d);

  const dated = plans
    .filter((p) => p.date)
    .sort((a, b) => (a.date! === b.date! ? (a.createdAt < b.createdAt ? -1 : 1) : a.date! < b.date! ? -1 : 1));
  const undated = plans.filter((p) => !p.date).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  const horizon = dated.length ? eff(dated[dated.length - 1].date!) : null;
  type Ev = Omit<ForecastStep, 'balanceAfter'> & { order: number };
  const events: Ev[] = [];

  if (horizon) {
    const rules = await db
      .selectFrom('recurring')
      .selectAll()
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .where('is_paused', '=', 0)
      .where('type', '=', 'expense')
      .execute();
    const skips = await loadSkips(db, rules.map((r) => r.id));
    for (const r of rules) {
      for (const d of occurrences(r, skips.get(r.id) ?? new Set(), today, horizon)) {
        events.push({ kind: 'recurring', id: r.id, name: r.name, date: eff(d), amount: Number(r.amount), approx: !!r.amount_varies, order: 0 });
      }
    }
    dated.forEach((p, i) => events.push({ kind: 'planned', id: p.id, name: p.name, date: eff(p.date!), amount: p.amount, approx: false, order: 1 + i }));
  }
  events.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));

  let balance = free;
  const steps: ForecastStep[] = events.map(({ order: _o, ...e }) => {
    balance -= e.amount;
    return { ...e, balanceAfter: balance };
  });
  const afterPlans = horizon ? balance : null;

  const items: PlannedItem[] = [];
  for (const p of dated) {
    const step = steps.find((s) => s.kind === 'planned' && s.id === p.id)!;
    items.push({ ...p, daysLeft: daysUntil(today, p.date!), shortfall: Math.max(0, -step.balanceAfter) });
  }
  const base = Math.max(0, afterPlans ?? free);
  for (const p of undated) items.push({ ...p, daysLeft: null, shortfall: Math.max(0, p.amount - base) });

  const historyRows = await db
    .selectFrom('planned')
    .selectAll()
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .where('status', '!=', 'active')
    .orderBy('updated_at', 'desc')
    .limit(30)
    .execute();

  return { free, afterPlans, horizon, steps, items, history: historyRows.map(toPlanned) };
}
