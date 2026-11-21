import type { FastifyInstance } from 'fastify';
import {
  budgetCreateSchema,
  budgetInviteCreateSchema,
  budgetUpdateSchema,
  DEFAULT_CURRENCY,
  memberUpdateSchema,
  type BudgetInvite,
  type BudgetMember,
  type IncomingInvite,
  type InviteCandidate,
} from '@selfinance/shared';
import { getDb } from '../context';
import type { DB } from '../db';
import type { BudgetInvitesTable } from '../db/types';
import { requireUser } from '../lib/auth';
import { badRequest, forbidden, notFound, nowIso, randomToken, uuidv7 } from '../lib/util';
import { createBudget, NO_SHARE_MESSAGE, requireBudget } from '../services/budgets';

type P = { budgetId: string };
type PU = { budgetId: string; userId: string };

async function ownersCount(db: DB, budgetId: string) {
  const rows = await db.selectFrom('budget_members').select('user_id').where('budget_id', '=', budgetId).where('role', '=', 'owner').execute();
  return rows.length;
}

/** Кто уже в бюджете или уже приглашён — их в список кандидатов не показываем. */
async function busyUserIds(db: DB, budgetId: string) {
  const members = await db.selectFrom('budget_members').select('user_id').where('budget_id', '=', budgetId).execute();
  const invited = await db
    .selectFrom('budget_invites')
    .select('user_id')
    .where('budget_id', '=', budgetId)
    .where('used_by', 'is', null)
    .where('user_id', 'is not', null)
    .execute();
  return new Set<string>([...members.map((m) => m.user_id), ...invited.map((i) => i.user_id as string)]);
}

