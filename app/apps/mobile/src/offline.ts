import { useEffect, useReducer } from 'react';
import { AppState } from 'react-native';
import type { Transaction } from '@selfinance/shared';
import { api, ApiError, get, isOnline, onNetChange } from './api';
import { readJson, writeJson } from './disk';
import { invalidateAll } from './query';

/**
 * Изменения без интернета. Операции (и связанные с ними регулярные платежи) сохраняются в очередь
 * на устройстве и отправляются по порядку, как только появляется связь.
 * id новой операции задаёт приложение, поэтому повторная отправка не создаёт дубль.
 */

export type QueueKind = 'tx-create' | 'tx-update' | 'tx-delete' | 'other';

export interface QueueItem {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  budgetId: string;
  kind: QueueKind;
  /** id операции (для tx-*) */
  txId?: string;
  /** кто создал — для показа операции до отправки */
  userId?: string;
  createdAt: string;
}

export interface SyncFailure {
  title: string;
  message: string;
}

let queue: QueueItem[] = [];
let owner: string | null = null;
let userId = '';
let flushing = false;
let failures: SyncFailure[] = [];
const listeners = new Set<() => void>();
const fileOf = (o: string) => `queue-${o}.json`;

function changed() {
  if (owner) void writeJson(fileOf(owner), queue);
  listeners.forEach((fn) => fn());
}

/** Загрузить очередь пользователя (при запуске и после входа). Очередь не удаляется при выходе. */
export async function restoreQueue(o: string, user: string) {
  owner = o;
  userId = user;
  queue = (await readJson<QueueItem[]>(fileOf(o))) ?? [];
  listeners.forEach((fn) => fn());
  if (queue.length) void flush();
}

export function forgetQueueOwner() {
  owner = null;
  userId = '';
  queue = [];
  listeners.forEach((fn) => fn());
}

export const pendingCount = () => queue.length;
export const currentUserId = () => userId;

/** Подпись для подтверждения выхода, если есть неотправленные изменения. */
export function pendingNote(): string | undefined {
  const n = queue.length;
  if (!n) return undefined;
  const w = n % 10 === 1 && n % 100 !== 11 ? 'изменение не отправлено' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'изменения не отправлены' : 'изменений не отправлены';
  return `${n} ${w} — они сохранятся на телефоне и уйдут на сервер, когда вы снова войдёте.`;
}

/* ---------- id ---------- */

