import type { FastifyInstance } from 'fastify';
import { categoryCreateSchema, categoryUpdateSchema, type Category } from '@selfinance/shared';
import { getDb } from '../context';
import type { DB } from '../db';
import type { CategoriesTable } from '../db/types';
import { requireUser } from '../lib/auth';
import { badRequest, notFound, nowIso, uuidv7 } from '../lib/util';
import { requireBudget } from '../services/budgets';

type P = { budgetId: string; categoryId: string };

export function toCategory(c: CategoriesTable): Category {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    parentId: c.parent_id,
    color: c.color,
    icon: c.icon,
    sort: c.sort,
    isArchived: !!c.is_archived,
    excludeFromLimit: !!c.exclude_from_limit,
  };
}

async function getCategory(db: DB, budgetId: string, id: string) {
  return db
    .selectFrom('categories')
    .selectAll()
    .where('id', '=', id)
    .where('budget_id', '=', budgetId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

export default async function categoryRoutes(app: FastifyInstance) {
  app.get<{ Params: { budgetId: string } }>('/budgets/:budgetId/categories', async (req) => {
    const user = await requireUser(req);
    await requireBudget(getDb(), req.params.budgetId, user.id);
    const rows = await getDb()
      .selectFrom('categories')
      .selectAll()
      .where('budget_id', '=', req.params.budgetId)
      .where('deleted_at', 'is', null)
      .orderBy('sort')
      .orderBy('created_at')
      .execute();
    return rows.map(toCategory);
  });

  app.post<{ Params: { budgetId: string } }>('/budgets/:budgetId/categories', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const input = categoryCreateSchema.parse(req.body);
    let color = input.color ?? null;
    if (input.parentId) {
      const parent = await getCategory(db, budgetId, input.parentId);
      if (!parent || parent.parent_id) throw badRequest('Подкатегорию можно создать только внутри категории верхнего уровня');
      if (parent.type !== input.type) throw badRequest('Тип подкатегории должен совпадать с категорией');
      color = color ?? parent.color;
    }
    const maxSort = await db
      .selectFrom('categories')
      .select((eb) => eb.fn.max('sort').as('m'))
      .where('budget_id', '=', budgetId)
      .where('type', '=', input.type)
      .executeTakeFirst();
    const now = nowIso();
    const row: CategoriesTable = {
      id: uuidv7(),
      budget_id: budgetId,
      parent_id: input.parentId ?? null,
      type: input.type,
      name: input.name,
      color,
      icon: input.icon ?? null,
      sort: Number(maxSort?.m ?? 0) + 1,
      is_archived: 0,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    await db.insertInto('categories').values(row).execute();
    return toCategory(row);
  });

  app.patch<{ Params: P }>('/budgets/:budgetId/categories/:categoryId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, categoryId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const cat = await getCategory(db, budgetId, categoryId);
    if (!cat) throw notFound('Категория не найдена');
    const input = categoryUpdateSchema.parse(req.body);
    const patch: Record<string, unknown> = { updated_at: nowIso() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.color !== undefined) patch.color = input.color ?? null;
    if (input.icon !== undefined) patch.icon = input.icon ?? null;
    if (input.isArchived !== undefined) patch.is_archived = input.isArchived ? 1 : 0;
    if (input.sort !== undefined) patch.sort = input.sort;
    if (input.excludeFromLimit !== undefined) patch.exclude_from_limit = input.excludeFromLimit ? 1 : 0;
    if (input.parentId !== undefined) {
      if (input.parentId) {
        const parent = await getCategory(db, budgetId, input.parentId);
        if (!parent || parent.parent_id || parent.id === categoryId || parent.type !== cat.type) throw badRequest('Неверная родительская категория');
        const hasChildren = await db.selectFrom('categories').select('id').where('parent_id', '=', categoryId).where('deleted_at', 'is', null).executeTakeFirst();
        if (hasChildren) throw badRequest('У категории есть подкатегории — её нельзя сделать подкатегорией');
      }
      patch.parent_id = input.parentId ?? null;
    }
    await db.updateTable('categories').set(patch).where('id', '=', categoryId).execute();
    return toCategory((await getCategory(db, budgetId, categoryId))!);
  });

  /** Удаление: использованные категории архивируются, чтобы история не потеряла названия. */
  app.delete<{ Params: P }>('/budgets/:budgetId/categories/:categoryId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, categoryId } = req.params;
    await requireBudget(db, budgetId, user.id, 'member');
    const cat = await getCategory(db, budgetId, categoryId);
    if (!cat) throw notFound('Категория не найдена');
    const children = await db.selectFrom('categories').select('id').where('parent_id', '=', categoryId).where('deleted_at', 'is', null).execute();
    const ids = [categoryId, ...children.map((c) => c.id)];
    const used = await db.selectFrom('transactions').select('id').where('category_id', 'in', ids).where('deleted_at', 'is', null).limit(1).executeTakeFirst();
    const now = nowIso();
    if (used) {
      await db.updateTable('categories').set({ is_archived: 1, updated_at: now }).where('id', 'in', ids).execute();
      return { archived: true };
    }
    await db.updateTable('categories').set({ deleted_at: now, updated_at: now }).where('id', 'in', ids).execute();
    return { deleted: true };
  });
}
