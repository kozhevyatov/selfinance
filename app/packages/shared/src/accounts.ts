import type { Account, Capital } from './types';

/** Кредитные счета: кредитная карта и кредит. Их деньги — не свои. */
export const isCreditKind = (kind: Account['kind']) => kind === 'credit' || kind === 'loan';
export const isCredit = (a: Pick<Account, 'kind'>) => isCreditKind(a.kind);

/** Долг по кредитному счёту (положительное число, 0 если долга нет). */
export const debtOf = (a: Pick<Account, 'kind' | 'balance'>) => (isCredit(a) && a.balance < 0 ? -a.balance : 0);

/** Сколько ещё можно потратить с кредитки (лимит − долг). */
export const creditAvailableOf = (a: Pick<Account, 'kind' | 'balance' | 'creditLimit'>) =>
  a.kind === 'credit' && a.creditLimit ? Math.max(0, a.creditLimit - debtOf(a)) : 0;

/**
 * Разбивка капитала. Переплата по кредитке (положительный баланс) — свои деньги,
 * поэтому идёт в свободные; долг вычитается из итога, но не из свободных.
 * Доступный лимит кредитки с галочкой «учитывать в доступных средствах» прибавляется
 * к свободным деньгам (creditInFree), остальные лимиты показываются отдельно (creditAvailable).
 * «Всего» считается только по своим деньгам.
 */
export function splitCapital(accounts: Account[]): Omit<Capital, 'accounts'> {
  let own = 0;
  let frozen = 0;
  let debt = 0;
  let creditAvailable = 0;
  let creditInFree = 0;
  for (const a of accounts) {
    if (isCredit(a)) {
      if (a.balance > 0) own += a.balance;
      debt += debtOf(a);
      if (a.kind === 'credit' && a.includeInFree) creditInFree += creditAvailableOf(a);
      else creditAvailable += creditAvailableOf(a);
    } else if (a.isFrozen) frozen += a.balance;
    else own += a.balance;
  }
  return { free: own + creditInFree, creditInFree, frozen, debt, creditAvailable, total: own + frozen - debt };
}
