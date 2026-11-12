import type { BudgetRole } from '@selfinance/shared';
import type { DB } from '../db';
import { forbidden, notFound, nowIso, uuidv7 } from '../lib/util';

type Seed = { name: string; icon: string; color: string; subs?: { name: string; icon: string }[] };

const EXPENSE_SEED: Seed[] = [
  { name: 'Продукты', icon: 'cart', color: '#16A34A' },
  { name: 'Кафе и рестораны', icon: 'coffee', color: '#E8892E' },
  { name: 'Транспорт', icon: 'bus', color: '#0891B2' },
  {
    name: 'Машина',
    icon: 'car',
    color: '#4F46E5',
    subs: [
      { name: 'Бензин', icon: 'fuel' },
      { name: 'ТО и ремонт', icon: 'wrench' },
      { name: 'Страховка', icon: 'shield' },
      { name: 'Парковка и штрафы', icon: 'ticket' },
      { name: 'Мойка', icon: 'droplets' },
    ],
  },
  { name: 'Дом и ЖКХ', icon: 'house', color: '#0F9F9F' },
  { name: 'Связь и интернет', icon: 'phone', color: '#2563EB' },
  { name: 'Здоровье', icon: 'health', color: '#DC2626' },
  { name: 'Одежда', icon: 'shirt', color: '#DB2777' },
  { name: 'Развлечения', icon: 'game', color: '#9333EA' },
  { name: 'Подарки', icon: 'gift', color: '#E11D48' },
  { name: 'Подписки', icon: 'tv', color: '#7C3AED' },
  { name: 'Прочее', icon: 'dots', color: '#6B7280' },
];

const INCOME_SEED: Seed[] = [
  { name: 'Зарплата', icon: 'briefcase', color: '#15803D' },
  { name: 'Подработка', icon: 'laptop', color: '#0D9488' },
  { name: 'Подарки', icon: 'gift', color: '#E11D48' },
  { name: 'Проценты и кэшбэк', icon: 'percent', color: '#CA8A04' },
  { name: 'Прочее', icon: 'dots', color: '#6B7280' },
];

export async function seedCategories(db: DB, budgetId: string) {
  const now = nowIso();
  const rows: any[] = [];
  const push = (type: 'income' | 'expense', list: Seed[]) => {
    list.forEach((c, i) => {
      const id = uuidv7();
      rows.push({ id, budget_id: budgetId, parent_id: null, type, name: c.name, color: c.color, icon: c.icon, sort: i, is_archived: 0, created_at: now, updated_at: now, deleted_at: null });
      c.subs?.forEach((s, j) =>
        rows.push({ id: uuidv7(), budget_id: budgetId, parent_id: id, type, name: s.name, color: c.color, icon: s.icon, sort: j, is_archived: 0, created_at: now, updated_at: now, deleted_at: null }),
      );
    });
  };
  push('expense', EXPENSE_SEED);
  push('income', INCOME_SEED);
  await db.insertInto('categories').values(rows).execute();
}

/** Создаёт бюджет: владелец, счёт «Кошелёк», стартовые категории. */
export async function createBudget(db: DB, userId: string, name: string, type: 'personal' | 'shared') {
  const now = nowIso();
  const id = uuidv7();
  await db.transaction().execute(async (trx) => {
    await trx.insertInto('budgets').values({ id, name, type, currency: 'RUB', created_by: userId, created_at: now, updated_at: now, deleted_at: null }).execute();
    await trx.insertInto('budget_members').values({ budget_id: id, user_id: userId, role: 'owner', joined_at: now }).execute();
    await trx
      .insertInto('accounts')
      .values({
        id: uuidv7(), budget_id: id, name: 'Кошелёк', kind: 'cash', is_frozen: 0, parent_account_id: null, bank_name: null,
        color: null, icon: 'wallet', sort: 0, is_archived: 0, note: null, created_at: now, updated_at: now, deleted_at: null,
      })
      .execute();
    await seedCategories(trx as unknown as DB, id);
  });
  return id;
}

const ROLE_RANK: Record<BudgetRole, number> = { viewer: 1, member: 2, owner: 3 };

/** Проверяет доступ пользователя к бюджету. minRole: viewer — чтение, member — запись, owner — управление. */
export async function requireBudget(db: DB, budgetId: string, userId: string, minRole: BudgetRole = 'viewer') {
  const row = await db
    .selectFrom('budget_members')
    .innerJoin('budgets', 'budgets.id', 'budget_members.budget_id')
    .select(['budget_members.role', 'budgets.id', 'budgets.name', 'budgets.type', 'budgets.currency'])
    .where('budget_members.budget_id', '=', budgetId)
    .where('budget_members.user_id', '=', userId)
    .where('budgets.deleted_at', 'is', null)
    .executeTakeFirst();
  if (!row) throw notFound('Бюджет не найден');
  if (ROLE_RANK[row.role] < ROLE_RANK[minRole]) throw forbidden('Недостаточно прав в этом бюджете');
  return row;
}
