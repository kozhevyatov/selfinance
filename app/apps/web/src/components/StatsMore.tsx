import { useState } from 'react';
import { MONTHS_GEN, MONTHS_NOM, calendarHeat, formatMoney, savingsRate, type Anomaly, type CategoryMatrix, type DynamicsPoint, type InsightTx, type Insights } from '@selfinance/shared';
import { CatIcon } from '../lib/icons';
import type { Lookups } from '../lib/lookups';
import { plural } from './HomeWidgets';
import { Money } from './Money';

const FALLBACK = '#8A8F9C';
const SHORT = MONTHS_NOM.map((m) => m.slice(0, 3).toLowerCase());
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const rub = (v: number) => formatMoney(Math.round(v / 100) * 100);
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Короткая сумма для тесных мест: 950, 12,3к, 1,2м (в рублях). */
export function shortMoney(kop: number) {
  const r = Math.round(kop / 100);
  const a = Math.abs(r);
  const f = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: v < 10 ? 1 : 0 });
  if (a >= 1_000_000) return f(r / 1_000_000) + 'м';
  if (a >= 1000) return f(r / 1000) + 'к';
  return String(r);
}

const dateShort = (d: string) => `${Number(d.slice(8))} ${MONTHS_GEN[Number(d.slice(5, 7)) - 1].slice(0, 3)}`;

/* ---------- Плитки: операций, средний чек, норма сбережений ---------- */

export function KpiRow({ ins, income, expense, showSavings }: { ins: Insights; income: number; expense: number; showSavings: boolean }) {
  const rate = savingsRate(income, expense);
  const m = ins.mandatory;
  const spent = m.regular + m.excludedCats + m.planned + m.free;
  return (
    <div className="kpi-row">
      <div className="kpi">
        <span>Операций расхода</span>
        <b className="num">{ins.expenseCount}</b>
        {ins.incomeCount > 0 && <small>и {ins.incomeCount} {plural(ins.incomeCount, 'доход', 'дохода', 'доходов')}</small>}
      </div>
      <div className="kpi">
        <span>Средний чек</span>
        <b><Money value={ins.avgExpense} round /></b>
      </div>
      {showSavings && (
        <div className="kpi">
          <span>Норма сбережений</span>
          <b className={'num ' + (rate === null ? '' : rate >= 0 ? 'inc' : 'exp')}>{rate === null ? '—' : `${rate}%`}</b>
          <small>{rate === null ? 'доходов за период нет' : rate >= 0 ? 'дохода осталось' : 'тратите больше, чем получаете'}</small>
        </div>
      )}
      {spent > 0 && (
        <div className="kpi">
          <span>Обязательные</span>
          <b className="num">{pctOf(m.regular + m.excludedCats, spent)}%</b>
          <small>от всех расходов</small>
        </div>
      )}
    </div>
  );
}

/* ---------- Обязательные / свободные ---------- */

export function MandatoryBlock({ m }: { m: Insights['mandatory'] }) {
  const total = m.regular + m.excludedCats + m.planned + m.free;
  if (!total) return <div className="empty"><p>Расходов за период нет</p></div>;
  const parts = [
    { k: 'reg', label: 'Регулярные платежи', v: m.regular, c: 'var(--accent)' },
    { k: 'exc', label: 'Категории вне лимита', v: m.excludedCats, c: 'var(--frozen)' },
    { k: 'pl', label: 'Покупки по плану', v: m.planned, c: 'var(--credit)' },
    { k: 'free', label: 'Свободные траты', v: m.free, c: 'var(--expense)' },
  ].filter((p) => p.v > 0);
  return (
    <div className="mand">
      <div className="mand-bar" role="img" aria-label="Доли расходов">
        {parts.map((p) => (
          <i key={p.k} style={{ width: `${(p.v / total) * 100}%`, background: p.c }} title={`${p.label}: ${rub(p.v)}`} />
        ))}
      </div>
      <div className="mand-list">
        {parts.map((p) => (
          <div key={p.k} className="mand-row">
            <span><i style={{ background: p.c }} />{p.label}</span>
            <span className="muted num">{pctOf(p.v, total)}%</span>
            <Money value={p.v} round />
          </div>
        ))}
      </div>
      <p className="stx-hint">Обязательные — регулярные платежи и категории с отметкой «не учитывать в лимите».</p>
    </div>
  );
}

