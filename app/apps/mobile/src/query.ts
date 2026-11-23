import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { readJson, removeFile, writeJson } from './disk';

/**
 * Маленький кеш запросов вместо TanStack Query: данные экрана показываются сразу из памяти,
 * а после любого изменения (сохранили операцию, вернулись в приложение) всё перезапрашивается.
 * Кеш сохраняется на устройстве — без интернета приложение показывает последние данные.
 */
interface Entry {
  data?: unknown;
  error?: unknown;
  promise?: Promise<void>;
  stale: boolean;
  at: number;
}

const STALE_MS = 30_000;
const cache = new Map<string, Entry>();
const subs = new Map<string, Set<() => void>>();
const refetchers = new Set<() => void>();

function notify(key: string) {
  subs.get(key)?.forEach((fn) => fn());
}

/** Пометить все данные устаревшими и перезапросить то, что сейчас на экране. */
export function invalidateAll() {
  for (const e of cache.values()) e.stale = true;
  refetchers.forEach((fn) => fn());
}

/** Положить данные в кеш вручную (например, результат принудительной проверки). */
export function setQueryData(key: string, data: unknown) {
  const e = cache.get(key) ?? { stale: false, at: 0 };
  e.data = data;
  e.error = undefined;
  e.at = Date.now();
  e.stale = false;
  cache.set(key, e);
  schedulePersist();
  notify(key);
}

/* ---------- сохранение на устройстве ---------- */

const MAX_SIZE = 4_000_000; // ~4 МБ
let owner: string | null = null; // свой файл для каждого сервера и пользователя
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const fileOf = (o: string) => `cache-${o}.json`;

function schedulePersist() {
  if (!owner) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!owner) return;
    const out: Record<string, { data: unknown; at: number }> = {};
    for (const [k, e] of cache) if (e.data !== undefined) out[k] = { data: e.data, at: e.at };
    const json = JSON.stringify(out);
    if (json.length <= MAX_SIZE) void writeJson(fileOf(owner), out);
  }, 1500);
}

/** Загрузить сохранённые данные пользователя (при запуске и после входа). */
export async function restoreCache(o: string) {
  owner = o;
  const saved = await readJson<Record<string, { data: unknown; at: number }>>(fileOf(o));
  if (!saved || owner !== o) return;
  for (const [k, v] of Object.entries(saved)) {
    if (!cache.has(k)) cache.set(k, { data: v.data, at: v.at, stale: true });
  }
}

/** Забыть всё (выход, смена сервера); removeSaved — удалить и сохранённый файл. */
export function clearCache(removeSaved = false) {
  cache.clear();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (removeSaved && owner) removeFile(fileOf(owner));
  owner = null;
}

/* ---------- запросы ---------- */

export interface QueryResult<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean; // первая загрузка, данных ещё нет
  fetching: boolean; // идёт запрос (в том числе фоновое обновление)
  refetch: () => Promise<void>;
}

export function useQuery<T>(key: string | null, fn: () => Promise<T>): QueryResult<T> {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    if (!key) return;
    let e = cache.get(key);
    if (!e) cache.set(key, (e = { stale: true, at: 0 }));
    if (e.promise) return e.promise;
    const entry = e;
    entry.promise = fnRef
      .current()
      .then((d) => {
        entry.data = d;
        entry.error = undefined;
        entry.at = Date.now();
        schedulePersist();
      })
      .catch((err) => {
        // без связи оставляем сохранённые данные, ошибка видна, только если данных нет
        entry.error = err;
      })
      .finally(() => {
        entry.promise = undefined;
        entry.stale = false;
        if (!entry.at) entry.at = -1;
        notify(key);
      });
    notify(key);
    return entry.promise;
  }, [key]);

  useEffect(() => {
    if (!key) return;
    let set = subs.get(key);
    if (!set) subs.set(key, (set = new Set()));
    set.add(force);
    const e = cache.get(key);
    if (!e || e.stale || Date.now() - e.at > STALE_MS) void run();
    refetchers.add(run);
    return () => {
      set!.delete(force);
      refetchers.delete(run);
    };
  }, [key, run]);

  const e = key ? cache.get(key) : undefined;
  return {
    data: e?.data as T | undefined,
    error: e?.error,
    loading: !!key && e?.data === undefined && (!e || !!e.promise || e.at === 0),
    fetching: !!e?.promise,
    refetch: run,
  };
}

/** Лента с подгрузкой страниц по курсору. Первая страница сохраняется — её видно и без интернета. */
export function usePaged<T>(key: string | null, fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>) {
  const saved = () => (key ? (cache.get('paged:' + key)?.data as { items: T[]; nextCursor: string | null } | undefined) : undefined);
  const [items, setItems] = useState<T[]>(() => saved()?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<{ loading: boolean; more: boolean; error: unknown }>({ loading: true, more: false, error: null });
  const fnRef = useRef(fetchPage);
  fnRef.current = fetchPage;
  const req = useRef(0);

  const reload = useCallback(async () => {
    if (!key) return;
    const id = ++req.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await fnRef.current(null);
      if (id !== req.current) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setState({ loading: false, more: false, error: null });
      cache.set('paged:' + key, { data: page, at: Date.now(), stale: false });
      schedulePersist();
    } catch (err) {
      if (id !== req.current) return;
      setState({ loading: false, more: false, error: err });
    }
  }, [key]);

  const loadMore = useCallback(async () => {
    if (!cursor || state.loading || state.more) return;
    const id = req.current;
    setState((s) => ({ ...s, more: true }));
    try {
      const page = await fnRef.current(cursor);
      if (id !== req.current) return;
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setState({ loading: false, more: false, error: null });
    } catch (err) {
      if (id !== req.current) return;
      setState({ loading: false, more: false, error: err });
    }
  }, [cursor, state.loading, state.more]);

  useEffect(() => {
    // сразу показываем сохранённую первую страницу, потом обновляем с сервера
    setItems(saved()?.items ?? []);
    setCursor(null);
    void reload();
    refetchers.add(reload);
    return () => {
      refetchers.delete(reload);
    };
  }, [reload]); // eslint-disable-line react-hooks/exhaustive-deps

  return { items, hasMore: !!cursor, loading: state.loading, loadingMore: state.more, error: state.error, reload, loadMore };
}
