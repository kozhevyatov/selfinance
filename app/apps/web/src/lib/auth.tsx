import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthResponse, User } from '@selfinance/shared';
import { get, getRefreshToken, hasTokens, post, setLogoutHandler, setTokens } from './api';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (auth: AuthResponse) => void;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthState | null>(null);

export const deviceName = () => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'Браузер на iOS';
  if (/Android/.test(ua)) return 'Браузер на Android';
  if (/Mac/.test(ua)) return 'Браузер на Mac';
  if (/Windows/.test(ua)) return 'Браузер на Windows';
  return 'Браузер';
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(hasTokens());
  const qc = useQueryClient();

  const reset = useCallback(() => {
    setTokens(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setLogoutHandler(reset);
    if (!hasTokens()) return;
    get<User>('/auth/me')
      .then(setUser)
      .catch(() => reset())
      .finally(() => setLoading(false));
  }, [reset]);

  const signIn = useCallback((auth: AuthResponse) => {
    setTokens(auth);
    setUser(auth.user);
    setLoading(false);
  }, []);

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
