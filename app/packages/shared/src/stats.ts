import { addDays, weekday } from './dates';
import type { Summary } from './types';

export const savingsRate = (income: number, expense: number) =>
  income > 0 ? Math.round(((income - expense) / income) * 100) : null;

/** Общая шкала интенсивности по квартилям и 92-му перцентилю расходов или доходов. */
export function calendarHeat(daily: Summary['daily'], from: string, to: string, today: string, weekStart: 0 | 1, kind: 'income' | 'expense') {
  const amounts = new Map(daily.filter(d => d.date >= from && d.date <= to && d.date <= today).map(d => [d.date, d[kind]]));
  const values = [...amounts.values()].filter(v => v > 0).sort((a, b) => a - b);
  const steps = [0.25, 0.5, 0.75, 0.92].map(q => values[Math.floor(q * values.length)]);
  const level = (v: number) => v > 0 ? 1 + steps.filter(s => v > s).length : 0;
  const weeks: string[][] = [];
  let zeroDays = 0;
  const start = addDays(from, -((weekday(from) - weekStart + 7) % 7));
  for (let d = start; d <= to; d = addDays(d, 7)) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(d, i));
    zeroDays += week.filter(date => date >= from && date <= to && date <= today && !amounts.get(date)).length;
    weeks.push(week);
  }
  return { amounts, hasValues: !!values.length, weeks, zeroDays, level };
}
