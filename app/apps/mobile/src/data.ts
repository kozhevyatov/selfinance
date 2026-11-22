import { useMemo } from 'react';
import {
  isCredit,
  type Account,
  type BudgetMember,
  type Capital,
  type Category,
  type Summary,
  type Transaction,
  type TxCreateInput,
  type TxPage,
  type TxType,
} from '@selfinance/shared';
import { del, get, patch, post } from './api';
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

export function useSummary(from: string, to: string) {
  const { budgetId } = useBudget();
  return useQuery(`summary:${budgetId}:${from}:${to}`, () => get<Summary>(`/budgets/${budgetId}/stats/summary`, { from, to }));
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
}

export function useTxFeed(filters: TxFilters = {}, limit = 50) {
  const { budgetId } = useBudget();
  const key = `tx:${budgetId}:${filters.type ?? ''}:${filters.q ?? ''}:${limit}`;
  return usePaged<Transaction>(key, (cursor) =>
    get<TxPage>(`/budgets/${budgetId}/transactions`, { type: filters.type, q: filters.q, limit, cursor }),
  );
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
