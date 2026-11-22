import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { setCurrentCurrency, type AuthResponse, type Budget, type User } from '@selfinance/shared';
import { ApiError, get, getRefreshToken, getServer, initApi, post, setLogoutHandler, setServer, setTokens } from './api';
import { hash } from './disk';
import { forgetQueueOwner, restoreQueue, startSync } from './offline';
import { clearCache, invalidateAll, restoreCache, useQuery } from './query';
import { KEYS, load, save } from './storage';

interface Session {
  booting: boolean;
  server: string | null;
  user: User | null;
  connect: (url: string) => Promise<void>;
  disconnect: () => Promise<void>;
  signIn: (auth: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  /** профиль изменён в настройках */
  updateUser: (u: User) => void;
}

const Ctx = createContext<Session | null>(null);

/** Свои сохранённые данные для каждого сервера и пользователя. */
const ownerKey = (server: string, userId: string) => hash(`${server}|${userId}`);

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
    // сохранённые данные удаляем; неотправленные изменения остаются и уйдут после повторного входа
    clearCache(true);
    forgetQueueOwner();
  }, [setUser]);

  // запуск: адрес сервера, токены и пользователь с прошлого раза — открываемся без ожидания сети
  useEffect(() => {
    setLogoutHandler(() => void reset());
    (async () => {
      startSync();
      const { server: s, signedIn } = await initApi();
      setServerState(s);
      if (s && signedIn) {
        const cached = await load<User>(KEYS.user);
        if (cached) {
          // данные с прошлого раза — приложение открывается и без интернета
          await restoreCache(ownerKey(s, cached.id));
          await restoreQueue(ownerKey(s, cached.id), cached.id);
          setUserState(cached);
        }
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
      await restoreCache(ownerKey(getServer(), auth.user.id));
      await restoreQueue(ownerKey(getServer(), auth.user.id), auth.user.id);
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
    () => ({ booting, server, user, connect, disconnect, signIn, signOut, updateUser: setUser }),
    [booting, server, user, connect, disconnect, signIn, signOut, setUser],
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
