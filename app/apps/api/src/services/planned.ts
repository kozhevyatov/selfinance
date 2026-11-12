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
import type { PlannedTable, RecurringTable, TransactionsTable } from '../db/types';
import { badRequest, nowIso, uuidv7 } from '../lib/util';
import { accountBalances, listAccounts } from './accounts';
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

export function toPlanned(p: PlannedTable, reserved: number): Planned {
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
    reserveAccountId: p.reserve_account_id,
    reserved: p.reserve_account_id ? Math.max(0, reserved) : 0,
    transactionId: p.transaction_id,
    doneAt: p.done_at,
    createdAt: p.created_at,
  };
}

/** Перевод между счетами одного бюджета (используется для «отложить» и «вернуть»). */
export async function insertTransfer(
  db: DB,
  o: { budgetId: string; from: string; to: string; amount: number; date: string; comment: string; userId: string },
) {
  if (o.amount <= 0) return;
  const now = nowIso();
  const row: TransactionsTable = {
    id: uuidv7(),
    budget_id: o.budgetId,
    type: 'transfer',
    amount: o.amount,
    date: o.date,
    time: null,
    account_id: o.from,
    to_account_id: o.to,
    category_id: null,
    comment: o.comment,
    created_by: o.userId,
    transfer_group_id: null,
    recurring_id: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  await db.insertInto('transactions').values(row).execute();
}

/** Счёт, куда вернуть отложенное: указанный → тот, с которого откладывали → первый счёт в обороте. */
async function returnAccount(db: DB, budgetId: string, reserveId: string, preferred?: string | null) {
  const accounts = await db
    .selectFrom('accounts')
    .selectAll()
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .orderBy('sort')
    .orderBy('created_at')
    .execute();
  const usable = (id?: string | null) => accounts.find((a) => a.id === id && a.id !== reserveId && !a.is_archived);
  if (preferred) {
    const a = usable(preferred);
    if (!a) throw badRequest('Счёт не найден', { toAccountId: 'Счёт не найден' });
    return a.id;
  }
  const reserve = accounts.find((a) => a.id === reserveId);
  const parent = usable(reserve?.parent_account_id);
  if (parent) return parent.id;
  const free = accounts.find((a) => a.id !== reserveId && !a.is_archived && !a.is_frozen);
  if (free) return free.id;
  throw badRequest('Нет счёта, на который можно вернуть деньги');
}

export async function reserveBalance(db: DB, budgetId: string, reserveId: string | null) {
  if (!reserveId) return 0;
  return (await accountBalances(db, budgetId)).get(reserveId) ?? 0;
}

/** Отложить сумму под план: перевод на замороженную копилку плана (создаётся при первом откладывании). */
export async function reserve(db: DB, plan: PlannedTable, amount: number, fromAccountId: string, date: string, userId: string) {
  if (plan.status !== 'active') throw badRequest('План уже закрыт');
  const from = await db
    .selectFrom('accounts')
    .selectAll()
    .where('id', '=', fromAccountId)
    .where('budget_id', '=', plan.budget_id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!from || from.is_archived || from.id === plan.reserve_account_id) throw badRequest('Счёт не найден', { fromAccountId: 'Счёт не найден' });

  const now = nowIso();
  let reserveId = plan.reserve_account_id;
  const existing = reserveId
    ? await db.selectFrom('accounts').selectAll().where('id', '=', reserveId).where('deleted_at', 'is', null).executeTakeFirst()
    : undefined;
  if (existing) {
    if (existing.is_archived) await db.updateTable('accounts').set({ is_archived: 0, updated_at: now }).where('id', '=', existing.id).execute();
  } else {
    reserveId = uuidv7();
    await db
      .insertInto('accounts')
      .values({
        id: reserveId,
        budget_id: plan.budget_id,
        name: plan.name.slice(0, 100),
        kind: 'savings',
        is_frozen: 1,
        parent_account_id: from.id,
        bank_name: from.bank_name,
        color: null,
        icon: null,
        sort: 1000,
        is_archived: 0,
        note: 'Отложено под запланированный расход',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })
      .execute();
    await db.updateTable('planned').set({ reserve_account_id: reserveId, updated_at: now }).where('id', '=', plan.id).execute();
  }
  await insertTransfer(db, { budgetId: plan.budget_id, from: from.id, to: reserveId!, amount, date, comment: `Отложено: ${plan.name}`, userId });
}

/** Вернуть отложенное (всё или часть) на счёт в обороте. Возвращает, сколько вернули. */
export async function release(
  db: DB,
  plan: PlannedTable,
  o: { amount?: number; toAccountId?: string | null; date: string; userId: string; archive?: boolean },
) {
  const reserveId = plan.reserve_account_id;
  if (!reserveId) return 0;
  const balance = await reserveBalance(db, plan.budget_id, reserveId);
  const amount = Math.min(o.amount ?? balance, balance);
  if (amount > 0) {
    const to = await returnAccount(db, plan.budget_id, reserveId, o.toAccountId);
    await insertTransfer(db, { budgetId: plan.budget_id, from: reserveId, to, amount, date: o.date, comment: `Возврат из отложенного: ${plan.name}`, userId: o.userId });
  }
  if (o.archive || balance - amount <= 0) {
    await db.updateTable('accounts').set({ is_archived: 1, updated_at: nowIso() }).where('id', '=', reserveId).execute();
  }
  return Math.max(0, amount);
}

/**
 * Покупка по плану сохранена: отложенное возвращается на счёт покупки (или остаток — обратно,
 * если платили прямо с копилки), копилка архивируется, план закрывается.
 */
export async function completePlan(db: DB, plan: PlannedTable, tx: TransactionsTable, userId: string) {
  const reserveId = plan.reserve_account_id;
  if (reserveId) {
    const balance = await reserveBalance(db, plan.budget_id, reserveId);
    if (tx.account_id !== reserveId) {
      if (balance > 0) {
        await insertTransfer(db, { budgetId: plan.budget_id, from: reserveId, to: tx.account_id, amount: balance, date: tx.date, comment: `Из отложенного: ${plan.name}`, userId });
      }
    } else if (balance !== 0) {
      const other = await returnAccount(db, plan.budget_id, reserveId);
      if (balance > 0) {
        await insertTransfer(db, { budgetId: plan.budget_id, from: reserveId, to: other, amount: balance, date: tx.date, comment: `Остаток отложенного: ${plan.name}`, userId });
      } else {
        await insertTransfer(db, { budgetId: plan.budget_id, from: other, to: reserveId, amount: -balance, date: tx.date, comment: `Доплата: ${plan.name}`, userId });
      }
    }
    await db.updateTable('accounts').set({ is_archived: 1, updated_at: nowIso() }).where('id', '=', reserveId).execute();
  }
  const now = nowIso();
  await db
    .updateTable('planned')
    .set({ status: 'done', transaction_id: tx.id, done_at: now, updated_at: now })
    .where('id', '=', plan.id)
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
  const balances = await accountBalances(db, budgetId);

  const rows = await db
    .selectFrom('planned')
    .selectAll()
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .where('status', '=', 'active')
    .execute();
  const plans = rows.map((r) => toPlanned(r, balances.get(r.reserve_account_id ?? '') ?? 0));
  const eff = (d: string) => (d < today ? today : d);
  const need = (p: Planned) => Math.max(0, p.amount - p.reserved);

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
    dated.forEach((p, i) => events.push({ kind: 'planned', id: p.id, name: p.name, date: eff(p.date!), amount: need(p), approx: false, order: 1 + i }));
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
    items.push({ ...p, daysLeft: daysUntil(today, p.date!), need: need(p), shortfall: Math.max(0, -step.balanceAfter) });
  }
  const base = Math.max(0, afterPlans ?? free);
  for (const p of undated) items.push({ ...p, daysLeft: null, need: need(p), shortfall: Math.max(0, need(p) - base) });

  const historyRows = await db
    .selectFrom('planned')
    .selectAll()
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .where('status', '!=', 'active')
    .orderBy('updated_at', 'desc')
    .limit(30)
    .execute();

  return {
    free,
    afterPlans,
    horizon,
    steps,
    items,
    history: historyRows.map((r) => toPlanned(r, 0)),
  };
}
