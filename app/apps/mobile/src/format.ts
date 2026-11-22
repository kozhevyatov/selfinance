import { MONTHS_GEN, parseISODate, type Recurring } from '@selfinance/shared';

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function dueLabel(daysLeft: number) {
  if (daysLeft < 0) return `просрочен на ${-daysLeft} ${plural(-daysLeft, 'день', 'дня', 'дней')}`;
  if (daysLeft === 0) return 'сегодня';
  if (daysLeft === 1) return 'завтра';
  return `через ${daysLeft} ${plural(daysLeft, 'день', 'дня', 'дней')}`;
}

export const shortDate = (date: string) => {
  const { m, d } = parseISODate(date);
  return `${d} ${MONTHS_GEN[m - 1]}`;
};

export function daysUntil(today: string, due: string) {
  const a = Date.parse(today + 'T00:00:00Z');
  const b = Date.parse(due + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/** Период регулярного платежа, в месяцах. */
export const PERIODS: { months: number; label: string }[] = [
  { months: 1, label: 'Каждый месяц' },
  { months: 2, label: 'Раз в 2 месяца' },
  { months: 3, label: 'Раз в квартал' },
  { months: 6, label: 'Раз в полгода' },
  { months: 12, label: 'Раз в год' },
];

export const REMIND = [
  { value: 0, label: 'в день платежа' },
  ...[1, 2, 3, 5, 7].map((n) => ({ value: n, label: `за ${n} ${plural(n, 'день', 'дня', 'дней')}` })),
];

/** «каждый месяц 5-го», «раз в квартал, 5-го» */
export function periodText(r: Pick<Recurring, 'intervalMonths' | 'dayOfMonth'>) {
  const m = r.intervalMonths || 1;
  if (m === 1) return `каждый месяц ${r.dayOfMonth}-го`;
  const p = PERIODS.find((x) => x.months === m)?.label.toLowerCase() ?? `раз в ${m} мес.`;
  return `${p}, ${r.dayOfMonth}-го`;
}

export const fmtDateLong = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
};
