import { useMemo } from 'react';
import {
  isCredit,
  type Account,
  type AdminUser,
  type Budget,
  type BudgetInvite,
  type BudgetMember,
  type Capital,
  type Category,
  type DynamicsPoint,
  type IncomingInvite,
  type Invite,
  type InviteCandidate,
  type Limits,
  type Planned,
  type PlannedOverview,
  type Recurring,
  type RegistrationMode,
  type Summary,
  type Transaction,
  type TxCreateInput,
  type TxPage,
  type TxType,
  type UpcomingPayment,
} from '@selfinance/shared';
import { api, del, get, patch, post } from './api';
import { invalidateAll, usePaged, useQuery } from './query';
import { useBudget } from './session';

/* ---------- запросы ---------- */

export function useAllAccounts() {
  const { budgetId } = useBudget();
  return useQuery(`accounts-all:${budgetId}`, () => get<Account[]>(`/budgets/${budgetId}/accounts`, { archived: 1 }));
}

export function useCategories() {
  const { budgetId } = useBudget();
  return useQuery(`categories:${budgetId}`, () => get<Category[]>(`/budgets/${budgetId}/categories`));
}

export function useCapital() {
  const { budgetId } = useBudget();
  return useQuery(`capital:${budgetId}`, () => get<Capital>(`/budgets/${budgetId}/stats/capital`));
}

export interface StatsFilter {
  categoryId?: string | null;
  accountId?: string | null;
  userId?: string | null;
}

const fkey = (f: StatsFilter) => `${f.categoryId ?? ''}:${f.accountId ?? ''}:${f.userId ?? ''}`;

export function useSummary(from: string, to: string, filter: StatsFilter = {}, enabled = true) {
  const { budgetId } = useBudget();
  return useQuery(enabled ? `summary:${budgetId}:${from}:${to}:${fkey(filter)}` : null, () =>
    get<Summary>(`/budgets/${budgetId}/stats/summary`, { from, to, ...filter }),
  );
}

export function useDynamics(to: string, months = 12, filter: StatsFilter = {}) {
  const { budgetId } = useBudget();
  return useQuery(`dynamics:${budgetId}:${to}:${months}:${fkey(filter)}`, () =>
    get<DynamicsPoint[]>(`/budgets/${budgetId}/stats/dynamics`, { to, months, ...filter }),
  );
}

export function useLimits(month: string) {
  const { budgetId } = useBudget();
  return useQuery(`limits:${budgetId}:${month}`, () => get<Limits>(`/budgets/${budgetId}/limits`, { month }));
}

export function useUpcoming() {
  const { budgetId } = useBudget();
  return useQuery(`upcoming:${budgetId}`, () => get<UpcomingPayment[]>(`/budgets/${budgetId}/recurring/upcoming`));
}

export function useRecurring() {
  const { budgetId } = useBudget();
  return useQuery(`recurring:${budgetId}`, () => get<Recurring[]>(`/budgets/${budgetId}/recurring`));
}

export function usePlanned() {
  const { budgetId } = useBudget();
  return useQuery(`planned:${budgetId}`, () => get<PlannedOverview>(`/budgets/${budgetId}/planned`));
}

/** Счета любого бюджета — для перевода между бюджетами. */
export function useBudgetAccounts(budgetId: string) {
  return useQuery(budgetId ? `accounts-all:${budgetId}` : null, () => get<Account[]>(`/budgets/${budgetId}/accounts`, { archived: 1 }));
}

export function useBudgetMembers(budgetId: string) {
  return useQuery(budgetId ? `members:${budgetId}` : null, () => get<BudgetMember[]>(`/budgets/${budgetId}/members`));
}

export function useBudgetInvites(budgetId: string, enabled: boolean) {
  return useQuery(enabled ? `budget-invites:${budgetId}` : null, () => get<BudgetInvite[]>(`/budgets/${budgetId}/invites`));
}

export function useCandidates(budgetId: string, enabled: boolean) {
  return useQuery(enabled ? `candidates:${budgetId}` : null, () => get<InviteCandidate[]>(`/budgets/${budgetId}/candidates`));
}

