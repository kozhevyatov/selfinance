import { useMemo } from 'react';
import type { Account, Category, Transaction } from '@selfinance/shared';
import { useAllAccounts, useCategories } from './queries';

export interface Lookups {
  accounts: Account[];
  categories: Category[];
  account: (id: string | null | undefined) => Account | undefined;
  category: (id: string | null | undefined) => Category | undefined;
  multiAccount: boolean;
  ready: boolean;
}

export function useLookups(): Lookups {
  const { data: accounts = [], isSuccess: a } = useAllAccounts();
  const { data: categories = [], isSuccess: c } = useCategories();
  return useMemo<Lookups>(() => {
    const am = new Map<string, Account>(accounts.map((x) => [x.id, x]));
    const cm = new Map<string, Category>(categories.map((x) => [x.id, x]));
    return {
      accounts,
      categories,
      account: (id) => (id ? am.get(id) : undefined),
      category: (id) => (id ? cm.get(id) : undefined),
      multiAccount: accounts.filter((x) => !x.isArchived).length > 1,
      ready: a && c,
    };
  }, [accounts, categories, a, c]);
}

/** Как показывать операцию в списке. */
export function describeTx(tx: Transaction, l: Lookups) {
  const cat = l.category(tx.categoryId);
  const parent = cat?.parentId ? l.category(cat.parentId) : undefined;
  const acc = l.account(tx.accountId);
  const to = l.account(tx.toAccountId);

  if (tx.type === 'transfer') {
    const from = acc?.name ?? 'Счёт';
    const dest = to?.name ?? 'Счёт';
    let title = 'Перевод';
    let kind: 'freeze' | 'unfreeze' | 'move' = 'move';
    if (to?.isFrozen && !acc?.isFrozen) { title = `Заморожено в «${dest}»`; kind = 'freeze'; }
    else if (acc?.isFrozen && !to?.isFrozen) { title = `Разморожено из «${from}»`; kind = 'unfreeze'; }
    return {
      title, sub: tx.comment ? `${from} → ${dest}, ${tx.comment}` : `${from} → ${dest}`,
      icon: kind === 'move' ? 'swap' : 'snow', color: null as string | null, kind,
    };
  }
  if (tx.type === 'adjustment') {
    return { title: 'Корректировка', sub: tx.comment ?? acc?.name ?? '', icon: 'adjust', color: null, kind: 'adjust' as const };
  }
  if (cat) {
    const sub = [parent?.name, tx.comment].filter(Boolean).join(', ');
    return { title: cat.name, sub, icon: cat.icon, color: cat.color ?? parent?.color ?? null, kind: tx.type };
  }
  return {
    title: tx.comment || (tx.type === 'income' ? 'Доход' : 'Расход'),
    sub: tx.comment ? 'Без категории' : '',
    icon: 'dots',
    color: null,
    kind: tx.type,
  };
}
