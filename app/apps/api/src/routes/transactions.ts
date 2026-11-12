import type { FastifyInstance } from 'fastify';
import { txCreateSchema, txListQuerySchema, txUpdateSchema, type Transaction, type TxCreateInput } from '@selfinance/shared';
import { getDb } from '../context';
import type { DB } from '../db';
import type { TransactionsTable } from '../db/types';
import { requireUser } from '../lib/auth';
import { badRequest, notFound, nowIso, uuidv7 } from '../lib/util';
import { getAccount } from '../services/accounts';
import { requireBudget } from '../services/budgets';
import { getRule, recomputeRule } from '../services/recurring';

type P = { budgetId: string; txId: string };

export function toTx(t: TransactionsTable): Transaction {
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
  };
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
    const items = rows.slice(0, f.limit).map(toTx);
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
    const now = nowIso();
    const row: TransactionsTable = {
      id: uuidv7(),
      budget_id: budgetId,
      ...fields,
      created_by: user.id,
      transfer_group_id: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    await db.insertInto('transactions').values(row).execute();
    await recomputeRule(db, row.recurring_id);
    return toTx(row);
  });

  app.patch<{ Params: P }>('/budgets/:budgetId/transactions/:txId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, txId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const tx = await getTx(db, budgetId, txId);
    if (!tx) throw notFound('Операция не найдена');
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
    return toTx((await getTx(db, budgetId, txId))!);
  });

  app.delete<{ Params: P }>('/budgets/:budgetId/transactions/:txId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, txId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const tx = await getTx(db, budgetId, txId);
    if (!tx) throw notFound('Операция не найдена');
    const now = nowIso();
    await db.updateTable('transactions').set({ deleted_at: now, updated_at: now }).where('id', '=', txId).execute();
    await recomputeRule(db, tx.recurring_id);
    return { ok: true };
  });
}
