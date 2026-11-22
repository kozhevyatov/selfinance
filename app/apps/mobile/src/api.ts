import { Platform } from 'react-native';
import type { AuthResponse, Meta } from '@selfinance/shared';
import { KEYS, load, save } from './storage';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

let server = '';
let tokens: Tokens | null = null;
let onLogout: (() => void) | null = null;

export const setLogoutHandler = (fn: () => void) => (onLogout = fn);
export const getServer = () => server;
export const hasTokens = () => !!tokens;
export const getRefreshToken = () => tokens?.refreshToken ?? null;
export const deviceName = () => (Platform.OS === 'ios' ? 'Приложение на iOS' : 'Приложение на Android');

/** Загрузить адрес сервера и токены при запуске. */
export async function initApi(): Promise<{ server: string | null; signedIn: boolean }> {
  server = (await load<string>(KEYS.server)) ?? '';
  tokens = await load<Tokens>(KEYS.auth);
  return { server: server || null, signedIn: !!tokens };
}

export async function setServer(url: string | null) {
  server = url ?? '';
  await save(KEYS.server, url);
}

export async function setTokens(t: Tokens | null) {
  tokens = t ? { accessToken: t.accessToken, refreshToken: t.refreshToken } : null;
  await save(KEYS.auth, tokens);
}

/**
 * «nas.local:1444», «https://money.example.ru/» → «https://money.example.ru».
 * Без схемы пробуем https; для IP-адресов и .local — http.
 */
export function normalizeServer(input: string): string | null {
  let s = input.trim().replace(/\/+$/, '');
  if (!s) return null;
  s = s.replace(/\/api(\/v1)?$/, '');
  if (!/^https?:\/\//i.test(s)) {
    const host = s.split(/[/:]/)[0];
    const local = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith('.local') || host === 'localhost';
    s = (local ? 'http://' : 'https://') + s;
  }
  return /^https?:\/\/[^\s/]+/.test(s) ? s : null;
}

const withTimeout = (ms: number) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
};

/** Проверка адреса: отвечает ли там Selfinance. */
export async function probeServer(url: string): Promise<Meta> {
  const t = withTimeout(10_000);
  let res: Response;
  try {
    res = await fetch(`${url}/api/v1/meta`, { signal: t.signal });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Сервер не отвечает. Проверьте адрес и подключение.');
  } finally {
    t.done();
  }
  const data = (await res.json().catch(() => null)) as Meta | null;
  if (!res.ok || !data || typeof data.setupDone !== 'boolean') {
    throw new ApiError(res.status, 'NOT_SELFINANCE', 'По этому адресу не найден Selfinance.');
  }
  return data;
}

let refreshing: Promise<boolean | null> | null = null;

/** true — токены обновлены, false — сервер отказал (войти заново), null — нет связи. */
async function refresh(): Promise<boolean | null> {
  if (!tokens) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${server}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens!.refreshToken }),
        });
        if (!res.ok) return res.status >= 500 ? null : false;
        const data = (await res.json()) as AuthResponse;
        await setTokens(data);
        return true;
      } catch {
        return null; // без интернета не разлогиниваем
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

export type Query = Record<string, string | number | undefined | null>;

// URLSearchParams в React Native урезан, поэтому собираем строку сами
function qs(query?: Query): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? '?' + parts.join('&') : '';
}

export async function api<T>(method: string, path: string, body?: unknown, query?: Query, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;

  const t = withTimeout(20_000);
  let res: Response;
  try {
    res = await fetch(`${server}/api/v1${path}${qs(query)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: t.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Нет связи с сервером');
  } finally {
    t.done();
  }

  if (res.status === 401 && retry && tokens && !path.startsWith('/auth/login')) {
    const ok = await refresh();
    if (ok) return api<T>(method, path, body, query, false);
    if (ok === null) throw new ApiError(0, 'NETWORK', 'Нет связи с сервером');
    await setTokens(null);
    onLogout?.();
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `Ошибка ${res.status}`, e?.fields ?? {});
  }
  return data as T;
}

export const get = <T>(path: string, query?: Query) => api<T>('GET', path, undefined, query);
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});
export const patch = <T>(path: string, body: unknown) => api<T>('PATCH', path, body);
export const del = <T>(path: string) => api<T>('DELETE', path);
