import type { FastifyInstance } from 'fastify';
import {
  plannedCreateSchema,
  plannedReleaseSchema,
  plannedReserveSchema,
  plannedUpdateSchema,
  todayISO,
  type PlannedOverview,
} from '@selfinance/shared';
import { getDb } from '../context';
import type { DB } from '../db';
import type { PlannedTable } from '../db/types';
import { requireUser } from '../lib/auth';
import { badRequest, notFound, nowIso, uuidv7 } from '../lib/util';
import { getAccount } from '../services/accounts';
import { requireBudget } from '../services/budgets';
import { buildOverview, getPlan, release, reserve, reserveBalance, toPlanned } from '../services/planned';

type P = { budgetId: string; pid: string };

async function checkRefs(db: DB, budgetId: string, categoryId?: string | null, accountId?: string | null) {
  if (categoryId) {
    const cat = await db
      .selectFrom('categories')
      .select(['id', 'type'])
      .where('id', '=', categoryId)
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!cat || cat.type !== 'expense') throw badRequest('Категория не подходит', { categoryId: 'Выберите категорию расхода' });
  }
  if (accountId && !(await getAccount(db, budgetId, accountId))) throw badRequest('Счёт не найден', { accountId: 'Счёт не найден' });
}

export default async function plannedRoutes(app: FastifyInstance) {
  /** Активные планы с прогнозом «хватает / не хватает» и история. */
  app.get<{ Params: { budgetId: string } }>('/budgets/:budgetId/planned', async (req): Promise<PlannedOverview> => {
    const db = getDb();
    const user = await requireUser(req);
    await requireBudget(db, req.params.budgetId, user.id);
    return buildOverview(db, req.params.budgetId, todayISO(user.timezone));
  });

  app.post<{ Params: { budgetId: string } }>('/budgets/:budgetId/planned', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const input = plannedCreateSchema.parse(req.body);
    await checkRefs(db, budgetId, input.categoryId, input.accountId);
    const now = nowIso();
    const row: PlannedTable = {
      id: uuidv7(),
      budget_id: budgetId,
      name: input.name,
      amount: input.amount,
      date: input.date ?? null,
      category_id: input.categoryId ?? null,
      account_id: input.accountId ?? null,
      comment: input.comment?.trim() || null,
      status: 'active',
      exclude_from_limit: input.excludeFromLimit === false ? 0 : 1,
      reserve_account_id: null,
      transaction_id: null,
      done_at: null,
      created_by: user.id,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    await db.insertInto('planned').values(row).execute();
    return toPlanned(row, 0);
  });

  app.patch<{ Params: P }>('/budgets/:budgetId/planned/:pid', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, pid } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const plan = await getPlan(db, budgetId, pid);
    if (!plan) throw notFound('План не найден');
    const input = plannedUpdateSchema.parse(req.body);
    await checkRefs(db, budgetId, input.categoryId, input.accountId);
    const now = nowIso();
    const patch: Partial<PlannedTable> = { updated_at: now };
    if (input.name !== undefined) patch.name = input.name;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.date !== undefined) patch.date = input.date ?? null;
    if (input.categoryId !== undefined) patch.category_id = input.categoryId ?? null;
    if (input.accountId !== undefined) patch.account_id = input.accountId ?? null;
    if (input.comment !== undefined) patch.comment = input.comment?.trim() || null;
    if (input.excludeFromLimit !== undefined) patch.exclude_from_limit = input.excludeFromLimit ? 1 : 0;
    await db.updateTable('planned').set(patch).where('id', '=', pid).execute();
    // копилка называется так же, как план
    if (patch.name && plan.reserve_account_id) {
      await db.updateTable('accounts').set({ name: patch.name.slice(0, 100), updated_at: now }).where('id', '=', plan.reserve_account_id).execute();
    }
    const updated = (await getPlan(db, budgetId, pid))!;
    return toPlanned(updated, await reserveBalance(db, budgetId, updated.reserve_account_id));
  });

  /** Отменить план: отложенное возвращается на счёт. */
  app.post<{ Params: P }>('/budgets/:budgetId/planned/:pid/cancel', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, pid } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const plan = await getPlan(db, budgetId, pid);
    if (!plan) throw notFound('План не найден');
    if (plan.status !== 'active') throw badRequest('План уже закрыт');
    const today = todayISO(user.timezone);
    const returned = await release(db, plan, { date: today, userId: user.id, archive: true });
    const now = nowIso();
    await db.updateTable('planned').set({ status: 'cancelled', done_at: now, updated_at: now }).where('id', '=', pid).execute();
    return { ok: true, returned };
  });

  /** Вернуть отменённый план в работу. */
  app.post<{ Params: P }>('/budgets/:budgetId/planned/:pid/restore', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, pid } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const plan = await getPlan(db, budgetId, pid);
    if (!plan) throw notFound('План не найден');
    if (plan.status !== 'cancelled') throw badRequest('Вернуть можно только отменённый план');
    await db.updateTable('planned').set({ status: 'active', done_at: null, updated_at: nowIso() }).where('id', '=', pid).execute();
    return { ok: true };
  });

  app.delete<{ Params: P }>('/budgets/:budgetId/planned/:pid', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, pid } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const plan = await getPlan(db, budgetId, pid);
    if (!plan) throw notFound('План не найден');
    let returned = 0;
    if (plan.status === 'active') returned = await release(db, plan, { date: todayISO(user.timezone), userId: user.id, archive: true });
    const now = nowIso();
    await db.updateTable('planned').set({ deleted_at: now, updated_at: now }).where('id', '=', pid).execute();
    return { ok: true, returned };
  });

  /** Отложить сумму под план. */
  app.post<{ Params: P }>('/budgets/:budgetId/planned/:pid/reserve', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, pid } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const plan = await getPlan(db, budgetId, pid);
    if (!plan) throw notFound('План не найден');
    const input = plannedReserveSchema.parse(req.body);
    await reserve(db, plan, input.amount, input.fromAccountId, input.date ?? todayISO(user.timezone), user.id);
    const updated = (await getPlan(db, budgetId, pid))!;
    return toPlanned(updated, await reserveBalance(db, budgetId, updated.reserve_account_id));
  });

  /** Вернуть отложенное (всё или часть). */
  app.post<{ Params: P }>('/budgets/:budgetId/planned/:pid/release', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, pid } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const plan = await getPlan(db, budgetId, pid);
    if (!plan) throw notFound('План не найден');
    const input = plannedReleaseSchema.parse(req.body ?? {});
    const returned = await release(db, plan, {
      amount: input.amount,
      toAccountId: input.toAccountId,
      date: input.date ?? todayISO(user.timezone),
      userId: user.id,
    });
    return { ok: true, returned };
  });
}
