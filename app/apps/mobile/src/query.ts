import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

/**
 * Маленький кеш запросов вместо TanStack Query: данные экрана показываются сразу из памяти,
 * а после любого изменения (сохранили операцию, вернулись в приложение) всё перезапрашивается.
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

/** Забыть всё (выход, смена сервера). */
export function clearCache() {
  cache.clear();
}

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
      })
      .catch((err) => {
        entry.error = err;
      })
      .finally(() => {
        entry.promise = undefined;
        entry.stale = false;
        entry.at = Date.now();
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

/** Лента с подгрузкой страниц по курсору. */
export function usePaged<T>(key: string | null, fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>) {
  const [items, setItems] = useState<T[]>([]);
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
    setItems([]);
    setCursor(null);
    void reload();
    refetchers.add(reload);
    return () => {
      refetchers.delete(reload);
    };
  }, [reload]);

  return { items, hasMore: !!cursor, loading: state.loading, loadingMore: state.more, error: state.error, reload, loadMore };
}
