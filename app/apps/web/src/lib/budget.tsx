import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Budget } from '@selfinance/shared';
import { get } from './api';

interface BudgetState {
  budgets: Budget[];
  budget: Budget | null;
  budgetId: string;
  setBudgetId: (id: string) => void;
  canEdit: boolean;
}

const Ctx = createContext<BudgetState | null>(null);
const KEY = 'sf.budget';

export function BudgetProvider({ children }: { children: ReactNode }) {
  const { data: budgets = [], isLoading } = useQuery({ queryKey: ['budgets'], queryFn: () => get<Budget[]>('/budgets') });
  const [budgetId, setId] = useState<string>(() => localStorage.getItem(KEY) ?? '');

  useEffect(() => {
    if (budgets.length && !budgets.some((b) => b.id === budgetId)) setId(budgets[0].id);
  }, [budgets, budgetId]);

  const setBudgetId = (id: string) => {
    setId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  };

  const budget = budgets.find((b) => b.id === budgetId) ?? null;
  if (isLoading || !budget) return <div className="boot"><div className="spinner" /></div>;

  return (
    <Ctx.Provider value={{ budgets, budget, budgetId: budget.id, setBudgetId, canEdit: budget.role !== 'viewer' }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBudget() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBudget вне BudgetProvider');
  return v;
}