export function useIncomingInvites(enabled: boolean) {
  return useQuery(enabled ? 'incoming-invites' : null, () => get<IncomingInvite[]>('/budget-invites'));
}

export interface SessionInfo {
  id: string;
  deviceName: string | null;
  createdAt: string;
  expiresAt: string;
}

export function useSessions() {
  return useQuery('sessions', () => get<SessionInfo[]>('/auth/sessions'));
}

export function useAdmin() {
  const settings = useQuery('admin-settings', () =>
    get<{ registration: RegistrationMode; version: string; dbType: string | null }>('/admin/settings'),
  );
  const users = useQuery('admin-users', () => get<AdminUser[]>('/admin/users'));
  const invites = useQuery('admin-invites', () => get<Invite[]>('/admin/invites'));
  return { settings, users, invites };
}

export function useMembers() {
  const { budgetId, budget } = useBudget();
  return useQuery(budget.type === 'shared' ? `members:${budgetId}` : null, () =>
    get<BudgetMember[]>(`/budgets/${budgetId}/members`),
  );
}

export interface TxFilters {
  type?: TxType;
  q?: string;
  from?: string;
  to?: string;
  account?: string;
  category?: string;
}

export function useTxFeed(filters: TxFilters = {}, limit = 50) {
  const { budgetId } = useBudget();
  const f = filters;
  const key = `tx:${budgetId}:${f.type ?? ''}:${f.q ?? ''}:${f.from ?? ''}:${f.to ?? ''}:${f.account ?? ''}:${f.category ?? ''}:${limit}`;
  return usePaged<Transaction>(key, (cursor) => get<TxPage>(`/budgets/${budgetId}/transactions`, { ...f, limit, cursor }));
}

/* ---------- изменения ---------- */

export async function saveTx(budgetId: string, data: Partial<TxCreateInput>, id?: string) {
  const res = id
    ? await patch<Transaction>(`/budgets/${budgetId}/transactions/${id}`, data)
    : await post<Transaction>(`/budgets/${budgetId}/transactions`, data);
  invalidateAll();
  return res;
}

export async function deleteTx(budgetId: string, id: string) {
  await del(`/budgets/${budgetId}/transactions/${id}`);
  invalidateAll();
}

/** Выполнить запрос и обновить все данные на экране. */
async function mutate<T>(p: Promise<T>): Promise<T> {
  const r = await p;
  invalidateAll();
  return r;
}

export interface AccountInput {
  name?: string;
  kind?: Account['kind'];
  isFrozen?: boolean;
  bankName?: string | null;
  note?: string | null;
  creditLimit?: number | null;
  includeInFree?: boolean;
  initialBalance?: number;
  isArchived?: boolean;
}

export const accountsApi = (b: string) => ({
  save: (data: AccountInput, id?: string) =>
    mutate(id ? patch<Account>(`/budgets/${b}/accounts/${id}`, data) : post<Account>(`/budgets/${b}/accounts`, data)),
  remove: (id: string) => mutate(del<{ archived?: boolean; deleted?: boolean }>(`/budgets/${b}/accounts/${id}`)),
  reconcile: (id: string, actualBalance: number) =>
    mutate(post<{ balance: number; adjustment: number }>(`/budgets/${b}/accounts/${id}/reconcile`, { actualBalance })),
});

export interface CategoryInput {
  type?: 'income' | 'expense';
  name?: string;
  parentId?: string | null;
  color?: string | null;
  icon?: string | null;
  isArchived?: boolean;
  sort?: number;
  excludeFromLimit?: boolean;
}

export const categoriesApi = (b: string) => ({
  save: (data: CategoryInput, id?: string) =>
    mutate(id ? patch<Category>(`/budgets/${b}/categories/${id}`, data) : post<Category>(`/budgets/${b}/categories`, data)),
  remove: (id: string) => mutate(del<{ archived?: boolean; deleted?: boolean }>(`/budgets/${b}/categories/${id}`)),
});

export interface RecurringInput {
  transactionId?: string;
  name?: string;
  type?: 'income' | 'expense';
  amount?: number;
  amountVaries?: boolean;
  categoryId?: string | null;
  accountId?: string | null;
  dayOfMonth?: number;
  dayPinned?: boolean;
  intervalMonths?: number;
  remindDays?: number;
  isPaused?: boolean;
}

