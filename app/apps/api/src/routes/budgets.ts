import type { FastifyInstance } from 'fastify';
import { budgetCreateSchema } from '@selfinance/shared';
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
    const { name } = budgetCreateSchema.parse(req.body);
    const id = await createBudget(getDb(), user.id, name, 'shared');
    return { id, name, type: 'shared', currency: 'RUB', role: 'owner' };
  });

  app.patch<{ Params: { budgetId: string } }>('/budgets/:budgetId', async (req) => {
    const user = await requireUser(req);
    await requireBudget(getDb(), req.params.budgetId, user.id, 'owner');
    const { name } = budgetCreateSchema.parse(req.body);
    await getDb().updateTable('budgets').set({ name, updated_at: nowIso() }).where('id', '=', req.params.budgetId).execute();
    return { ok: true };
  });
}
