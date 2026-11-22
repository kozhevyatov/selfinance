import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { setCurrentCurrency, type AuthResponse, type Budget, type User } from '@selfinance/shared';
import { ApiError, get, getRefreshToken, initApi, post, setLogoutHandler, setServer, setTokens } from './api';
import { clearCache, invalidateAll, useQuery } from './query';
import { KEYS, load, save } from './storage';

interface Session {
  booting: boolean;
  server: string | null;
  user: User | null;
  connect: (url: string) => Promise<void>;
  disconnect: () => Promise<void>;
  signIn: (auth: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [server, setServerState] = useState<string | null>(null);
  const [user, setUserState] = useState<User | null>(null);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    void save(KEYS.user, u);
  }, []);

  const reset = useCallback(async () => {
    await setTokens(null);
    setUser(null);
    clearCache();
  }, [setUser]);

  // запуск: адрес сервера, токены и пользователь с прошлого раза — открываемся без ожидания сети
  useEffect(() => {
    setLogoutHandler(() => void reset());
    (async () => {
      const { server: s, signedIn } = await initApi();
      setServerState(s);
      if (s && signedIn) {
        const cached = await load<User>(KEYS.user);
        if (cached) setUserState(cached);
        try {
          setUser(await get<User>('/auth/me'));
        } catch (e) {
          // нет связи — остаёмся с сохранёнными данными; выходим, только если сервер отказал
          if (e instanceof ApiError && e.status !== 0 && e.status < 500) await reset();
        }
      }
      setBooting(false);
    })();
  }, [reset, setUser]);

  // вернулись в приложение — обновить данные
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') invalidateAll();
    });
    return () => sub.remove();
  }, []);

  const connect = useCallback(async (url: string) => {
    await setServer(url);
    setServerState(url);
  }, []);

  const disconnect = useCallback(async () => {
    const rt = getRefreshToken();
    if (rt) await post('/auth/logout', { refreshToken: rt }).catch(() => undefined);
    await reset();
    await setServer(null);
    setServerState(null);
  }, [reset]);

  const signIn = useCallback(
    async (auth: AuthResponse) => {
      await setTokens(auth);
      clearCache();
      setUser(auth.user);
    },
    [setUser],
  );

  const signOut = useCallback(async () => {
    const rt = getRefreshToken();
    if (rt) await post('/auth/logout', { refreshToken: rt }).catch(() => undefined);
    await reset();
  }, [reset]);

  const value = useMemo(
    () => ({ booting, server, user, connect, disconnect, signIn, signOut }),
    [booting, server, user, connect, disconnect, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession вне SessionProvider');
  return v;
}

/* ---------- бюджет ---------- */

interface BudgetState {
  budgets: Budget[];
  budget: Budget;
  budgetId: string;
  setBudgetId: (id: string) => void;
  canEdit: boolean;
}

const BudgetCtx = createContext<BudgetState | null>(null);

export function BudgetProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  /** пока бюджеты грузятся (error — если не удалось) */
  fallback: (error: unknown, retry: () => void) => ReactNode;
}) {
  const { data: budgets = [], error, refetch } = useQuery('budgets', () => get<Budget[]>('/budgets'));
  const [budgetId, setId] = useState<string | null>(null);

  useEffect(() => {
    load<string>(KEYS.budget).then((id) => setId(id ?? ''));
  }, []);

  useEffect(() => {
    if (budgetId === null || !budgets.length) return;
    if (!budgets.some((b) => b.id === budgetId)) setId(budgets[0].id);
  }, [budgets, budgetId]);

  const setBudgetId = useCallback((id: string) => {
    setId(id);
    void save(KEYS.budget, id);
  }, []);

  const budget = budgets.find((b) => b.id === budgetId) ?? null;
  const value = useMemo(
    () => (budget ? { budgets, budget, budgetId: budget.id, setBudgetId, canEdit: budget.role !== 'viewer' } : null),
    [budgets, budget, setBudgetId],
  );
  if (!value) return <>{fallback(budgets.length ? null : error, () => void refetch())}</>;
  // formatMoney() берёт знак валюты отсюда
  setCurrentCurrency(value.budget.currency);
  return <BudgetCtx.Provider value={value}>{children}</BudgetCtx.Provider>;
}

export function useBudget() {
  const v = useContext(BudgetCtx);
  if (!v) throw new Error('useBudget вне BudgetProvider');
  return v;
}
