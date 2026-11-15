import type { FastifyInstance } from 'fastify';
import { budgetCreateSchema, budgetUpdateSchema, DEFAULT_CURRENCY } from '@selfinance/shared';
import { getDb } from '../context';
import { requireUser } from '../lib/auth';
import { nowIso } from '../lib/util';
import { createBudget, requireBudget } from '../services/budgets';

export default async function budgetRoutes(app: FastifyInstance) {
  app.get('/budgets', async (req) => {
    const user = await requireUser(req);
    const rows = await getDb()
      .selectFrom('budget_members')
      .innerJoin('budgets', 'budgets.id', 'budget_members.budget_id')
      .select(['budgets.id', 'budgets.name', 'budgets.type', 'budgets.currency', 'budget_members.role', 'budgets.created_at'])
      .where('budget_members.user_id', '=', user.id)
      .where('budgets.deleted_at', 'is', null)
      .orderBy('budgets.created_at')
      .execute();
    // личный бюджет всегда первым
    rows.sort((a, b) => (a.type === b.type ? 0 : a.type === 'personal' ? -1 : 1));
    return rows.map(({ created_at, ...b }) => b);
  });

  app.post('/budgets', async (req) => {
    const user = await requireUser(req);
    const { name, currency = DEFAULT_CURRENCY } = budgetCreateSchema.parse(req.body);
    const id = await createBudget(getDb(), user.id, name, 'shared', currency);
    return { id, name, type: 'shared', currency, role: 'owner' };
  });

  app.patch<{ Params: { budgetId: string } }>('/budgets/:budgetId', async (req) => {
    const user = await requireUser(req);
    await requireBudget(getDb(), req.params.budgetId, user.id, 'owner');
    // валюта — только обозначение: суммы при смене не пересчитываются
    const { name, currency } = budgetUpdateSchema.parse(req.body);
    const set: { name?: string; currency?: string; updated_at: string } = { updated_at: nowIso() };
    if (name !== undefined) set.name = name;
    if (currency !== undefined) set.currency = currency;
    await getDb().updateTable('budgets').set(set).where('id', '=', req.params.budgetId).execute();
    return { ok: true };
  });
}
