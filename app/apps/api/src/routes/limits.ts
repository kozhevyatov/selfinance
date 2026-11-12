import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import {
  daysBetween,
  limitSetSchema,
  limitSettingsSchema,
  limitsQuerySchema,
  monthRange,
  todayISO,
  type LimitStatus,
  type Limits,
} from '@selfinance/shared';
import { getDb } from '../context';
import type { DB } from '../db';
import { requireUser } from '../lib/auth';
import { badRequest, num, nowIso, uuidv7 } from '../lib/util';
import { requireBudget } from '../services/budgets';
import { loadSkips, nextDue } from '../services/recurring';

/** Действующие лимиты на месяц: для каждой категории (и общего) — последняя запись с from_month <= месяца. */
async function effectiveLimits(db: DB, budgetId: string, month: string) {
  const rows = await db
    .selectFrom('limits')
    .selectAll()
    .where('budget_id', '=', budgetId)
    .where('from_month', '<=', month)
    .orderBy('from_month', 'desc')
    .execute();
  const map = new Map<string | null, { amount: number; fromMonth: string }>();
  for (const r of rows) {
    if (!map.has(r.category_id)) map.set(r.category_id, { amount: Number(r.amount), fromMonth: r.from_month });
  }
  return map;
}

function status(categoryId: string | null, limit: number, spent: number, ctx: { isCurrent: boolean; daysTotal: number; daysElapsed: number }): LimitStatus {
  const remaining = limit - spent;
  const daysLeft = ctx.isCurrent ? ctx.daysTotal - ctx.daysElapsed + 1 : null;
  const forecast = ctx.isCurrent && ctx.daysElapsed > 0 ? Math.round((spent / ctx.daysElapsed) * ctx.daysTotal) : null;
  let state: LimitStatus['state'] = 'ok';
  if (spent > limit) state = 'over';
  else if (spent >= limit * 0.8 || (forecast !== null && forecast > limit)) state = 'warn';
  return {
    categoryId,
    limit,
    spent,
    remaining,
    daysLeft,
    perDay: daysLeft ? Math.max(0, Math.floor(remaining / daysLeft)) : null,
    forecast,
    state,
  };
}