export const recurringApi = (b: string) => ({
  save: (data: RecurringInput, id?: string) =>
    mutate(id ? patch<Recurring>(`/budgets/${b}/recurring/${id}`, data) : post<Recurring>(`/budgets/${b}/recurring`, data)),
  remove: (id: string) => mutate(del(`/budgets/${b}/recurring/${id}`)),
  skip: (id: string) => mutate(post(`/budgets/${b}/recurring/${id}/skip`)),
  link: (id: string, transactionId: string) => mutate(post(`/budgets/${b}/recurring/${id}/link`, { transactionId })),
});

export async function saveLimits(
  b: string,
  data: { includeRecurring?: boolean; set: { categoryId: string | null; amount: number }[]; fromMonth: string },
) {
  if (data.includeRecurring !== undefined) await patch(`/budgets/${b}/limit-settings`, { includeRecurring: data.includeRecurring });
  for (const l of data.set) await api('PUT', `/budgets/${b}/limits`, { ...l, fromMonth: data.fromMonth });
  invalidateAll();
}

export interface PlannedInput {
  type?: 'income' | 'expense';
  name?: string;
  amount?: number;
  date?: string | null;
  categoryId?: string | null;
  accountId?: string | null;
  comment?: string | null;
  excludeFromLimit?: boolean;
}

export const plannedApi = (b: string) => ({
  save: (data: PlannedInput, id?: string) =>
    mutate(id ? patch<Planned>(`/budgets/${b}/planned/${id}`, data) : post<Planned>(`/budgets/${b}/planned`, data)),
  action: (id: string, action: 'cancel' | 'restore' | 'delete') =>
    mutate(action === 'delete' ? del(`/budgets/${b}/planned/${id}`) : post(`/budgets/${b}/planned/${id}/${action}`)),
});

export const crossApi = {
  create: (data: { fromBudgetId: string; fromAccountId: string; toBudgetId: string; toAccountId: string; amount: number; date: string; comment?: string | null }) =>
    mutate(post<Transaction>('/transfers/cross-budget', data)),
  update: (groupId: string, data: { amount?: number; date?: string; comment?: string | null }) =>
    mutate(patch(`/transfers/cross-budget/${groupId}`, data)),
};

export const budgetsApi = {
  create: (data: { name: string; currency?: string }) => mutate(post<Budget>('/budgets', data)),
  update: (id: string, data: { name?: string; currency?: string }) => mutate(patch(`/budgets/${id}`, data)),
  remove: (id: string) => mutate(del(`/budgets/${id}`)),
  setRole: (budgetId: string, userId: string, role: BudgetMember['role']) => mutate(patch(`/budgets/${budgetId}/members/${userId}`, { role })),
  removeMember: (budgetId: string, userId: string) => mutate(del(`/budgets/${budgetId}/members/${userId}`)),
  invite: (budgetId: string, userId: string, role: 'member' | 'viewer') => mutate(post(`/budgets/${budgetId}/invites`, { userId, role })),
  deleteInvite: (budgetId: string, id: string) => mutate(del(`/budgets/${budgetId}/invites/${id}`)),
  answer: (id: string, accept: boolean) => mutate(post<{ budgetId?: string }>(`/budget-invites/${id}/${accept ? 'accept' : 'decline'}`)),
};

export const adminApi = {
  setRegistration: (registration: RegistrationMode) => mutate(patch('/admin/settings', { registration })),
  updateUser: (id: string, data: { isBlocked?: boolean; isAdmin?: boolean; canShare?: boolean; password?: string }) =>
    mutate(patch(`/admin/users/${id}`, data)),
  createUser: (data: { name: string; login: string; password: string; canShare: boolean; isAdmin: boolean }) => mutate(post('/admin/users', data)),
  newInvite: () => mutate(post<Invite>('/admin/invites', { days: 7 })),
  deleteInvite: (id: string) => mutate(del(`/admin/invites/${id}`)),
};

export const revokeSession = (id: string) => mutate(del(`/auth/sessions/${id}`));

/* ---------- справочники ---------- */