export default async function budgetRoutes(app: FastifyInstance) {
  app.get('/budgets', async (req) => {
    const user = await requireUser(req);
    const rows = await getDb()
      .selectFrom('budget_members')
      .innerJoin('budgets', 'budgets.id', 'budget_members.budget_id')
      .select(['budgets.id', 'budgets.name', 'budgets.type', 'budgets.currency', 'budget_members.role', 'budgets.created_at'])
      .where('budget_members.user_id', '=', user.id)
      .where('budgets.deleted_at', 'is', null)
      // без разрешения «Общие бюджеты» видно только личный бюджет
      .$if(!user.can_share, (q) => q.where('budgets.type', '=', 'personal'))
      .orderBy('budgets.created_at')
      .execute();
    // личный бюджет всегда первым
    rows.sort((a, b) => (a.type === b.type ? 0 : a.type === 'personal' ? -1 : 1));
    return rows.map(({ created_at, ...b }) => b);
  });

  /** Создать общий бюджет — только если администратор разрешил пользователю. */
  app.post('/budgets', async (req) => {
    const user = await requireUser(req);
    if (!user.can_share) throw forbidden(NO_SHARE_MESSAGE);
    const { name, currency = DEFAULT_CURRENCY } = budgetCreateSchema.parse(req.body);
    const id = await createBudget(getDb(), user.id, name, 'shared', currency);
    return { id, name, type: 'shared', currency, role: 'owner' };
  });

  app.patch<{ Params: P }>('/budgets/:budgetId', async (req) => {
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

  /** Удалить общий бюджет (мягко). Личный удалить нельзя. */
  app.delete<{ Params: P }>('/budgets/:budgetId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const b = await requireBudget(db, req.params.budgetId, user.id, 'owner');
    if (b.type === 'personal') throw badRequest('Личный бюджет удалить нельзя');
    const now = nowIso();
    await db.updateTable('budgets').set({ deleted_at: now, updated_at: now }).where('id', '=', b.id).execute();
    await db.deleteFrom('budget_invites').where('budget_id', '=', b.id).where('used_by', 'is', null).execute();
    return { ok: true };
  });

  /* ---------- участники ---------- */

  app.get<{ Params: P }>('/budgets/:budgetId/members', async (req): Promise<BudgetMember[]> => {
    const db = getDb();
    const user = await requireUser(req);
    await requireBudget(db, req.params.budgetId, user.id);
    const rows = await db
      .selectFrom('budget_members')
      .innerJoin('users', 'users.id', 'budget_members.user_id')
      .select(['budget_members.user_id', 'budget_members.role', 'budget_members.joined_at', 'users.name', 'users.can_share'])
      .where('budget_members.budget_id', '=', req.params.budgetId)
      .orderBy('budget_members.joined_at')
      .execute();
    return rows.map((r) => ({ userId: r.user_id, name: r.name, role: r.role, joinedAt: r.joined_at, active: !!r.can_share }));
  });

  app.patch<{ Params: PU }>('/budgets/:budgetId/members/:userId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, userId } = req.params;
    const b = await requireBudget(db, budgetId, user.id, 'owner');
    if (b.type === 'personal') throw badRequest('В личном бюджете нет участников');
    const { role } = memberUpdateSchema.parse(req.body);
    const m = await db.selectFrom('budget_members').selectAll().where('budget_id', '=', budgetId).where('user_id', '=', userId).executeTakeFirst();
    if (!m) throw notFound('Участник не найден');
    if (m.role === 'owner' && role !== 'owner' && (await ownersCount(db, budgetId)) <= 1) {
      throw badRequest('В бюджете должен остаться хотя бы один владелец');
    }
    await db.updateTable('budget_members').set({ role }).where('budget_id', '=', budgetId).where('user_id', '=', userId).execute();
    return { ok: true };
  });

  /** Убрать участника (владелец) или выйти из бюджета самому. */
  app.delete<{ Params: PU }>('/budgets/:budgetId/members/:userId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const { budgetId, userId } = req.params;
    const self = userId === user.id;
    const b = await requireBudget(db, budgetId, user.id, self ? 'viewer' : 'owner');
    if (b.type === 'personal') throw badRequest('Из личного бюджета выйти нельзя');
    const m = await db.selectFrom('budget_members').selectAll().where('budget_id', '=', budgetId).where('user_id', '=', userId).executeTakeFirst();
    if (!m) throw notFound('Участник не найден');
    if (m.role === 'owner' && (await ownersCount(db, budgetId)) <= 1) {
      throw badRequest(self ? 'Вы единственный владелец: передайте права другому участнику или удалите бюджет' : 'Нельзя убрать единственного владельца');
    }
    await db.deleteFrom('budget_members').where('budget_id', '=', budgetId).where('user_id', '=', userId).execute();
    return { ok: true };
  });

  /* ---------- приглашения ---------- */
  // Приглашение адресное: владелец выбирает человека из списка. В списке — только пользователи
  // с разрешением «Общие бюджеты»; приглашённый принимает или отклоняет приглашение у себя.

  /** Кого можно пригласить в бюджет. */
  app.get<{ Params: P }>('/budgets/:budgetId/candidates', async (req): Promise<InviteCandidate[]> => {
    const db = getDb();
    const user = await requireUser(req);
    const b = await requireBudget(db, req.params.budgetId, user.id, 'owner');
    if (b.type === 'personal') return [];
    const taken = await busyUserIds(db, b.id);
    const rows = await db
      .selectFrom('users')
      .select(['id', 'name', 'email', 'phone'])
      .where('can_share', '=', 1)
      .where('is_blocked', '=', 0)
      .orderBy('name')
      .execute();
    return rows.filter((u) => !taken.has(u.id)).map((u) => ({ userId: u.id, name: u.name, login: u.email ?? u.phone }));
  });

  app.get<{ Params: P }>('/budgets/:budgetId/invites', async (req): Promise<BudgetInvite[]> => {
    const db = getDb();
    const user = await requireUser(req);
    await requireBudget(db, req.params.budgetId, user.id, 'owner');
    const rows = await db
      .selectFrom('budget_invites')
      .innerJoin('users', 'users.id', 'budget_invites.user_id')
      .select(['budget_invites.id', 'budget_invites.user_id', 'budget_invites.role', 'budget_invites.created_at', 'users.name'])
      .where('budget_invites.budget_id', '=', req.params.budgetId)
      .where('budget_invites.used_by', 'is', null)
      .orderBy('budget_invites.created_at', 'desc')
      .execute();
    return rows.map((r) => ({ id: r.id, userId: r.user_id!, userName: r.name, role: r.role, createdAt: r.created_at }));
  });

  app.post<{ Params: P }>('/budgets/:budgetId/invites', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const b = await requireBudget(db, req.params.budgetId, user.id, 'owner');
    if (b.type === 'personal') throw badRequest('В личный бюджет нельзя пригласить');
    const { userId, role } = budgetInviteCreateSchema.parse(req.body ?? {});
    const target = await db.selectFrom('users').select(['id', 'can_share', 'is_blocked']).where('id', '=', userId).executeTakeFirst();
    if (!target || target.is_blocked) throw notFound('Пользователь не найден');
    if (!target.can_share) throw badRequest('У этого пользователя нет разрешения «Общие бюджеты» — его можно включить в администрировании');
    if ((await busyUserIds(db, b.id)).has(userId)) throw badRequest('Этот пользователь уже в бюджете или уже приглашён');
    const row: BudgetInvitesTable = {
      id: uuidv7(),
      budget_id: b.id,
      code: randomToken(9),
      role,
      user_id: userId,
      created_by: user.id,
      expires_at: null,
      used_by: null,
      used_at: null,
      created_at: nowIso(),
    };
    await db.insertInto('budget_invites').values(row).execute();
    return { ok: true };
  });

  /** Отозвать приглашение (владелец). */
  app.delete<{ Params: { budgetId: string; inviteId: string } }>('/budgets/:budgetId/invites/:inviteId', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    await requireBudget(db, req.params.budgetId, user.id, 'owner');
    await db.deleteFrom('budget_invites').where('id', '=', req.params.inviteId).where('budget_id', '=', req.params.budgetId).where('used_by', 'is', null).execute();
    return { ok: true };
  });

  /** Мои приглашения, которые ждут ответа. */
  app.get('/budget-invites', async (req): Promise<IncomingInvite[]> => {
    const db = getDb();
    const user = await requireUser(req);
    if (!user.can_share) return [];
    const rows = await db
      .selectFrom('budget_invites')
      .innerJoin('budgets', 'budgets.id', 'budget_invites.budget_id')
      .innerJoin('users', 'users.id', 'budget_invites.created_by')
      .select(['budget_invites.id', 'budget_invites.budget_id', 'budget_invites.role', 'budget_invites.created_at', 'budgets.name as budget_name', 'users.name as author'])
      .where('budget_invites.user_id', '=', user.id)
      .where('budget_invites.used_by', 'is', null)
      .where('budgets.deleted_at', 'is', null)
      .orderBy('budget_invites.created_at')
      .execute();
    return rows.map((r) => ({ id: r.id, budgetId: r.budget_id, budgetName: r.budget_name, role: r.role, invitedBy: r.author, createdAt: r.created_at }));
  });

  async function myInvite(db: DB, inviteId: string, userId: string) {
    const inv = await db
      .selectFrom('budget_invites')
      .innerJoin('budgets', 'budgets.id', 'budget_invites.budget_id')
      .select(['budget_invites.id', 'budget_invites.budget_id', 'budget_invites.role'])
      .where('budget_invites.id', '=', inviteId)
      .where('budget_invites.user_id', '=', userId)
      .where('budget_invites.used_by', 'is', null)
      .where('budgets.deleted_at', 'is', null)
      .executeTakeFirst();
    if (!inv) throw notFound('Приглашение не найдено или уже отозвано');
    return inv;
  }

  app.post<{ Params: { inviteId: string } }>('/budget-invites/:inviteId/accept', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    if (!user.can_share) throw forbidden(NO_SHARE_MESSAGE);
    const inv = await myInvite(db, req.params.inviteId, user.id);
    const now = nowIso();
    await db.transaction().execute(async (trx) => {
      const member = await trx.selectFrom('budget_members').select('role').where('budget_id', '=', inv.budget_id).where('user_id', '=', user.id).executeTakeFirst();
      if (!member) await trx.insertInto('budget_members').values({ budget_id: inv.budget_id, user_id: user.id, role: inv.role, joined_at: now }).execute();
      await trx.updateTable('budget_invites').set({ used_by: user.id, used_at: now }).where('id', '=', inv.id).execute();
    });
    return { budgetId: inv.budget_id };
  });

  app.post<{ Params: { inviteId: string } }>('/budget-invites/:inviteId/decline', async (req) => {
    const db = getDb();
    const user = await requireUser(req);
    const inv = await myInvite(db, req.params.inviteId, user.id);
    await db.deleteFrom('budget_invites').where('id', '=', inv.id).execute();
    return { ok: true };
  });
}
