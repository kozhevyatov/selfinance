import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthResponse, User } from '@selfinance/shared';
import { ApiError, get, getRefreshToken, hasTokens, post, setLogoutHandler, setTokens } from './api';
import { clearCache, setCacheOwner } from './offline';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (auth: AuthResponse) => void;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthState | null>(null);
const USER_KEY = 'sf.user';

/** Пользователь с прошлого входа — чтобы приложение открывалось и без интернета. */
export function cachedUser(): User | null {
  if (!hasTokens()) return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function rememberUser(u: User | null) {
  setCacheOwner(u?.id ?? null);
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export const deviceName = () => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'Браузер на iOS';
  if (/Android/.test(ua)) return 'Браузер на Android';
  if (/Mac/.test(ua)) return 'Браузер на Mac';
  if (/Windows/.test(ua)) return 'Браузер на Windows';
  return 'Браузер';
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(cachedUser);
  // есть сохранённый пользователь — открываемся сразу, не дожидаясь сервера
  const [loading, setLoading] = useState(hasTokens() && !cachedUser());
  const qc = useQueryClient();

  const setUser = useCallback((u: User | null) => {
    rememberUser(u);
    setUserState(u);
  }, []);

  const reset = useCallback(() => {
    setTokens(null);
    setUser(null);
    clearCache();
    qc.clear();
  }, [qc, setUser]);

  useEffect(() => {
    setLogoutHandler(reset);
    if (!hasTokens()) return;
    get<User>('/auth/me')
      .then(setUser)
      // нет связи — остаёмся в приложении с сохранёнными данными; выходим только если сервер отказал
      .catch((e) => {
        if (e instanceof ApiError && e.status !== 0 && e.status < 500) reset();
      })
      .finally(() => setLoading(false));
  }, [reset, setUser]);

  // связь появилась — обновить профиль (вдруг сменили имя или права)
  useEffect(() => {
    const on = () => {
      if (hasTokens()) get<User>('/auth/me').then(setUser).catch(() => undefined);
    };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [setUser]);

  const signIn = useCallback((auth: AuthResponse) => {
    setTokens(auth);
    // другой пользователь — чужие сохранённые данные не показываем
    if (cachedUser()?.id !== auth.user.id) {
      clearCache();
      qc.clear();
    }
    setUser(auth.user);
    setLoading(false);
  }, [qc, setUser]);

  const signOut = useCallback(async () => {
    const rt = getRefreshToken();
    if (rt) await post('/auth/logout', { refreshToken: rt }).catch(() => undefined);
    reset();
  }, [reset]);

  return <Ctx.Provider value={{ user, loading, signIn, signOut, setUser }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth вне AuthProvider');
  return v;
}
