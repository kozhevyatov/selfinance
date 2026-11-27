import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { calendarHeat, savingsRate, type CategoryMatrix, type DynamicsPoint, type Insights } from '@selfinance/shared';
import { ctx } from '../src/context';
import { migrate } from '../src/db/migrations';
import type { Database, TransactionsTable } from '../src/db/types';
import statsRoutes from '../src/routes/stats';
import { createBudget } from '../src/services/budgets';

test('статистика одного бюджета с подкатегориями, переводом и долгом', async t => {
  const app = Fastify();
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: new SQLite(':memory:') }) });
  ctx.db = db;
  t.after(async () => { await app.close(); await db.destroy(); ctx.db = null; });
  await migrate(db);
  const time = '2024-02-01T00:00:00Z';
  const user = { id: 'owner', name: 'Test', email: null, phone: null, password_hash: '', is_admin: 0, is_blocked: 0, timezone: 'UTC', created_at: time, updated_at: time };
  await db.insertInto('users').values(user).execute();
  app.addHook('onRequest', async req => { req.user = user; });
  await app.register(statsRoutes);
  const budget = await createBudget(db, user.id, 'Test', 'personal');
  const wallet = await db.selectFrom('accounts').selectAll().where('budget_id', '=', budget).executeTakeFirstOrThrow();
  await db.insertInto('accounts').values([{ ...wallet, id: 'deposit', is_frozen: 1 }, { ...wallet, id: 'card', kind: 'credit' }]).execute();
  const sub = await db.selectFrom('categories').selectAll().where('name', '=', 'Бензин').executeTakeFirstOrThrow();
  await db.updateTable('categories').set({ exclude_from_limit: 1 }).where('id', '=', sub.parent_id!).execute();
  const tx = (id: string, type: TransactionsTable['type'], amount: number, extra: Partial<TransactionsTable> = {}) => ({
    id, type, amount, budget_id: budget, account_id: wallet.id, date: '2024-02-01', created_by: user.id,
    created_at: time, updated_at: time, category_id: null, recurring_id: null, planned_id: null, deleted_at: null,
    to_account_id: null, transfer_group_id: null, comment: null, time: null, ...extra,
  });
  await db.insertInto('transactions').values([
    tx('previous', 'expense', 10000, { date: '2024-01-01', category_id: sub.id }),
    tx('pay', 'income', 1000000), tx('gas', 'expense', 150000, { category_id: sub.id }),
    tx('regular', 'expense', 20000, { category_id: sub.id, recurring_id: 'rule' }),
    tx('planned', 'expense', 30000, { planned_id: 'plan' }), tx('free', 'expense', 5000, { account_id: 'card' }),
    tx('freeze', 'transfer', 100000, { to_account_id: 'deposit' }),
    tx('deleted', 'expense', 500000, { deleted_at: time }),
  ]).execute();
  async function get<T>(path: string) {
    const r = await app.inject({ url: '/budgets/' + budget + '/stats/' + path });
    assert.equal(r.statusCode, 200, r.body);
    return r.json<T>();
  }
  const range = 'from=2024-02-01&to=2024-02-29';
  const ins = await get<Insights>('insights?' + range);
  assert.deepEqual(ins.mandatory, { regular: 20000, excludedCats: 150000, planned: 30000, free: 5000 });
  assert.deepEqual(ins.weekdays[4], { weekday: 4, total: 205000, days: 5, avg: 41000 });
  assert.equal(ins.expenseCount, 4);
  assert.equal(ins.topExpense[0].id, 'gas');
  assert.equal(ins.anomalies[0].expected, 10000);
  assert.equal(ins.anomalies[0].diff, 160000);
  const filtered = await get<Insights>('insights?' + range + '&accountId=' + wallet.id + '&categoryId=' + sub.parent_id);
  assert.equal(filtered.expenseCount, 2);
  const matrix = await get<CategoryMatrix>('matrix?to=2024-02&months=2&type=expense');
  assert.deepEqual(matrix.rows[0].values, [10000, 170000]);
  assert.equal(matrix.rows[0].categoryId, sub.parent_id);
  const dynamics = await get<DynamicsPoint[]>('dynamics?to=2024-02&months=2');
  assert.deepEqual(dynamics[1], { month: '2024-02', income: 1000000, expense: 205000, free: 690000, frozen: 100000, debt: 5000, capital: 785000 });
  await db.insertInto('transactions').values([
    tx('small', 'expense', 1, { time: '23:59' }),
    tx('small2', 'expense', 2, { time: '23:01' }),
    tx('midnight', 'income', 1, { time: '00:00' }),
  ]).execute();
  const activity = await get<Insights>('insights?' + range);
  assert.deepEqual(activity.frequentCategories?.expense, [{ categoryId: null, count: 4 }, { categoryId: sub.parent_id, count: 2 }]);
  assert.equal(activity.hourly?.expense.byWeekday[4][23], 2);
  assert.equal(activity.hourly?.expense.withoutTime, 4);
  assert.equal(activity.hourly?.income.byWeekday[4][0], 1);
  assert.deepEqual(filtered.frequentCategories?.expense, [{ categoryId: sub.id, count: 2 }]);
  assert.equal(filtered.hourly?.expense.withoutTime, 2);
});

test('нулевой доход и високосный календарь с неполной неделей', () => {
  assert.equal(savingsRate(0, 100), null);
  assert.equal(savingsRate(100, 150), -50);
  const heat = calendarHeat([{ date: '2024-02-29', expense: 250, income: 0 }], '2024-02-28', '2024-03-03', '2024-03-01', 1, 'expense');
  assert.equal(heat.weeks[0][0], '2024-02-26');
  assert.equal(heat.amounts.get('2024-02-29'), 250);
  assert.equal(heat.zeroDays, 2);
});
