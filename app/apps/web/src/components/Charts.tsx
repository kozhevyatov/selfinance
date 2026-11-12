import { useState } from 'react';
import { MONTHS_NOM, formatMoney, type CategoryStat, type DynamicsPoint } from '@selfinance/shared';
import { CatIcon } from '../lib/icons';
import type { Lookups } from '../lib/lookups';
import { Money } from './Money';

const SHORT = MONTHS_NOM.map((m) => m.slice(0, 3).toLowerCase());
const rub = (v: number) => formatMoney(Math.round(v / 100) * 100);

/* ---------- Динамика: приход/расход по месяцам + линия капитала ---------- */

export function DynamicsChart({ points, current, only }: { points: DynamicsPoint[]; current?: string; only?: 'income' | 'expense' }) {
  if (!points.length) return null;
  const showIn = only !== 'expense';
  const showOut = only !== 'income';
  const max = Math.max(1, ...points.flatMap((p) => [showIn ? p.income : 0, showOut ? p.expense : 0])) * 1.08;
  const caps = points.map((p) => p.capital);
  const cMin = Math.min(...caps);
  const cMax = Math.max(...caps);
  const span = cMax - cMin || Math.abs(cMax) || 1;
  const n = points.length;
  // линия капитала занимает верхние 70% высоты, чтобы не сливаться со столбиками
  const line = points
    .map((p, i) => {
      const x = ((i + 0.5) / n) * 100;
      const y = 100 - (15 + ((p.capital - cMin) / span) * 70);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const last = points[points.length - 1];

  return (
    <div className="dyn">
      <div className="dyn-plot">
        <div className="dyn-bars" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {points.map((p) => (
            <div
              key={p.month}
              className={'dyn-col' + (p.month === current ? ' cur' : '') + (only ? ' single' : '')}
              title={
                only
                  ? `${monthLabel(p.month)}: ${only === 'income' ? 'приход' : 'расход'} ${rub(p[only])}`
                  : `${monthLabel(p.month)}: приход ${rub(p.income)}, расход ${rub(p.expense)}, капитал ${rub(p.capital)}`
              }
            >
              {showIn && <i className="b-in" style={{ height: `${(p.income / max) * 100}%` }} />}
              {showOut && <i className="b-out" style={{ height: `${(p.expense / max) * 100}%` }} />}
            </div>
          ))}
        </div>
        {!only && (
          <svg className="dyn-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline points={line} fill="none" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
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
        {showIn && <span><i style={{ background: 'var(--income)' }} />Приход{only && <>, в среднем {rub(avgOf(points, 'income'))} в месяц</>}</span>}
        {showOut && <span><i style={{ background: 'var(--expense)' }} />Расход{only && <>, в среднем {rub(avgOf(points, 'expense'))} в месяц</>}</span>}
        {!only && <span><i style={{ background: 'var(--accent)', height: 3, borderRadius: 2 }} />Капитал, сейчас {rub(last.capital)}</span>}
      </div>
    </div>
  );
}

/** Среднее за месяцы, начиная с первого месяца с движением. */
function avgOf(points: DynamicsPoint[], k: 'income' | 'expense') {
  const start = points.findIndex((p) => p[k] > 0);
  if (start < 0) return 0;
  const used = points.slice(start);
  return used.reduce((s, p) => s + p[k], 0) / used.length;
}

const monthLabel = (m: string) => `${MONTHS_NOM[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

/* ---------- Структура: бублик + таблица ---------- */

const FALLBACK = '#8A8F9C';

export function StructureView({ list, prev, l, type }: { list: CategoryStat[]; prev?: CategoryStat[]; l: Lookups; type: 'income' | 'expense' }) {
  const [open, setOpen] = useState<string | null>(null);
  const total = list.reduce((s, c) => s + c.amount, 0);
  if (!total) return <div className="empty"><p>{type === 'expense' ? 'Расходов' : 'Доходов'} за период нет</p></div>;

  const colorOf = (id: string | null) => l.category(id)?.color ?? FALLBACK;
  const prevMap = new Map((prev ?? []).map((c) => [c.categoryId, c.amount]));

  // бублик
  const R = 70;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = list.map((c) => {
    const len = (c.amount / total) * C;
    const el = (
      <circle
        key={c.categoryId ?? 'none'}
        r={R}
        cx={90}
        cy={90}
        fill="none"
        stroke={colorOf(c.categoryId)}
        strokeWidth={open === (c.categoryId ?? 'none') ? 26 : 20}
        strokeDasharray={`${Math.max(len - 1.5, 0.5)} ${C}`}
        strokeDashoffset={-acc}
        style={{ cursor: 'pointer', transition: 'stroke-width .15s' }}
        onClick={() => setOpen(open === (c.categoryId ?? 'none') ? null : c.categoryId ?? 'none')}
      >
        <title>{`${l.category(c.categoryId)?.name ?? 'Без категории'}: ${rub(c.amount)}`}</title>
      </circle>
    );
    acc += len;
    return el;
  });

  return (
    <div className="structure">
      <div className="donut">
        <svg viewBox="0 0 180 180" width="180" height="180" style={{ transform: 'rotate(-90deg)' }}>
          <circle r={R} cx={90} cy={90} fill="none" stroke="var(--surface-2)" strokeWidth={20} />
          {arcs}
        </svg>
        <div className="donut-center">
          <span>{type === 'expense' ? 'Расходы' : 'Доходы'}</span>
          <b><Money value={total} round /></b>
        </div>
      </div>

      <div className="st-table">
        {list.map((c) => {
          const key = c.categoryId ?? 'none';
          const cat = l.category(c.categoryId);
          const pct = (c.amount / total) * 100;
          const was = prevMap.get(c.categoryId);
          let delta = null;
          if (prev && was) {
            const d = Math.round(((c.amount - was) / was) * 100);
            if (Math.abs(d) >= 2) {
              const bad = type === 'expense' ? d > 0 : d < 0;
              delta = <small className={bad ? 'exp' : 'inc'}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}%</small>;
            }
          } else if (prev && !was) {
            delta = <small className="muted">новое</small>;
          }
          return (
            <div key={key}>
              <button type="button" className="st-row" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key} disabled={!c.subs.length}>
                <span className="cat-ic sm" style={{ ['--c' as string]: colorOf(c.categoryId) }}>
                  <CatIcon name={cat?.icon ?? 'dots'} size={16} />
                </span>
                <span className="st-name">{cat?.name ?? 'Без категории'}{c.subs.length > 0 && <span className="muted"> ({c.subs.length})</span>}</span>
                <span className="st-delta">{delta}</span>
                <span className="st-pct num">{pct < 1 ? '<1' : Math.round(pct)}%</span>
                <Money value={c.amount} round className="st-sum" />
              </button>
              {open === key && c.subs.length > 0 && (
                <div className="st-subs">
                  {c.subs.map((s) => (
                    <div key={s.categoryId} className="st-sub">
                      <span>{l.category(s.categoryId)?.name ?? '—'}</span>
                      <Money value={s.amount} round />
                    </div>
                  ))}
                  {c.amount - c.subs.reduce((x, s) => x + s.amount, 0) > 0 && (
                    <div className="st-sub muted">
                      <span>без подкатегории</span>
                      <Money value={c.amount - c.subs.reduce((x, s) => x + s.amount, 0)} round />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
