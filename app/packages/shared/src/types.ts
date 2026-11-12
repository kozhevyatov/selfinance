import type { AccountKind, CategoryType, RegistrationMode, TxType } from './schemas';

/** Ответы API. Суммы — в копейках. */

export interface Meta {
  setupDone: boolean;
  registration: RegistrationMode;
  version: string;
}

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isAdmin: boolean;
  timezone: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export type BudgetRole = 'owner' | 'member' | 'viewer';

export interface Budget {
  id: string;
  name: string;
  type: 'personal' | 'shared';
  currency: string;
  role: BudgetRole;
}

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  isFrozen: boolean;
  bankName: string | null;
  parentAccountId: string | null;
  color: string | null;
  icon: string | null;
  note: string | null;
  sort: number;
  isArchived: boolean;
  balance: number;
}

export interface Category {
  id: string;
  type: CategoryType;
  name: string;
  parentId: string | null;
  color: string | null;
  icon: string | null;
  sort: number;
  isArchived: boolean;
  excludeFromLimit: boolean;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  date: string;
  time: string | null;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  comment: string | null;
  createdBy: string;
  createdAt: string;
  recurringId: string | null;
}

export interface TxPage {
  items: Transaction[];
  nextCursor: string | null;
}

export interface CategoryStat {
  categoryId: string | null; // null — «Без категории»
  amount: number;
  subs: { categoryId: string; amount: number }[];
}

export interface Summary {
  from: string;
  to: string;
  income: number;
  expense: number;
  net: number;
  adjustments: number;
  prev: { from: string; to: string; income: number; expense: number; net: number };
  /** Для текущего периода: прошлый период за то же число дней. */
  prevToDate: { income: number; expense: number; net: number } | null;
  daysTotal: number;
  daysElapsed: number;
  avgPerDay: number;
  avgPerWeek: number;
  forecastExpense: number | null; // только для текущего периода
  daily: { date: string; expense: number; income: number }[];
  expenseByCategory: CategoryStat[];
  incomeByCategory: CategoryStat[];
}

export interface Capital {
  free: number;
  frozen: number;
  total: number;
  accounts: Account[];
}

export interface DynamicsPoint {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  capital: number; // все счета на конец месяца
}

export interface Recurring {
  id: string;
  name: string;
  type: 'income' | 'expense';
  categoryId: string | null;
  accountId: string | null;
  amount: number;
  amountVaries: boolean;
  dayOfMonth: number;
  dayPinned: boolean;
  intervalMonths: number; // 1 — каждый месяц, 3 — раз в квартал, 12 — раз в год
  remindDays: number;
  isPaused: boolean;
  lastPaidDate: string | null;
  nextDue: string;
}

export interface UpcomingPayment {
  recurring: Recurring;
  dueDate: string;
  daysLeft: number; // < 0 — просрочен
  match: Transaction | null; // похожая операция, внесённая вручную
}

export interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isAdmin: boolean;
  isBlocked: boolean;
  createdAt: string;
}

export interface Invite {
  id: string;
  code: string;
  expiresAt: string | null;
  usedBy: string | null;
  usedAt: string | null;
  createdAt: string;
}

export interface LimitStatus {
  categoryId: string | null; // null — общий лимит
  limit: number;
  spent: number;
  remaining: number; // может быть отрицательным
  /** только для текущего месяца */
  daysLeft: number | null; // включая сегодня
  perDay: number | null; // сколько можно тратить в день до конца месяца
  forecast: number | null;
  state: 'ok' | 'warn' | 'over';
}

export interface Limits {
  month: string;
  isCurrent: boolean;
  includeRecurring: boolean;
  overall: LimitStatus | null;
  categories: LimitStatus[];
  /** обязательные платежи месяца (когда они не входят в лимит) */
  recurring: { paid: number; upcoming: number };
  /** заданные лимиты (для формы): общий и по категориям */
  settings: { categoryId: string | null; amount: number; fromMonth: string }[];
}
