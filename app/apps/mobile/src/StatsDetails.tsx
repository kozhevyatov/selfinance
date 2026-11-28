import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { calendarHeat, formatMoney, MONTHS_NOM, savingsRate, type CategoryMatrix, type DynamicsPoint, type Insights, type Summary } from '@selfinance/shared';
import type { Lookups } from './data';
import { plural, shortDate } from './format';
import { mix, useTheme } from './theme';
import { Card, Money, SectionTitle, T } from './ui';

const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const monthLabel = (m: string) => MONTHS_NOM[Number(m.slice(5, 7)) - 1].slice(0, 3) + ' ' + m.slice(2, 4);
const money = (v: number) => formatMoney(Math.round(v / 100) * 100);
export function rateLabel(income: number, expense: number) {
  const rate = savingsRate(income, expense);
  return rate === null ? '—' : rate + '%';
}

function Detail({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 5 }}>
    <View style={{ flex: 1 }}>
      <T>{label}</T>
      {hint && <T size={12} tone="muted">{hint}</T>}
    </View>
    {value}
  </View>;
}

export function InsightCards({ data, kind, l, weekStart }: { data: Insights; kind: 'all' | 'income' | 'expense'; l: Lookups; weekStart: 0 | 1 }) {
  const t = useTheme();
  const income = kind === 'income';
  const ops = income ? data.topIncome : data.topExpense;
  const groups = [
    ['Регулярные платежи', data.mandatory.regular],
    ['Категории вне лимита', data.mandatory.excludedCats],
    ['Покупки по плану', data.mandatory.planned],
    ['Свободные траты', data.mandatory.free],
  ] as const;
  const total = groups.reduce((sum, [, amount]) => sum + amount, 0);
  const maxAvg = Math.max(1, ...data.weekdays.map(w => w.avg));
  return <>
    {!income && <>
      <Card>
        <SectionTitle>Обязательные и свободные</SectionTitle>
        {total ? <>
          <T tone="muted" size={13}>Обязательные расходы включают регулярные платежи и категории вне лимита.</T>
          {groups.filter(([, v]) => v > 0).map(([label, v]) => <Detail key={label} label={label} hint={Math.round(100 * v / total) + '% расходов'} value={<Money value={v} round />} />)}
        </> : <T tone="muted">Расходов за период нет</T>}
      </Card>
      <Card>
        <SectionTitle>По дням недели</SectionTitle>
        {data.expenseCount ? <>
          <T tone="muted" size={13}>Средние расходы за день</T>
          {weekdays.map((_, i) => {
            const w = data.weekdays[(i + weekStart) % 7];
            return <View key={w.weekday} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
              <T size={13}>{weekdays[w.weekday]}</T>
              <View style={{ flex: 1 }}><View style={{ width: `${100 * w.avg / maxAvg}%`, height: 7, borderRadius: 4, backgroundColor: t.expense }} /></View>
              <Money value={w.avg} round size={13} />
            </View>;
          })}
        </> : <T tone="muted">Расходов за период нет</T>}
      </Card>
      <Card>
        <SectionTitle>Что изменилось по категориям</SectionTitle>
        <T tone="muted" size={13}>{data.anomalyPeriods ? `Прошлых периодов для сравнения: ${data.anomalyPeriods}` : 'Пока недостаточно данных для сравнения'}</T>
        {data.anomalyPeriods > 0 && !data.anomalies.length && <T>Заметных отклонений нет</T>}
        {data.anomalies.map(a => <Detail key={a.categoryId ?? 'none'} label={l.category(a.categoryId)?.name ?? 'Без категории'}
          hint={`${money(a.amount)} вместо обычных ${money(a.expected)}`}
          value={<Money value={a.diff} round sign="always" tone={a.diff > 0 ? 'expense' : 'income'} />} />)}
      </Card>
    </>}
    <Card>
      <SectionTitle>{income ? 'Крупнейшие доходы' : 'Крупнейшие траты'}</SectionTitle>
      {ops.map(op => {
        const category = l.category(op.categoryId)?.name ?? 'Без категории';
        const hint = [shortDate(op.date), op.comment && category, l.multiAccount && l.account(op.accountId)?.name].filter(Boolean).join(' · ');
        return <Detail key={op.id} label={op.comment || category} hint={hint} value={<Money value={op.amount} tone={income ? 'income' : 'expense'} />} />;
      })}
      {!ops.length && <T tone="muted">Операций за период нет</T>}
    </Card>
  </>;
}

