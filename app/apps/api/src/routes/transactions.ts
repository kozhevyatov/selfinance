import type { FastifyInstance } from 'fastify';
import {
  crossTransferSchema,
  crossTransferUpdateSchema,
  txCreateSchema,
  txListQuerySchema,
  txUpdateSchema,
  type Transaction,
  type TxCreateInput,
} from '@selfinance/shared';
import { getDb } from '../context';
import type { DB } from '../db';
import type { TransactionsTable } from '../db/types';
import { requireUser } from '../lib/auth';
import { badRequest, forbidden, notFound, nowIso, uuidv7 } from '../lib/util';
import { getAccount } from '../services/accounts';
import { requireBudget } from '../services/budgets';
import { completePlan, getPlan, reopenPlan } from '../services/planned';
import { getRule, recomputeRule } from '../services/recurring';

type P = { budgetId: string; txId: string };

export function toTx(t: TransactionsTable, linked: LinkMap = new Map()): Transaction {
  return {
    id: t.id,
    type: t.type,
    amount: Number(t.amount),
    date: t.date,
    time: t.time,
    accountId: t.account_id,
    toAccountId: t.to_account_id,
    categoryId: t.category_id,
    comment: t.comment,
    createdBy: t.created_by,
    createdAt: t.created_at,
    recurringId: t.recurring_id,
    plannedId: t.planned_id ?? null,
    transferGroupId: t.transfer_group_id,
    linkedBudget: t.transfer_group_id ? linked.get(t.transfer_group_id) ?? { id: '', name: 'другой бюджет' } : null,
  };
}

type LinkMap = Map<string, { id: string; name: string }>;

/** Для переводов между бюджетами: в какой бюджет ушли (или откуда пришли) деньги. */
async function linkedBudgets(db: DB, rows: TransactionsTable[]): Promise<LinkMap> {
  const groups = [...new Set(rows.map((r) => r.transfer_group_id).filter((g): g is string => !!g))];
  const map: LinkMap = new Map();
  if (!groups.length) return map;
  const pairs = await db
    .selectFrom('transactions')
    .innerJoin('budgets', 'budgets.id', 'transactions.budget_id')
    .select(['transactions.transfer_group_id', 'transactions.budget_id', 'budgets.name'])
    .where('transactions.transfer_group_id', 'in', groups)
    .execute();
  const own = new Map(rows.map((r) => [r.transfer_group_id, r.budget_id]));
  for (const p of pairs) {
    if (p.transfer_group_id && own.get(p.transfer_group_id) !== p.budget_id) map.set(p.transfer_group_id, { id: p.budget_id, name: p.name });
  }
  return map;
}

async function toTxOne(db: DB, row: TransactionsTable) {
  return toTx(row, await linkedBudgets(db, [row]));
}

/** Обе половины перевода между бюджетами; правка и удаление — только при доступе к обоим. */
async function crossPair(db: DB, groupId: string, userId: string) {
  const rows = await db.selectFrom('transactions').selectAll().where('transfer_group_id', '=', groupId).where('deleted_at', 'is', null).execute();
  if (rows.length !== 2) throw notFound('Перевод не найден');
  for (const r of rows) {
    try {
      await requireBudget(db, r.budget_id, userId, 'member');
    } catch {
      throw forbidden('Изменить или удалить перевод между бюджетами может только тот, у кого есть доступ к обоим бюджетам');
    }
  }
  return rows;
}

/** Проверяет и нормализует поля операции. */
async function validateTx(db: DB, budgetId: string, input: TxCreateInput) {
  const fields: Record<string, string> = {};

  if (input.type === 'adjustment') {
    if (input.amount === 0) fields.amount = 'Сумма не может быть нулевой';
  } else if (input.amount <= 0) {
    fields.amount = 'Сумма должна быть больше нуля';
  }

  let accountId = input.accountId ?? null;
  if (!accountId) {
    const def = await db
      .selectFrom('accounts')
      .select('id')
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .where('is_archived', '=', 0)
      .orderBy('sort')
      .orderBy('created_at')
      .executeTakeFirst();
    if (!def) throw badRequest('В бюджете нет ни одного счёта');
    accountId = def.id;
  } else if (!(await getAccount(db, budgetId, accountId))) {
    fields.accountId = 'Счёт не найден';
  }

  let toAccountId: string | null = null;
  let categoryId: string | null = null;

  if (input.type === 'transfer') {
    if (!input.toAccountId) fields.toAccountId = 'Укажите, куда перевести';
    else if (input.toAccountId === accountId) fields.toAccountId = 'Счета должны различаться';
    else if (!(await getAccount(db, budgetId, input.toAccountId))) fields.toAccountId = 'Счёт не найден';
    toAccountId = input.toAccountId ?? null;
  } else if ((input.type === 'income' || input.type === 'expense') && input.categoryId) {
    const cat = await db
      .selectFrom('categories')
      .select(['id', 'type'])
      .where('id', '=', input.categoryId)
      .where('budget_id', '=', budgetId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!cat) fields.categoryId = 'Категория не найдена';
    else if (cat.type !== input.type) fields.categoryId = input.type === 'income' ? 'Выберите категорию дохода' : 'Выберите категорию расхода';
    categoryId = input.categoryId;
  }

  let recurringId: string | null = null;
  if (input.recurringId) {
    const rule = await getRule(db, budgetId, input.recurringId);
    if (!rule) fields.recurringId = 'Регулярный платёж не найден';
    else if (rule.type !== input.type) fields.recurringId = 'Тип операции не совпадает с регулярным платежом';
    recurringId = input.recurringId;
  }

  if (Object.keys(fields).length) throw badRequest('Проверьте поля', fields);

  return {
    type: input.type,
    amount: input.amount,
    date: input.date,
    time: input.time ?? null,
    account_id: accountId!,
    to_account_id: toAccountId,
    category_id: categoryId,
    comment: input.comment?.trim() || null,
    recurring_id: recurringId,
  };
}

