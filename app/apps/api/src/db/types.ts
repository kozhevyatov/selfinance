/** Схема БД для Kysely. Булевы поля хранятся как 0/1, даты — строками. */

export interface UsersTable {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  password_hash: string;
  is_admin: number;
  is_blocked: number;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface RefreshTokensTable {
  id: string;
  user_id: string;
  token_hash: string;
  device_name: string | null;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
}

export interface SettingsTable {
  name: string;
  value: string;
}

export interface InvitesTable {
  id: string;
  code: string;
  created_by: string;
  expires_at: string | null;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

export interface BudgetsTable {
  id: string;
  name: string;
  type: 'personal' | 'shared';
  currency: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  limit_include_recurring?: number;
}

export interface BudgetMembersTable {
  budget_id: string;
  user_id: string;
  role: 'owner' | 'member' | 'viewer';
  joined_at: string;
}

export interface BudgetInvitesTable {
  id: string;
  budget_id: string;
  code: string;
  role: 'member' | 'viewer';
  created_by: string;
  expires_at: string | null;
  used_by: string | null;
  created_at: string;
}

export interface AccountsTable {
  id: string;
  budget_id: string;
  name: string;
  kind: 'cash' | 'bank' | 'deposit' | 'savings';
  is_frozen: number;
  parent_account_id: string | null;
  bank_name: string | null;
  color: string | null;
  icon: string | null;
  sort: number;
  is_archived: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CategoriesTable {
  id: string;
  budget_id: string;
  parent_id: string | null;
  type: 'income' | 'expense';
  name: string;
  color: string | null;
  icon: string | null;
  sort: number;
  is_archived: number;
  exclude_from_limit?: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TransactionsTable {
  id: string;
  budget_id: string;
  type: 'income' | 'expense' | 'transfer' | 'adjustment';
  amount: number;
  date: string;
  time: string | null;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  comment: string | null;
  created_by: string;
  transfer_group_id: string | null;
  recurring_id: string | null;
  planned_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PlannedTable {
  id: string;
  budget_id: string;
  name: string;
  amount: number;
  date: string | null;
  category_id: string | null;
  account_id: string | null;
  comment: string | null;
  status: 'active' | 'done' | 'cancelled';
  exclude_from_limit: number;
  reserve_account_id?: string | null; // не используется (было «отложить»), колонка осталась
  transaction_id: string | null;
  done_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RecurringTable {
  id: string;
  budget_id: string;
  name: string;
  type: 'income' | 'expense';
  category_id: string | null;
  account_id: string | null;
  amount: number;
  amount_varies: number;
  day_of_month: number;
  day_pinned: number;
  interval_months: number;
  remind_days: number;
  is_paused: number;
  last_paid_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RecurringSkipsTable {
  recurring_id: string;
  month: string;
}

export interface LimitsTable {
  id: string;
  budget_id: string;
  category_id: string | null;
  amount: number;
  from_month: string;
  created_at: string;
  updated_at: string;
}

export interface Database {
  limits: LimitsTable;
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
  settings: SettingsTable;
  invites: InvitesTable;
  budgets: BudgetsTable;
  budget_members: BudgetMembersTable;
  budget_invites: BudgetInvitesTable;
  accounts: AccountsTable;
  categories: CategoriesTable;
  transactions: TransactionsTable;
  recurring: RecurringTable;
  recurring_skips: RecurringSkipsTable;
  planned: PlannedTable;
}
