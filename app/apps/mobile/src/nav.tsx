import { createContext, useContext } from 'react';
import type { Planned, Recurring, Transaction } from '@selfinance/shared';

export type SettingsKey = 'profile' | 'password' | 'currency' | 'theme' | 'security' | 'notifications' | 'devices';

/** Экраны, которые открываются поверх вкладок, со стрелкой «назад». */
export type Route =
  | { name: 'accounts' }
  | { name: 'recurring' }
  | { name: 'planned' }
  | { name: 'categories' }
  | { name: 'budgets' }
  | { name: 'settings' }
  | { name: 'settings-section'; key: SettingsKey }
  | { name: 'admin' };

export type Tab = 'home' | 'ops' | 'stats' | 'more';

export interface TxSheetOptions {
  tx?: Transaction;
  type?: 'expense' | 'income' | 'transfer';
  accountId?: string;
  toAccountId?: string;
  /** оплата регулярного платежа: форма заполняется из правила */
  recurring?: Recurring;
  /** покупка (или поступление) по плану */
  planned?: Planned;
  /** перевод между бюджетами */
  cross?: boolean;
}

export interface Nav {
  push: (r: Route) => void;
  pop: () => void;
  setTab: (t: Tab) => void;
  /**
   * Открыть окно операции. after — если перед этим закрывается другое окно:
   * iOS не показывает новое окно, пока старое уезжает, поэтому ждём анимацию.
   */
  openTx: (o?: TxSheetOptions, after?: boolean) => void;
}

export const NavCtx = createContext<Nav | null>(null);

export function useNav() {
  const v = useContext(NavCtx);
  if (!v) throw new Error('useNav вне MainScreen');
  return v;
}