async function getTx(db: DB, budgetId: string, id: string) {
  return db
    .selectFrom('transactions')
    .selectAll()
    .where('id', '=', id)
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

export default async function transactionRoutes(app: FastifyInstance) {
  app.get<{ Params: { budgetId: string } }>('/budgets/:budgetId/transactions', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id);
    const f = txListQuerySchema.parse(req.query);

    let q = db.selectFrom('transactions').selectAll().where('budget_id', '=', budgetId).where('deleted_at', 'is', null);
    if (f.from) q = q.where('date', '>=', f.from);
    if (f.to) q = q.where('date', '<=', f.to);
    if (f.type) q = q.where('type', '=', f.type);
    if (f.user) q = q.where('created_by', '=', f.user);
    if (f.account) {
      const acc = f.account;
      q = q.where((eb) => eb.or([eb('account_id', '=', acc), eb('to_account_id', '=', acc)]));
    }
    if (f.category) {
      if (f.category === 'none') {
        q = q.where('category_id', 'is', null).where('type', 'in', ['income', 'expense']);
      } else {
        const subs = await db.selectFrom('categories').select('id').where('parent_id', '=', f.category).execute();
        q = q.where('category_id', 'in', [f.category, ...subs.map((s) => s.id)]);
      }
    }
    if (f.q) q = q.where('comment', 'like', `%${f.q.replace(/[%_]/g, '')}%`);
    if (f.cursor) {
      const [cDate, cId] = f.cursor.split('_');
      if (cDate && cId) {
        q = q.where((eb) => eb.or([eb('date', '<', cDate), eb.and([eb('date', '=', cDate), eb('id', '<', cId)])]));
      }
    }
    const rows = await q.orderBy('date', 'desc').orderBy('id', 'desc').limit(f.limit + 1).execute();
    const hasMore = rows.length > f.limit;
    const page = rows.slice(0, f.limit);
    const links = await linkedBudgets(db, page);
    const items = page.map((r) => toTx(r, links));
    const last = items[items.length - 1];
    return { items, nextCursor: hasMore && last ? `${last.date}_${last.id}` : null };
  });

  app.post<{ Params: { budgetId: string } }>('/budgets/:budgetId/transactions', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const input = txCreateSchema.parse(req.body);
    const fields = await validateTx(db, budgetId, input);
    const plan = input.plannedId ? await getPlan(db, budgetId, input.plannedId) : undefined;
    if (input.plannedId) {
      if (!plan) throw badRequest('План не найден', { plannedId: 'План не найден' });
      if (plan.status !== 'active') throw badRequest('Этот план уже выполнен или отменён');
      const planType = plan.type ?? 'expense';
      if (input.type !== planType) throw badRequest(planType === 'income' ? 'Поступление по плану — это доход' : 'Покупка по плану — это расход');
    }
    const now = nowIso();
    const row: TransactionsTable = {
      id: uuidv7(),
      budget_id: budgetId,
      ...fields,
      planned_id: plan?.id ?? null,
      created_by: user.id,
      transfer_group_id: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    await db.insertInto('transactions').values(row).execute();
    await recomputeRule(db, row.recurring_id);
    if (plan) await completePlan(db, plan.id, row.id);
    return toTx(row);
  });

  app.patch<{ Params: P }>('/budgets/:budgetId/transactions/:txId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, txId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const tx = await getTx(db, budgetId, txId);
    if (!tx) throw notFound('Операция не найдена');
    if (tx.transfer_group_id) throw badRequest('Это перевод между бюджетами — меняется отдельно');
    const patch = txUpdateSchema.parse(req.body);
    const merged: TxCreateInput = {
      type: patch.type ?? tx.type,
      amount: patch.amount ?? Number(tx.amount),
      date: patch.date ?? tx.date,
      time: patch.time !== undefined ? patch.time : tx.time,
      accountId: patch.accountId !== undefined ? patch.accountId : tx.account_id,
      toAccountId: patch.toAccountId !== undefined ? patch.toAccountId : tx.to_account_id,
      categoryId: patch.categoryId !== undefined ? patch.categoryId : tx.category_id,
      comment: patch.comment !== undefined ? patch.comment : tx.comment,
      recurringId: patch.recurringId !== undefined ? patch.recurringId : tx.recurring_id,
    };
    const fields = await validateTx(db, budgetId, merged);
    await db.updateTable('transactions').set({ ...fields, updated_at: nowIso() }).where('id', '=', txId).execute();
    await recomputeRule(db, tx.recurring_id);
    if (fields.recurring_id !== tx.recurring_id) await recomputeRule(db, fields.recurring_id);
    return toTxOne(db, (await getTx(db, budgetId, txId))!);
  });

  app.delete<{ Params: P }>('/budgets/:budgetId/transactions/:txId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, txId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const tx = await getTx(db, budgetId, txId);
    if (!tx) throw notFound('Операция не найдена');
    const now = nowIso();
    if (tx.transfer_group_id) {
      // перевод между бюджетами удаляется целиком — из обоих бюджетов
      await crossPair(db, tx.transfer_group_id, user.id);
      await db.updateTable('transactions').set({ deleted_at: now, updated_at: now }).where('transfer_group_id', '=', tx.transfer_group_id).execute();
      return { ok: true };
    }
    await db.updateTable('transactions').set({ deleted_at: now, updated_at: now }).where('id', '=', txId).execute();
    await recomputeRule(db, tx.recurring_id);
    await reopenPlan(db, tx.planned_id, tx.id);
    return { ok: true };
  });

  /**
   * Перевод между бюджетами: две связанные корректировки (−сумма в бюджете-источнике,
   * +сумма в бюджете-получателе) с общим transfer_group_id. В доходы и расходы не входят.
   */
  app.post('/transfers/cross-budget', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const input = crossTransferSchema.parse(req.body);
    if (input.fromBudgetId === input.toBudgetId) throw badRequest('Выберите другой бюджет', { toBudgetId: 'Бюджеты должны различаться' });
    await requireBudget(db, input.fromBudgetId, user.id, 'member');
    await requireBudget(db, input.toBudgetId, user.id, 'member');
    const fields: Record<string, string> = {};
    if (!(await getAccount(db, input.fromBudgetId, input.fromAccountId))) fields.fromAccountId = 'Счёт не найден';
    if (!(await getAccount(db, input.toBudgetId, input.toAccountId))) fields.toAccountId = 'Счёт не найден';
    if (Object.keys(fields).length) throw badRequest('Проверьте поля', fields);

    const now = nowIso();
    const group = uuidv7();
    const base = {
      type: 'adjustment' as const,
      date: input.date,
      time: null,
      to_account_id: null,
      category_id: null,
      comment: input.comment?.trim() || null,
      created_by: user.id,
      transfer_group_id: group,
      recurring_id: null,
      planned_id: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    const out: TransactionsTable = { ...base, id: uuidv7(), budget_id: input.fromBudgetId, account_id: input.fromAccountId, amount: -input.amount };
    const inc: TransactionsTable = { ...base, id: uuidv7(), budget_id: input.toBudgetId, account_id: input.toAccountId, amount: input.amount };
    await db.transaction().execute(async (trx) => {
      await trx.insertInto('transactions').values([out, inc]).execute();
    });
    return toTxOne(db, out);
  });

  /** Изменить сумму, дату или комментарий перевода между бюджетами — сразу в обоих бюджетах. */
  app.patch<{ Params: { groupId: string } }>('/transfers/cross-budget/:groupId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const input = crossTransferUpdateSchema.parse(req.body);
    const rows = await crossPair(db, req.params.groupId, user.id);
    const now = nowIso();
    for (const r of rows) {
      const set: Partial<TransactionsTable> = { updated_at: now };
      if (input.amount !== undefined) set.amount = Number(r.amount) < 0 ? -input.amount : input.amount;
      if (input.date !== undefined) set.date = input.date;
      if (input.comment !== undefined) set.comment = input.comment?.trim() || null;
      await db.updateTable('transactions').set(set).where('id', '=', r.id).execute();
    }
    return { ok: true };
  });
}