/** UUID v7: время + случайные биты, как на сервере. */
export function uuidv7(): string {
  const ts = Date.now().toString(16).padStart(12, '0');
  let r = '';
  for (let i = 0; i < 18; i++) r += Math.floor(Math.random() * 16).toString(16);
  const variant = '89ab'[Math.floor(Math.random() * 4)];
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${r.slice(0, 3)}-${variant}${r.slice(3, 6)}-${r.slice(6, 18)}`;
}

/* ---------- отправка или очередь ---------- */

const isNetwork = (e: unknown) => e instanceof ApiError && e.status === 0;

function enqueue(item: Omit<QueueItem, 'id' | 'createdAt'>) {
  const full: QueueItem = { ...item, id: uuidv7(), createdAt: new Date().toISOString(), userId };
  const created = full.txId ? queue.find((q) => q.kind === 'tx-create' && q.txId === full.txId) : undefined;
  if (created && full.kind === 'tx-update') {
    // операция ещё не отправлена — просто меняем её содержимое
    created.body = { ...created.body, ...full.body };
  } else if (created && full.kind === 'tx-delete') {
    // создана и удалена без связи — серверу о ней знать не нужно
    queue = queue.filter((q) => q.txId !== full.txId);
  } else {
    queue.push(full);
  }
  changed();
}

/**
 * Отправить изменение. Нет связи — положить в очередь и вернуть optimistic().
 * Если в очереди уже что-то есть, новое изменение встаёт за ним, чтобы сохранить порядок.
 */
export async function sendOrQueue<T>(item: Omit<QueueItem, 'id' | 'createdAt'>, optimistic: () => T): Promise<T> {
  if (!queue.length) {
    try {
      return await api<T>(item.method, item.path, item.body ?? (item.method === 'DELETE' ? undefined : {}));
    } catch (e) {
      if (!isNetwork(e)) throw e;
    }
  }
  enqueue(item);
  void flush();
  return optimistic();
}

/** Отправить очередь по порядку. Без связи — останавливаемся и ждём. */
export async function flush() {
  if (flushing || !queue.length) return;
  flushing = true;
  let done = 0;
  try {
    while (queue.length) {
      const it = queue[0];
      try {
        const res = await api<{ id?: string } | null>(it.method, it.path, it.body ?? (it.method === 'DELETE' ? undefined : {}));
        // старый сервер не принимает id от приложения — подставляем выданный им
        if (it.kind === 'tx-create' && it.txId && res?.id && res.id !== it.txId) remap(it.txId, res.id);
      } catch (e) {
        if (isNetwork(e)) break;
        // сервер отклонил (например, счёт удалили) — убираем из очереди и сообщаем
        failures.push({ title: describe(it), message: e instanceof Error ? e.message : 'Ошибка' });
      }
      queue = queue.filter((q) => q.id !== it.id);
      done++;
      changed();
    }
  } finally {
    flushing = false;
    if (done) invalidateAll();
    listeners.forEach((fn) => fn());
  }
}

function remap(from: string, to: string) {
  for (const q of queue) {
    if (q.txId === from) q.txId = to;
    q.path = q.path.split(from).join(to);
    if (q.body) for (const [k, v] of Object.entries(q.body)) if (v === from) q.body[k] = to;
  }
}

function describe(it: QueueItem) {
  if (it.kind === 'tx-create') return 'Новая операция';
  if (it.kind === 'tx-update') return 'Изменение операции';
  if (it.kind === 'tx-delete') return 'Удаление операции';
  return 'Изменение';
}

/** Ошибки отправки, накопленные с прошлого показа. */
export function takeFailures(): SyncFailure[] {
  const f = failures;
  failures = [];
  return f;
}

/* ---------- как показывать операции до отправки ---------- */

export interface PendingTx {
  created: Transaction[];
  updated: Map<string, Record<string, unknown>>;
  deleted: Set<string>;
  ids: Set<string>;
}

export function pendingTx(budgetId: string): PendingTx {
  const created: Transaction[] = [];
  const updated = new Map<string, Record<string, unknown>>();
  const deleted = new Set<string>();
  const ids = new Set<string>();
  for (const q of queue) {
    if (q.budgetId !== budgetId || !q.txId) continue;
    ids.add(q.txId);
    if (q.kind === 'tx-create') created.push(txFromBody(q));
    else if (q.kind === 'tx-update') updated.set(q.txId, { ...updated.get(q.txId), ...q.body });
    else if (q.kind === 'tx-delete') deleted.add(q.txId);
  }
  return { created, updated, deleted, ids };
}

/** Операция из тела запроса — такой она будет на сервере после отправки. */
export function txFromBody(q: Pick<QueueItem, 'txId' | 'body' | 'createdAt' | 'userId'>): Transaction {
  const b = (q.body ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : null);
  return {
    id: q.txId!,
    type: (b.type as Transaction['type']) ?? 'expense',
    amount: Number(b.amount ?? 0),
    date: s('date') ?? q.createdAt.slice(0, 10),
    time: s('time'),
    accountId: s('accountId') ?? '',
    toAccountId: s('toAccountId'),
    categoryId: s('categoryId'),
    comment: s('comment'),
    createdBy: q.userId ?? '',
    createdAt: q.createdAt,
    recurringId: s('recurringId'),
    plannedId: s('plannedId'),
    linkedBudget: null,
    transferGroupId: null,
  };
}

/** Перерисовка при изменении очереди. */
export function useQueue() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return { pending: queue.length, flushing };
}

/* ---------- когда пробовать отправить ---------- */

let started = false;

/** Запускается один раз: связь вернулась, приложение открыли, раз в 15 секунд без связи. */
export function startSync() {
  if (started) return;
  started = true;
  onNetChange((online) => {
    if (online) void flush();
    listeners.forEach((fn) => fn());
  });
  AppState.addEventListener('change', (st) => {
    if (st === 'active') void flush();
  });
  setInterval(() => {
    if (queue.length) void flush();
    // нет связи и нечего отправлять — проверяем, не вернулась ли она
    else if (!isOnline()) get('/meta').catch(() => undefined);
  }, 15_000);
}
