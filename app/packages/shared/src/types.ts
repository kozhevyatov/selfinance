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
  creditLimit: number | null;
  includeInFree: boolean; // кредитка: доступный лимит прибавляется к свободным деньгам
  balance: number; // у кредитов отрицательный = долг
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
  plannedId: string | null;
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
  /** Для текущего и будущего периода: сколько дохода ожидается к концу периода. */
  expectedIncome: ExpectedIncome | null;
  daily: { date: string; expense: number; income: number }[];
  expenseByCategory: CategoryStat[];
  incomeByCategory: CategoryStat[];
}

export interface ExpectedIncome {
  received: number; // уже пришло за период
  planned: number; // запланированные доходы с датой до конца периода (просроченные тоже)
  recurring: number; // регулярные доходы, которые ещё должны прийти в периоде
  total: number; // received + planned + recurring
}

export interface Capital {
  free: number; // свои деньги + лимиты кредиток с галочкой «учитывать в доступных»
  creditInFree: number; // сколько из free — кредитные деньги
  frozen: number;
  debt: number; // долг по кредиткам и кредитам, положительное число
  creditAvailable: number; // доступно по кредиткам, не включённым в свободные
  total: number; // свободные + замороженные − долг
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

export interface Planned {
  id: string;
  type: 'income' | 'expense'; // запланированный расход (покупка) или ожидаемый доход
  name: string;
  amount: number;
  date: string | null; // null — без даты
  categoryId: string | null;
  accountId: string | null;
  comment: string | null;
  status: 'active' | 'done' | 'cancelled';
  excludeFromLimit: boolean;
  transactionId: string | null; // операция покупки
  doneAt: string | null;
  createdAt: string;
}

/** Строка расшифровки прогноза: что и когда вычитается из свободных денег. */
export interface ForecastStep {
  kind: 'recurring' | 'planned';
  type: 'income' | 'expense'; // доход прибавляется, расход вычитается
  id: string;
  name: string;
  date: string;
  amount: number;
  approx: boolean; // сумма регулярного платежа плавает
  balanceAfter: number;
}

export interface PlannedItem extends Planned {
  /** дней до даты; null — без даты; < 0 — просрочен */
  daysLeft: number | null;
  /** сколько не хватает к дате (для плана без даты — относительно остатка после всех планов) */
  shortfall: number;
}

export interface PlannedOverview {
  free: number; // свободные деньги сейчас
  /** остаток после всех датированных планов и регулярных платежей до последней даты; null — планов с датой нет */
  afterPlans: number | null;
  /** до какой даты посчитан прогноз */
  horizon: string | null;
  steps: ForecastStep[];
  items: PlannedItem[]; // активные: с датой по порядку, затем без даты
  history: Planned[]; // выполненные и отменённые, последние
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

/** Версия сервера и наличие обновления на GitHub. */
export interface VersionInfo {
  current: string; // версия, которая сейчас работает на сервере
  latest: string | null; // последняя версия на GitHub; null — не удалось проверить
  updateAvailable: boolean;
  checkedAt: string;
  enabled: boolean; // проверка выключена через UPDATE_CHECK=0
  repo: string; // owner/name на GitHub
  notes: { version: string; items: string[] }[]; // что нового (из CHANGELOG.md)
  error: string | null;
}
