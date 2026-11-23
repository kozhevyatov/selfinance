import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { formatMoney, type Limits, type Recurring } from '@selfinance/shared';
import { KEYS, load, save } from './storage';

/**
 * Локальные уведомления (без push-сервера): телефон сам напомнит о регулярных платежах
 * и предупредит, когда потрачено 80% и 100% лимита месяца.
 * Расписание пересобирается каждый раз, когда приложение получает свежие данные.
 */
export interface NotifySettings {
  payments: boolean;
  limit: boolean;
  /** час напоминания о платежах (по времени телефона) */
  hour: number;
}

export const NOTIFY_DEFAULTS: NotifySettings = { payments: false, limit: false, hour: 10 };
export const NOTIFY_HOURS = [8, 9, 10, 12, 18, 20].map((h) => ({ value: h, label: `в ${h}:00` }));

const CHANNEL = 'reminders';
const PREFIX = 'sf-pay-';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function loadNotify(): Promise<NotifySettings> {
  return { ...NOTIFY_DEFAULTS, ...(await load<NotifySettings>(KEYS.notify)) };
}

export async function saveNotify(s: NotifySettings) {
  await save(KEYS.notify, s);
}

/** Спросить разрешение на уведомления. false — пользователь запретил. */
export async function askPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Напоминания',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const r = await Notifications.requestPermissionsAsync();
  return r.granted;
}

async function permitted() {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

const atHour = (iso: string, hour: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0);
};
const addDaysIso = (iso: string, n: number) => {
  const dt = atHour(iso, 12);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

function payBody(r: Recurring, daysLeft: number) {
  const sum = `${r.amountVaries ? '≈ ' : ''}${formatMoney(r.amount)}`;
  const when = daysLeft === 0 ? 'сегодня' : daysLeft === 1 ? 'завтра' : `через ${daysLeft} ${daysLeft < 5 ? 'дня' : 'дней'}`;
  return `${r.type === 'income' ? 'Поступление' : 'Платёж'} ${when}: ${sum}`;
}

let lastPlan = '';

/**
 * Запланировать напоминания о ближайших регулярных платежах: за remindDays дней и в сам день.
 * Старые напоминания удаляются, поэтому оплаченные и изменённые правила не напомнят зря.
 */
export async function schedulePayments(rules: Recurring[], budgetName: string | null) {
  const s = await loadNotify();
  const plan = s.payments
    ? rules
        .filter((r) => !r.isPaused)
        .flatMap((r) => {
          const days = [...new Set([Math.max(0, r.remindDays), 0])];
          return days.map((d) => ({ r, d, when: atHour(addDaysIso(r.nextDue, -d), s.hour) }));
        })
        .filter((x) => x.when.getTime() > Date.now() + 60_000)
        .sort((a, b) => a.when.getTime() - b.when.getTime())
        .slice(0, 40) // iOS держит не больше 64 запланированных уведомлений
    : [];
  const sig = JSON.stringify(plan.map((x) => [x.r.id, x.r.amount, x.d, x.when.getTime()])) + budgetName;
  if (sig === lastPlan) return;
  lastPlan = sig;

  try {
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      existing.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
    if (!plan.length || !(await permitted())) return;
    for (const { r, d, when } of plan) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${PREFIX}${r.id}-${d}`,
        content: {
          title: budgetName ? `${r.name} · ${budgetName}` : r.name,
          body: payBody(r, d),
          data: { recurringId: r.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
          channelId: CHANNEL,
        },
      });
    }
  } catch {
    lastPlan = '';
  }
}

/** Предупредить, когда потрачено 80% и 100% лимита месяца — по одному разу за месяц. */
export async function checkLimit(limits: Limits | undefined, budgetId: string) {
  const o = limits?.overall;
  if (!limits?.isCurrent || !o || o.limit <= 0) return;
  const s = await loadNotify();
  if (!s.limit) return;
  const pct = o.spent / o.limit;
  const level = pct >= 1 ? 100 : pct >= 0.8 ? 80 : 0;
  if (!level) return;
  const key = `${budgetId}:${limits.month}`;
  const fired = (await load<Record<string, number>>(KEYS.limitFired)) ?? {};
  if ((fired[key] ?? 0) >= level) return;
  fired[key] = level;
  // старые месяцы не храним
  for (const k of Object.keys(fired)) if (!k.endsWith(limits.month)) delete fired[k];
  await save(KEYS.limitFired, fired);
  if (!(await permitted())) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: level === 100 ? 'Лимит месяца превышен' : 'Потрачено 80% лимита',
      body:
        level === 100
          ? `Потрачено ${formatMoney(o.spent)} при лимите ${formatMoney(o.limit)}`
          : `Потрачено ${formatMoney(o.spent)} из ${formatMoney(o.limit)}, осталось ${formatMoney(Math.max(0, o.limit - o.spent))}`,
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  });
}

/** Убрать все запланированные напоминания (выход из аккаунта). */
export async function clearNotifications() {
  lastPlan = '';
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* модуль недоступен */
  }
  await save(KEYS.limitFired, null);
}

/** Нажали на напоминание о платеже — вернуть id правила. */
const handled = new Set<string>();

export function onPaymentTap(fn: (recurringId: string) => void) {
  const handle = (resp: Notifications.NotificationResponse | null) => {
    if (!resp) return;
    const n = resp.notification;
    const tag = `${n.request.identifier}@${n.date}`;
    if (handled.has(tag)) return; // одно и то же нажатие не обрабатываем дважды
    handled.add(tag);
    const id = n.request.content.data?.recurringId;
    if (typeof id === 'string') fn(id);
  };
  void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