/* ---------- Дни недели ---------- */

export function WeekdaysChart({ ins, weekStart }: { ins: Insights; weekStart: 0 | 1 }) {
  const order = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
  const list = order.map((i) => ins.weekdays[i]);
  const max = Math.max(1, ...list.map((w) => w.avg));
  if (!list.some((w) => w.total)) return <div className="empty"><p>Расходов за период нет</p></div>;
  const top = list.reduce((a, b) => (b.avg > a.avg ? b : a));
  const sum = (ws: typeof list) => {
    const d = ws.reduce((a, w) => a + w.days, 0);
    return d ? ws.reduce((a, w) => a + w.total, 0) / d : 0;
  };
  const workdays = sum(list.filter((w) => w.weekday >= 1 && w.weekday <= 5));
  const weekend = sum(list.filter((w) => w.weekday === 0 || w.weekday === 6));
  return (
    <div className="wd">
      <div className="wd-bars">
        {list.map((w) => (
          <div key={w.weekday} className={'wd-col' + (w === top ? ' top' : '')} title={`${WD[w.weekday]}: в среднем ${rub(w.avg)} за день, всего ${rub(w.total)}`}>
            <small className="num">{w.avg ? shortMoney(w.avg) : ''}</small>
            <i style={{ height: `${Math.max(2, (w.avg / max) * 100)}%` }} />
            <span className={w.weekday === 0 || w.weekday === 6 ? 'we' : ''}>{WD[w.weekday]}</span>
          </div>
        ))}
      </div>
      <div className="days-note">
        <span>Будни — <b><Money value={workdays} round /></b> в день</span>
        <span>Выходные — <b><Money value={weekend} round /></b> в день</span>
      </div>
    </div>
  );
}

/* ---------- Крупнейшие операции ---------- */