export default async function limitRoutes(app: FastifyInstance) {
  app.get<{ Params: { budgetId: string } }>('/budgets/:budgetId/limits', async (req): Promise<Limits> => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id);
    const { month } = limitsQuerySchema.parse(req.query);
    const { from, to } = monthRange(month);
    const today = todayISO(user.timezone);
    const isCurrent = today >= from && today <= to;
    const daysTotal = daysBetween(from, to);
    const daysElapsed = isCurrent ? daysBetween(from, today) : today > to ? daysTotal : 0;
    const ctx = { isCurrent, daysTotal, daysElapsed };

    const budget = await db.selectFrom('budgets').selectAll().where('id', '=', budgetId).executeTakeFirstOrThrow();
    const includeRecurring = !!budget.limit_include_recurring;

    const limits = await effectiveLimits(db, budgetId, month);

    const cats = await db.selectFrom('categories').select(['id', 'parent_id', 'exclude_from_limit']).where('budget_id', '=', budgetId).execute();
    const parentOf = new Map<string, string | null>(cats.map((c) => [c.id, c.parent_id]));
    const excluded = new Set(cats.filter((c) => c.exclude_from_limit).map((c) => c.id));
    const isExcluded = (id: string | null) => !!id && (excluded.has(id) || excluded.has(parentOf.get(id) ?? ''));
    const topOf = (id: string | null): string | null => (id ? parentOf.get(id) ?? id : null);

    // расходы месяца по категориям, отдельно — привязанные к регулярным платежам
    const rows = await db
      .selectFrom('transactions')
      .select([
        'category_id',
        sql<number>`case when recurring_id is null then 0 else 1 end`.as('is_rec'),
        sql<number>`sum(amount)`.as('total'),
      ])
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .where('type', '=', 'expense')
      .where('date', '>=', from)
      .where('date', '<=', to)
      .groupBy(['category_id', sql`case when recurring_id is null then 0 else 1 end`])
      .execute();

    let overallSpent = 0;
    let recurringPaid = 0;
    const byTop = new Map<string | null, number>();
    for (const r of rows) {
      const amount = num(r.total);
      const rec = num(r.is_rec) === 1;
      if (rec) recurringPaid += amount;
      const top = topOf(r.category_id);
      byTop.set(top, (byTop.get(top) ?? 0) + amount);
      if ((!rec || includeRecurring) && !isExcluded(r.category_id)) overallSpent += amount;
    }

    // ещё не оплаченные обязательные платежи этого месяца
    let recurringUpcoming = 0;
    const rules = await db
      .selectFrom('recurring')
      .selectAll()
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .where('is_paused', '=', 0)
      .where('type', '=', 'expense')
      .execute();
    if (rules.length && today <= to) {
      const skips = await loadSkips(db, rules.map((r) => r.id));
      for (const r of rules) {
        const due = nextDue(r, skips.get(r.id) ?? new Set(), today);
        if (due >= from && due <= to) recurringUpcoming += Number(r.amount);
      }
    }

    const overallLimit = limits.get(null);
    const categories: LimitStatus[] = [];
    for (const [cid, l] of limits) {
      if (cid === null || l.amount <= 0) continue;
      const id = String(cid);
      categories.push(status(id, l.amount, byTop.get(id) ?? 0, ctx));
    }
    categories.sort((a, b) => b.spent / b.limit - a.spent / a.limit);

    // в настройки — актуальные на сегодня значения
    const nowMonth = today.slice(0, 7);
    const current = await effectiveLimits(db, budgetId, nowMonth > month ? nowMonth : month);
    const settings = [...current.entries()]
      .filter(([, v]) => v.amount > 0)
      .map(([categoryId, v]) => ({ categoryId, amount: v.amount, fromMonth: v.fromMonth }));

    return {
      month,
      isCurrent,
      includeRecurring,
      overall: overallLimit && overallLimit.amount > 0 ? status(null, overallLimit.amount, overallSpent, ctx) : null,
      categories,
      recurring: { paid: recurringPaid, upcoming: recurringUpcoming },
      settings,
    };
  });

  /** Задать лимит (общий или категории) начиная с месяца. amount = 0 — убрать. */
  app.put<{ Params: { budgetId: string } }>('/budgets/:budgetId/limits', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const input = limitSetSchema.parse(req.body);
    const categoryId = input.categoryId ?? null;
    if (categoryId) {
      const cat = await db
        .selectFrom('categories')
        .select(['id', 'type', 'parent_id'])
        .where('id', '=', categoryId)
        .where('budget_id', '=', budgetId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!cat || cat.type !== 'expense' || cat.parent_id) throw badRequest('Лимит можно задать только для категории расходов верхнего уровня');
    }
    let q = db.selectFrom('limits').select('id').where('budget_id', '=', budgetId).where('from_month', '=', input.fromMonth);
    q = categoryId ? q.where('category_id', '=', categoryId) : q.where('category_id', 'is', null);
    const existing = await q.executeTakeFirst();
    const now = nowIso();
    if (existing) {
      await db.updateTable('limits').set({ amount: input.amount, updated_at: now }).where('id', '=', existing.id).execute();
    } else {
      await db
        .insertInto('limits')
        .values({ id: uuidv7(), budget_id: budgetId, category_id: categoryId, amount: input.amount, from_month: input.fromMonth, created_at: now, updated_at: now })
        .execute();
    }
    return { ok: true };
  });

  app.patch<{ Params: { budgetId: string } }>('/budgets/:budgetId/limit-settings', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const { includeRecurring } = limitSettingsSchema.parse(req.body);
    await db.updateTable('budgets').set({ limit_include_recurring: includeRecurring ? 1 : 0, updated_at: nowIso() }).where('id', '=', budgetId).execute();
    return { includeRecurring };
  });
}