export interface Lookups {
  accounts: Account[];
  categories: Category[];
  account: (id: string | null | undefined) => Account | undefined;
  category: (id: string | null | undefined) => Category | undefined;
  multiAccount: boolean;
  /** общий бюджет: имя того, кто внёс операцию */
  member: (userId: string) => string | undefined;
  shared: boolean;
  ready: boolean;
}

export function useLookups(): Lookups {
  const acc = useAllAccounts();
  const cat = useCategories();
  const mem = useMembers();
  const members = useMemo(() => mem.data ?? [], [mem.data]);
  const accounts = useMemo(() => acc.data ?? [], [acc.data]);
  const categories = useMemo(() => cat.data ?? [], [cat.data]);
  const ready = acc.data !== undefined && cat.data !== undefined;
  return useMemo<Lookups>(() => {
    const am = new Map<string, Account>(accounts.map((x) => [x.id, x]));
    const cm = new Map<string, Category>(categories.map((x) => [x.id, x]));
    const mm = new Map<string, string>(members.map((x) => [x.userId, x.name]));
    return {
      accounts,
      categories,
      account: (id) => (id ? am.get(id) : undefined),
      category: (id) => (id ? cm.get(id) : undefined),
      multiAccount: accounts.filter((x) => !x.isArchived).length > 1,
      member: (id) => mm.get(id),
      shared: members.length > 1,
      ready,
    };
  }, [accounts, categories, members, ready]);
}

export type TxKind = TxType | 'freeze' | 'unfreeze' | 'repay' | 'borrow' | 'move' | 'cross' | 'adjust';

/** Как показывать операцию в списке (как в веб-версии). */
export function describeTx(tx: Transaction, l: Lookups): { title: string; sub: string; icon: string | null; color: string | null; kind: TxKind } {
  const cat = l.category(tx.categoryId);
  const parent = cat?.parentId ? l.category(cat.parentId) : undefined;
  const acc = l.account(tx.accountId);
  const to = l.account(tx.toAccountId);

  if (tx.type === 'transfer') {
    const from = acc?.name ?? 'Счёт';
    const dest = to?.name ?? 'Счёт';
    let title = 'Перевод';
    let kind: TxKind = 'move';
    const toCredit = !!to && isCredit(to);
    const fromCredit = !!acc && isCredit(acc);
    if (toCredit && !fromCredit) { title = `Погашение «${dest}»`; kind = 'repay'; }
    else if (fromCredit && !toCredit) { title = `С кредита «${from}»`; kind = 'borrow'; }
    else if (to?.isFrozen && !acc?.isFrozen) { title = `Заморожено в «${dest}»`; kind = 'freeze'; }
    else if (acc?.isFrozen && !to?.isFrozen) { title = `Разморожено из «${from}»`; kind = 'unfreeze'; }
    return {
      title,
      sub: tx.comment ? `${from} → ${dest}, ${tx.comment}` : `${from} → ${dest}`,
      icon: kind === 'freeze' || kind === 'unfreeze' ? 'snow' : kind === 'move' ? 'swap' : 'card',
      color: null,
      kind,
    };
  }
  if (tx.type === 'adjustment' && tx.linkedBudget) {
    const name = tx.linkedBudget.name;
    return {
      title: tx.amount < 0 ? `В бюджет «${name}»` : `Из бюджета «${name}»`,
      sub: [acc?.name, tx.comment].filter(Boolean).join(', '),
      icon: 'swap',
      color: null,
      kind: 'cross',
    };
  }
  if (tx.type === 'adjustment') {
    return { title: 'Корректировка', sub: tx.comment ?? acc?.name ?? '', icon: 'adjust', color: null, kind: 'adjust' };
  }
  if (cat) {
    const sub = [parent?.name, tx.comment].filter(Boolean).join(', ');
    return { title: cat.name, sub, icon: cat.icon ?? parent?.icon ?? null, color: cat.color ?? parent?.color ?? null, kind: tx.type };
  }
  return {
    title: tx.comment || (tx.type === 'income' ? 'Доход' : 'Расход'),
    sub: tx.comment ? 'Без категории' : '',
    icon: 'dots',
    color: null,
    kind: tx.type,
  };
}