export function TopOps({ list, l, kind }: { list: InsightTx[]; l: Lookups; kind: 'expense' | 'income' }) {
  if (!list.length) return <div className="empty"><p>{kind === 'expense' ? 'Расходов' : 'Доходов'} за период нет</p></div>;
  return (
    <div className="top-ops">
      {list.map((t, i) => {
        const cat = l.category(t.categoryId);
        return (
          <div key={t.id} className="top-op">
            <span className="top-n muted num">{i + 1}</span>
            <span className="cat-ic sm" style={{ ['--c' as string]: cat?.color ?? FALLBACK }}>
              <CatIcon name={cat?.icon ?? 'dots'} size={16} />
            </span>
            <span className="top-main">
              <span className="top-title">{t.comment || cat?.name || 'Без категории'}</span>
              <small className="muted">
                {dateShort(t.date)}
                {t.comment && cat ? ` · ${cat.name}` : ''}
                {l.multiAccount && l.account(t.accountId) ? ` · ${l.account(t.accountId)!.name}` : ''}
              </small>
            </span>
            <Money value={t.amount} round className={kind === 'expense' ? 'exp' : 'inc'} />
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Аномалии ---------- */

export function Anomalies({ list, periods, l }: { list: Anomaly[]; periods: number; l: Lookups }) {
  if (!periods) return <div className="empty"><p>Пока не с чем сравнивать — нужен прошлый период с операциями</p></div>;
  if (!list.length) return <div className="empty"><p>Всё как обычно — заметных отклонений нет</p></div>;
  const up = list.filter((a) => a.diff > 0);
  const down = list.filter((a) => a.diff < 0);
  const row = (a: Anomaly) => {
    const cat = l.category(a.categoryId);
    const bad = a.diff > 0;
    return (
      <div key={a.categoryId ?? 'none'} className="anom">
        <span className="cat-ic sm" style={{ ['--c' as string]: cat?.color ?? FALLBACK }}>
          <CatIcon name={cat?.icon ?? 'dots'} size={16} />
        </span>
        <span className="top-main">
          <span className="top-title">{cat?.name ?? 'Без категории'}</span>
          <small className="muted"><Money value={a.amount} round /> вместо обычных <Money value={a.expected} round /></small>
        </span>
        <span className={'anom-d num ' + (bad ? 'exp' : 'inc')}>
          {a.pct === null ? 'новое' : `${a.diff > 0 ? '▲' : '▼'} ${Math.abs(Math.round(a.pct * 100))}%`}
          <small>{a.diff > 0 ? '+' : '−'}{shortMoney(Math.abs(a.diff))}</small>
        </span>
      </div>
    );
  };
  return (
    <div className="anoms">
      {up.length > 0 && <><h3>Выросли</h3>{up.map(row)}</>}
      {down.length > 0 && <><h3>Снизились</h3>{down.map(row)}</>}
      <p className="stx-hint">
        Сравнение со средним за {periods} {plural(periods, 'прошлый период', 'прошлых периода', 'прошлых периодов')}; для текущего — за то же число дней.
      </p>
    </div>
  );
}

/* ---------- Категории × месяцы ---------- */

export function MatrixTable({ data, l, type, current, sub }: { data: CategoryMatrix; l: Lookups; type: 'expense' | 'income'; current?: string; sub?: boolean }) {
  if (!data.rows.length) return <div className="empty"><p>{type === 'expense' ? 'Расходов' : 'Доходов'} за эти месяцы нет</p></div>;
  const color = type === 'expense' ? 'var(--expense)' : 'var(--income)';
  const totals = data.months.map((_, i) => data.rows.reduce((a, r) => a + r.values[i], 0));
  return (
    <div className="mx-wrap">
      <table className="mx">
        <thead>
          <tr>
            <th className="mx-cat">Категория</th>
            {data.months.map((m) => (
              <th key={m} className={m === current ? 'cur' : ''}>
                {SHORT[Number(m.slice(5)) - 1]}
                {m.endsWith('-01') ? <small> {m.slice(2, 4)}</small> : null}
              </th>
            ))}
            <th className="mx-avg">В среднем</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => {
            const cat = l.category(r.categoryId);
            const name = cat ? (sub && !cat.parentId ? `${cat.name} (без подкатегории)` : cat.name) : 'Без категории';
            return (
              <tr key={r.categoryId ?? 'none'}>
                <th className="mx-cat">
                  <span className="dot" style={{ background: cat?.color ?? FALLBACK }} />
                  {name}
                </th>
                {r.values.map((v, i) => (
                  <td
                    key={i}
                    className={'num' + (data.months[i] === current ? ' cur' : '')}
                    style={v ? { ['--heat' as string]: String(0.1 + (v / (r.max || 1)) * 0.5), ['--hc' as string]: color } : undefined}
                    title={`${MONTHS_NOM[Number(data.months[i].slice(5)) - 1]}: ${rub(v)}`}
                  >
                    {v ? shortMoney(v) : '·'}
                  </td>
                ))}
                <td className="num mx-avg">{shortMoney(r.avg)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th className="mx-cat">Всего</th>
            {totals.map((v, i) => (
              <td key={i} className={'num' + (data.months[i] === current ? ' cur' : '')}>{v ? shortMoney(v) : '·'}</td>
            ))}
            <td className="num mx-avg">{shortMoney(data.activeMonths ? totals.reduce((a, b) => a + b, 0) / data.activeMonths : 0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ---------- Год по месяцам ---------- */

export function MonthsTable({ points, today }: { points: DynamicsPoint[]; today: string }) {
  const curMonth = today.slice(0, 7);
  const start = points.findIndex((p) => p.income || p.expense);
  const used = start < 0 ? [] : points.slice(start).filter((p) => p.month <= curMonth);
  if (!used.length) return <div className="empty"><p>Операций за эти месяцы нет</p></div>;
  const done = used.filter((p) => p.month < curMonth);
  const net = (p: DynamicsPoint) => p.income - p.expense;
  const best = done.length > 1 ? done.reduce((a, b) => (net(b) > net(a) ? b : a)) : null;
  const worst = done.length > 1 ? done.reduce((a, b) => (net(b) < net(a) ? b : a)) : null;
  const sum = (k: 'income' | 'expense') => used.reduce((a, p) => a + p[k], 0);
  const inc = sum('income');
  const exp = sum('expense');
  const rate = (i: number, e: number) => (i > 0 ? `${Math.round(((i - e) / i) * 100)}%` : '—');
  return (
    <div className="mx-wrap">
      <table className="mt">
        <thead>
          <tr>
            <th>Месяц</th>
            <th>Доход</th>
            <th>Расход</th>
            <th>Итог</th>
            <th>Сбережения</th>
          </tr>
        </thead>
        <tbody>
          {[...used].reverse().map((p) => (
            <tr key={p.month} className={p.month === curMonth ? 'cur' : ''}>
              <th>
                {MONTHS_NOM[Number(p.month.slice(5)) - 1]} {p.month.slice(0, 4) !== today.slice(0, 4) ? p.month.slice(0, 4) : ''}
                {p === best && <span className="tag inc">лучший</span>}
                {p === worst && <span className="tag exp">худший</span>}
                {p.month === curMonth && <span className="tag">идёт</span>}
              </th>
              <td><Money value={p.income} round className="inc" /></td>
              <td><Money value={p.expense} round className="exp" /></td>
              <td><Money value={net(p)} round sign="always" className={net(p) >= 0 ? 'inc' : 'exp'} /></td>
              <td className="num">{rate(p.income, p.expense)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Всего</th>
            <td><Money value={inc} round /></td>
            <td><Money value={exp} round /></td>
            <td><Money value={inc - exp} round sign="always" /></td>
            <td className="num">{rate(inc, exp)}</td>
          </tr>
          {done.length > 0 && (
            <tr className="muted">
              <th>В среднем за месяц</th>
              <td><Money value={done.reduce((a, p) => a + p.income, 0) / done.length} round /></td>
              <td><Money value={done.reduce((a, p) => a + p.expense, 0) / done.length} round /></td>
              <td><Money value={done.reduce((a, p) => a + net(p), 0) / done.length} round sign="always" /></td>
              <td className="num">{done.length} {plural(done.length, 'полный месяц', 'полных месяца', 'полных месяцев')}</td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}

/* ---------- Капитал по месяцам: свободные / замороженные / долг ---------- */

export function CapitalSplitChart({ points, current }: { points: DynamicsPoint[]; current?: string }) {
  if (!points.length || points[0].free === undefined) return <div className="empty"><p>Обновите сервер, чтобы увидеть разбивку</p></div>;
  const up = (p: DynamicsPoint) => Math.max(0, p.free ?? 0) + Math.max(0, p.frozen ?? 0);
  const maxUp = Math.max(1, ...points.map(up));
  const maxDown = Math.max(0, ...points.map(p => Math.max(0, -(p.free ?? 0)) + Math.max(0, -(p.frozen ?? 0)) + (p.debt ?? 0)));
  const span = maxUp + maxDown;
  const zero = (maxUp / span) * 100; // где проходит ноль, % сверху
  const n = points.length;
  const last = points[n - 1];
  const hasFrozen = points.some((p) => (p.frozen ?? 0) !== 0);
  const hasDebt = points.some(p => (p.debt ?? 0) > 0);
  return (
    <div className="dyn">
      <div className="cap-plot" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {points.map((p) => (
          <div
            key={p.month}
            className={'cap-col' + (p.month === current ? ' cur' : '')}
            title={`${MONTHS_NOM[Number(p.month.slice(5)) - 1]} ${p.month.slice(0, 4)}: свободные ${rub(p.free ?? 0)}, замороженные ${rub(p.frozen ?? 0)}${p.debt ? `, долг ${rub(p.debt)}` : ''}`}
          >
            <div className="cap-up" style={{ height: `${zero}%` }}>
              <i className="c-frozen" style={{ height: `${(Math.max(0, p.frozen ?? 0) / maxUp) * 100}%` }} />
              <i className="c-free" style={{ height: `${(Math.max(0, p.free ?? 0) / maxUp) * 100}%` }} />
            </div>
            {maxDown > 0 && (
              <div className="cap-down" style={{ height: `${100 - zero}%` }}>
                <i className="c-free" style={{ height: `${(Math.max(0, -(p.free ?? 0)) / maxDown) * 100}%` }} />
                <i className="c-frozen" style={{ height: `${(Math.max(0, -(p.frozen ?? 0)) / maxDown) * 100}%` }} />
                <i className="c-debt" style={{ height: `${((p.debt ?? 0) / maxDown) * 100}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="dyn-axis" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {points.map((p) => (
          <span key={p.month} className={p.month === current ? 'cur' : ''}>
            {SHORT[Number(p.month.slice(5)) - 1]}
            {p.month.endsWith('-01') && n > 6 ? ` ${p.month.slice(2, 4)}` : ''}
          </span>
        ))}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--accent)' }} />Свободные, {rub(last.free ?? 0)}</span>
        {hasFrozen && <span><i style={{ background: 'var(--frozen)' }} />Замороженные, {rub(last.frozen ?? 0)}</span>}
        {hasDebt && <span><i style={{ background: 'var(--credit)' }} />Долг, {rub(last.debt ?? 0)}</span>}
      </div>
    </div>
  );
}

/* ---------- Календарь трат ---------- */

export function CalendarHeat({ daily, from, to, today, weekStart, kind }: { daily: { date: string; expense: number; income: number }[]; from: string; to: string; today: string; weekStart: 0 | 1; kind: 'expense' | 'income' }) {
  const [selected, select] = useState('');
  const { amounts: map, hasValues, weeks, zeroDays, level } = calendarHeat(daily, from, to, today, weekStart, kind);
  if (!hasValues) return <div className="empty"><p>{kind === 'expense' ? 'Расходов' : 'Доходов'} за период нет</p></div>;
  const rows = Array.from({ length: 7 }, (_, i) => WD[(i + weekStart) % 7]);
  const color = kind === 'expense' ? 'var(--expense)' : 'var(--income)';
  return (
    <div className="cal" style={{ ['--hc' as string]: color }}>
      <div className="cal-scroll">
        <div className="cal-grid" style={{ gridTemplateColumns: `auto repeat(${weeks.length}, 15px)` }}>
          <span />
          {weeks.map((w, i) => {
            const first = w.find((d) => d.endsWith('-01') && d >= from && d <= to);
            return <span key={i} className="cal-m">{first ? SHORT[Number(first.slice(5, 7)) - 1] : ''}</span>;
          })}
          {rows.map((r, ri) => [
            <span key={'l' + ri} className="cal-wd">{ri % 2 === 0 ? r : ''}</span>,
            ...weeks.map((w) => {
              const d = w[ri];
              if (d < from || d > to) return <i key={d} className="cal-d out" />;
              if (d > today) return <i key={d} className="cal-d future" />;
              const v = map.get(d) ?? 0;
              return <button key={d} type="button" onClick={() => select(d)} aria-pressed={selected === d} aria-label={`${dateShort(d)}: ${formatMoney(v)}`} className={'cal-d l' + level(v) + (d === today ? ' today' : '')} title={`${dateShort(d)}: ${rub(v)}`} />;
            }),
          ])}
        </div>
      </div>
      <div className="cal-foot">
        <span className="muted">{kind === 'expense' ? `Дней без трат: ${zeroDays}` : `Дней без доходов: ${zeroDays}`}</span>
        {selected && <span aria-live="polite">{dateShort(selected)} · {formatMoney(map.get(selected) ?? 0)}</span>}
        <span className="cal-legend">
          меньше
          {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} className={'cal-d l' + i} />)}
          больше
        </span>
      </div>
    </div>
  );
}