export function HeatCalendar({ s, kind, today, weekStart }: { s: Summary; kind: 'income' | 'expense'; today: string; weekStart: 0 | 1 }) {
  const t = useTheme();
  const [selected, select] = useState('');
  const { weeks, amounts, hasValues, level, zeroDays } = calendarHeat(s.daily, s.from, s.to, today, weekStart, kind);
  const income = kind === 'income';
  return <Card>
    <SectionTitle>{income ? 'Календарь доходов' : 'Календарь трат'}</SectionTitle>
    {hasValues ? <>
      <ScrollView horizontal>
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', marginLeft: 26 }}>
            {weeks.map(w => {
              const first = w.find(d => d.endsWith('-01') && d >= s.from && d <= s.to);
              return <T key={w[0]} size={10} style={{ width: 28 }}>{first ? monthLabel(first).slice(0, 3) : ''}</T>;
            })}
          </View>
          {weekdays.map((_, i) => <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <T size={12} style={{ width: 26 }}>{weekdays[(weekStart + i) % 7]}</T>
            {weeks.map(w => {
              const d = w[i];
              const active = d >= s.from && d <= s.to && d <= today;
              const v = amounts.get(d) ?? 0;
              const color = v ? mix(t[kind], t.card, 0.18 + 0.16 * level(v)) : t.input;
              return <Pressable key={d} disabled={!active} onPress={() => select(d)} accessibilityRole="button" accessibilityLabel={shortDate(d) + ', ' + money(v)}
                style={{ width: 26, height: 26, marginRight: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? color : 'transparent', borderRadius: 4, borderWidth: active && selected === d ? 1 : 0, borderColor: t.text }}>
                {active && <T size={10}>{Number(d.slice(8))}</T>}
              </Pressable>;
            })}
          </View>)}
        </View>
      </ScrollView>
      <T tone="muted" size={13} style={{ marginTop: 8 }}>{selected ? shortDate(selected) + ' · ' + money(amounts.get(selected) ?? 0) : (income ? 'Дней без доходов' : 'Дней без трат') + ': ' + zeroDays}</T>
    </> : <T tone="muted">{income ? 'Доходов' : 'Расходов'} за период нет</T>}
  </Card>;
}

function Table({ headers, rows }: { headers: string[]; rows: { id: string; cells: string[] }[] }) {
  const t = useTheme();
  const row = (id: string, cells: string[], header = false) => <View key={id} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: t.border }}>
    {cells.map((v, i) => <T key={i} size={13} weight={header || !i ? '600' : '400'} style={{ width: i ? 110 : 136, textAlign: i ? 'right' : 'left', paddingVertical: 8, paddingHorizontal: 4 }}>{v}</T>)}
  </View>;
  return <ScrollView horizontal><View>{row('head', headers, true)}{rows.map(r => row(r.id, r.cells))}</View></ScrollView>;
}

export function MatrixView({ data, l, sub }: { data: CategoryMatrix; l: Lookups; sub: boolean }) {
  if (!data.rows.length) return <T tone="muted">Операций за эти месяцы нет</T>;
  return <Table headers={['Категория', ...data.months.map(monthLabel), 'В среднем']} rows={data.rows.map(r => {
    const c = l.category(r.categoryId);
    const label = c && sub && !c.parentId ? c.name + ' (без подкатегории)' : c?.name ?? 'Без категории';
    return { id: r.categoryId ?? 'none', cells: [label, ...r.values.map(v => v ? money(v) : '·'), money(r.avg)] };
  })} />;
}

export function MonthlyTable({ points, capital = false }: { points: DynamicsPoint[]; capital?: boolean }) {
  if (capital && points[0]?.free === undefined) return <T tone="muted">Для разбивки капитала обновите сервер</T>;
  const headers = capital ? ['Месяц', 'Свободные', 'Замороженные', 'Долг', 'Капитал'] : ['Месяц', 'Доход', 'Расход', 'Итог', 'Сбережения'];
  const flows = (i: number, e: number) => [money(i), money(e), money(i - e), rateLabel(i, e)];
  const rows = [...points].reverse().map(p => ({
    id: p.month, cells: [monthLabel(p.month), ...(capital ? [p.free ?? 0, p.frozen ?? 0, p.debt ?? 0, p.capital].map(money) : flows(p.income, p.expense))],
  }));
  if (!capital) {
    const income = points.reduce((sum, p) => sum + p.income, 0);
    const expense = points.reduce((sum, p) => sum + p.expense, 0);
    if (!income && !expense) return <T tone="muted">Операций за эти месяцы нет</T>;
    rows.push({ id: 'total', cells: ['Всего', ...flows(income, expense)] });
  }
  return <Table headers={headers} rows={rows} />;
}

export function FrequentCategories({ data, kind, l }: { data: Insights; kind: 'expense' | 'income'; l: Lookups }) {
  const list = data.frequentCategories?.[kind];
  const subject = kind === 'income' ? 'доходов' : 'расходов';
  return (
    <Card>
      <SectionTitle>Самые частые категории {subject}</SectionTitle>
      {!list ? <T tone="muted">Для рейтинга обновите сервер</T> : !list.length ? <T tone="muted">Операций за период нет</T> :
        list.map((row, i) => <Detail key={row.categoryId ?? 'none'} label={`${i + 1}. ${l.category(row.categoryId)?.name ?? 'Без категории'}`}
          value={<T weight="600">{row.count} {plural(row.count, 'операция', 'операции', 'операций')}</T>} />)}
    </Card>
  );
}
