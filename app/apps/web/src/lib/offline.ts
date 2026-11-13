/**
 * Работа без интернета: данные последних экранов сохраняются на устройстве (localStorage)
 * и показываются сразу при открытии приложения, а свежие подтягиваются с сервера, как только есть связь.
 * Кеш привязан к пользователю и стирается при выходе.
 */
import { useEffect, useState } from 'react';
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';

const KEY = 'sf.cache';
const VERSION = 1; // поменять, если изменится формат данных API
const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // старше месяца — не показываем
const MAX_SIZE = 3_000_000; // ~3 МБ, чтобы не упереться в лимит localStorage
/** Эти запросы не сохраняем: служебные и админские. */
const SKIP = new Set(['admin-settings', 'admin-users', 'invites', 'version']);

interface Saved {
  v: number;
  owner: string;
  savedAt: number;
  state: unknown;
}

let owner: string | null = null;

/** Чей кеш: id пользователя. Пока пользователь неизвестен — не сохраняем. */
export function setCacheOwner(id: string | null) {
  owner = id;
}

function read(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    if (s.v !== VERSION || Date.now() - s.savedAt > MAX_AGE) return null;
    return s;
  } catch {
    return null;
  }
}

/** Восстановить сохранённые данные пользователя userId в кеш запросов (до первого рендера). */
export function restoreCache(qc: QueryClient, userId: string | null) {
  const s = read();
  if (!s || !userId || s.owner !== userId) return;
  try {
    hydrate(qc, s.state as Parameters<typeof hydrate>[1]);
  } catch {
    clearCache();
  }
}

export function clearCache() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function save(qc: QueryClient) {
  if (!owner) return;
  const state = dehydrate(qc, {
    shouldDehydrateQuery: (q) => q.state.status === 'success' && !SKIP.has(String(q.queryKey[0])),
  });
  try {
    const raw = JSON.stringify({ v: VERSION, owner, savedAt: Date.now(), state } satisfies Saved);
    if (raw.length > MAX_SIZE) return; // слишком много — оставляем прошлое сохранение
    localStorage.setItem(KEY, raw);
  } catch {
    /* переполнен или приватный режим — просто не сохраняем */
  }
}

/** Сохранять кеш при каждом изменении (не чаще раза в 2 секунды) и при уходе со страницы. */
export function startPersist(qc: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  qc.getQueryCache().subscribe((e) => {
    if (e.type !== 'updated' || e.action.type !== 'success') return;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      save(qc);
    }, 2000);
  });
  const flush = () => {
    if (document.visibilityState === 'hidden') save(qc);
  };
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', () => save(qc));
}

/** Есть ли сейчас интернет (по мнению браузера). */
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
