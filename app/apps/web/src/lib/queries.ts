import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Account, Capital, Category, DynamicsPoint, Limits, Recurring, Summary, Transaction, TxCreateInput, TxPage, UpcomingPayment } from '@selfinance/shared';
import { api, del, get, patch, post } from './api';
import { useBudget } from './budget';

export function useAccounts() {
  const { budgetId } = useBudget();
  return useQuery({ queryKey: ['accounts', budgetId], queryFn: () => get<Account[]>(`/budgets/${budgetId}/accounts`) });
}

export function useAllAccounts() {
  const { budgetId } = useBudget();
  return useQuery({ queryKey: ['accounts-all', budgetId], queryFn: () => get<Account[]>(`/budgets/${budgetId}/accounts`, { archived: 1 }) });
}

export function useCategories() {
  const { budgetId } = useBudget();
  return useQuery({
    queryKey: ['categories', budgetId],
    queryFn: () => get<Category[]>(`/budgets/${budgetId}/categories`),
    staleTime: 60_000,
  });
}

export function useCapital() {
  const { budgetId } = useBudget();
  return useQuery({ queryKey: ['capital', budgetId], queryFn: () => get<Capital>(`/budgets/${budgetId}/stats/capital`) });
}

export function useSummary(from: string, to: string, categoryId?: string | null, enabled = true) {
  const { budgetId } = useBudget();
  return useQuery({
    queryKey: ['summary', budgetId, from, to, categoryId ?? null],
    queryFn: () => get<Summary>(`/budgets/${budgetId}/stats/summary`, { from, to, categoryId }),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export interface TxFilters {
  from?: string;
  to?: string;
  type?: string;
  account?: string;
  category?: string;
  q?: string;
}

export function useTransactions(filters: TxFilters = {}, limit = 50) {
  const { budgetId } = useBudget();
  return useInfiniteQuery({
    queryKey: ['transactions', budgetId, filters, limit],
    queryFn: ({ pageParam }) =>
      get<TxPage>(`/budgets/${budgetId}/transactions`, { ...filters, limit, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** После любых изменений операций обновляем всё, что от них зависит. */
function useInvalidateMoney() {
  const qc = useQueryClient();
  const { budgetId } = useBudget();
  return () => {
    for (const k of ['transactions', 'summary', 'capital', 'accounts', 'dynamics', 'recurring', 'upcoming', 'limits']) qc.invalidateQueries({ queryKey: [k, budgetId] });
    qc.invalidateQueries({ queryKey: ['accounts-all', budgetId] });
  };
}

export function useSaveTx() {
  const { budgetId } = useBudget();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: TxCreateInput }) =>
      id ? patch<Transaction>(`/budgets/${budgetId}/transactions/${id}`, data) : post<Transaction>(`/budgets/${budgetId}/transactions`, data),
    onSuccess: invalidate,
  });
}

export function useDeleteTx() {
  const { budgetId } = useBudget();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (id: string) => del(`/budgets/${budgetId}/transactions/${id}`),
    onSuccess: invalidate,
  });
}

/* ---------- счета ---------- */

export interface AccountInput {
  name?: string;
  kind?: Account['kind'];
  isFrozen?: boolean;
  bankName?: string | null;
  note?: string | null;
  color?: string | null;
  initialBalance?: number;
  isArchived?: boolean;
}

export function useSaveAccount() {
  const { budgetId } = useBudget();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: AccountInput }) =>
      id ? patch<Account>(`/budgets/${budgetId}/accounts/${id}`, data) : post<Account>(`/budgets/${budgetId}/accounts`, data),
    onSuccess: invalidate,
  });
}

export function useDeleteAccount() {
  const { budgetId } = useBudget();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (id: string) => del<{ archived?: boolean; deleted?: boolean }>(`/budgets/${budgetId}/accounts/${id}`),
    onSuccess: invalidate,
  });
}

export function useReconcile() {
  const { budgetId } = useBudget();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, actualBalance }: { id: string; actualBalance: number }) =>
      post<{ balance: number; adjustment: number }>(`/budgets/${budgetId}/accounts/${id}/reconcile`, { actualBalance }),
    onSuccess: invalidate,
  });
}

/* ---------- статистика ---------- */

export function useDynamics(to: string, months = 12, categoryId?: string | null) {
  const { budgetId } = useBudget();
  return useQuery({
    queryKey: ['dynamics', budgetId, to, months, categoryId ?? null],
    queryFn: () => get<DynamicsPoint[]>(`/budgets/${budgetId}/stats/dynamics`, { to, months, categoryId }),
    placeholderData: (prev) => prev,
  });
}

/* ---------- категории ---------- */

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

export function useSaveCategory() {
  const { budgetId } = useBudget();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: CategoryInput }) =>
      id ? patch<Category>(`/budgets/${budgetId}/categories/${id}`, data) : post<Category>(`/budgets/${budgetId}/categories`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories', budgetId] });
      qc.invalidateQueries({ queryKey: ['limits', budgetId] });
    },
  });
}

export function useDeleteCategory() {
  const { budgetId } = useBudget();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del<{ archived?: boolean; deleted?: boolean }>(`/budgets/${budgetId}/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories', budgetId] }),
  });
}

/* ---------- регулярные платежи ---------- */

export function useRecurring() {
  const { budgetId } = useBudget();
  return useQuery({ queryKey: ['recurring', budgetId], queryFn: () => get<Recurring[]>(`/budgets/${budgetId}/recurring`) });
}

export function useUpcoming() {
  const { budgetId } = useBudget();
  return useQuery({ queryKey: ['upcoming', budgetId], queryFn: () => get<UpcomingPayment[]>(`/budgets/${budgetId}/recurring/upcoming`) });
}

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

export function useSaveRecurring() {
  const { budgetId } = useBudget();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: RecurringInput }) =>
      id ? patch<Recurring>(`/budgets/${budgetId}/recurring/${id}`, data) : post<Recurring>(`/budgets/${budgetId}/recurring`, data),
    onSuccess: invalidate,
  });
}

export function useDeleteRecurring() {
  const { budgetId } = useBudget();
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (id: string) => del(`/budgets/${budgetId}/recurring/${id}`), onSuccess: invalidate });
}

export function useSkipRecurring() {
  const { budgetId } = useBudget();
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (id: string) => post(`/budgets/${budgetId}/recurring/${id}/skip`), onSuccess: invalidate });
}

export function useLinkRecurring() {
  const { budgetId } = useBudget();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, transactionId }: { id: string; transactionId: string }) =>
      post(`/budgets/${budgetId}/recurring/${id}/link`, { transactionId }),
    onSuccess: invalidate,
  });
}

/* ---------- лимиты ---------- */

export function useLimits(month: string) {
  const { budgetId } = useBudget();
  return useQuery({
    queryKey: ['limits', budgetId, month],
    queryFn: () => get<Limits>(`/budgets/${budgetId}/limits`, { month }),
    placeholderData: (prev) => prev,
  });
}

export function useSaveLimits() {
  const { budgetId } = useBudget();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { includeRecurring?: boolean; set: { categoryId: string | null; amount: number }[]; fromMonth: string }) => {
      if (data.includeRecurring !== undefined) await patch(`/budgets/${budgetId}/limit-settings`, { includeRecurring: data.includeRecurring });
      for (const l of data.set) await api('PUT', `/budgets/${budgetId}/limits`, { ...l, fromMonth: data.fromMonth });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['limits', budgetId] }),
  });
}
