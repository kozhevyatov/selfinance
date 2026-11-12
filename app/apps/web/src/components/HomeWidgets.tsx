import { Snowflake } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMoney, moneyParts, type Account, type Capital, type LimitStatus, type Summary } from '@selfinance/shared';
import { CatIcon } from '../lib/icons';
import type { Lookups } from '../lib/lookups';
import { Money } from './Money';

/* ---------- Свободные деньги + полоса капитала ---------- */

export function CapitalBlock({ capital }: { capital: Capital }) {
  const p = moneyParts(capital.free, { forceKop: false });
  const free = capital.accounts.filter((a) => !a.isFrozen && a.balance > 0).sort((a, b) => b.balance - a.balance);
  const frozenTotal = capital.accounts.filter((a) => a.isFrozen && a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const frozenCount = capital.accounts.filter((a) => a.isFrozen).length;
  const shown = free.slice(0, 3);
  const rest = free.slice(3).reduce((s, a) => s + a.balance, 0);
  const barTotal = free.reduce((s, a) => s + a.balance, 0) + frozenTotal;
  const showBar = barTotal > 0 && (free.length > 1 || frozenTotal > 0);
  const pct = (v: number) => Math.round((v / barTotal) * 100);

  return (
    <section className="capital" aria-label="Капитал">
      <div className="cap-head">
        <div>
          <div className="cap-label">Свободные деньги</div>
          <div className={'cap-free num' + (capital.free < 0 ? ' neg' : '')}>
            {p.sign}{p.rub}
            {p.kop && <span className="kop">{p.kop}</span>}
            <span className="cur">₽</span>
          </div>
        </div>
        {frozenCount > 0 && (
          <div className="cap-side">
            <div className="frz"><span>Заморожено</span><b><Money value={capital.frozen} /></b></div>
            <div><span>Всего</span><b><Money value={capital.total} /></b></div>
          </div>
        )}
      </div>

      {showBar && (
        <>
          <div className="bar" role="img" aria-label={`В обороте ${formatMoney(capital.free)}, заморожено ${formatMoney(capital.frozen)}`}>
            {shown.map((a, i) => (
              <div key={a.id} className={'seg seg-free' + (i ? ` s${i + 1}` : '')} style={{ flex: a.balance }} title={`${a.name}: ${formatMoney(a.balance)}`}>
                <span>{a.name}</span>
              </div>
            ))}
            {rest > 0 && <div className="seg seg-free s4" style={{ flex: rest }} title={`Остальные: ${formatMoney(rest)}`} />}
            {frozenTotal > 0 && (
              <div className="seg seg-ice" style={{ flex: frozenTotal }} title={`Заморожено: ${formatMoney(frozenTotal)}`}>
                <Snowflake size={16} style={{ flex: 'none' }} />
                <span>Вклады и копилки</span>
              </div>
            )}
          </div>
          {frozenTotal > 0 && (
            <div className="legend">
              <span><i style={{ background: 'var(--accent)' }} />В обороте {100 - pct(frozenTotal)}%</span>
              <span><i style={{ background: 'var(--frozen)' }} />Заморожено {pct(frozenTotal)}%</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- Итоги месяца ---------- */

export interface PrevLabel { prep: string; dat: string }

function delta(cur: number, prev: number, goodWhenLess: boolean, label: PrevLabel) {
  if (!prev && !cur) return null;
  if (!prev) return <small className="neutral">в {label.prep} не было</small>;
  const d = Math.round(((cur - prev) / prev) * 100);
  if (Math.abs(d) < 2) return <small className="neutral">как в {label.prep}</small>;
  const good = goodWhenLess ? d < 0 : d > 0;
  return <small className={good ? 'good' : 'bad'}>{d > 0 ? '+' : '−'}{Math.abs(d)}% к {label.dat}</small>;
}

export function MonthTotals({ s, prevLabel }: { s: Summary; prevLabel: PrevLabel }) {
  const cmp = s.prevToDate ?? s.prev;
  const netDiff = s.net - cmp.net;
  return (
    <div className="totals">
      <div className="total t-in">
        <span>Приход</span>
        <b><Money value={s.income} round /></b>
        {delta(s.income, cmp.income, false, prevLabel)}
      </div>
      <div className="total t-out">
        <span>Расход</span>
        <b><Money value={s.expense} round /></b>
        {delta(s.expense, cmp.expense, true, prevLabel)}
      </div>
      <div className="total">
        <span>Разница</span>
        <b><Money value={s.net} sign="always" round /></b>
        {cmp.net || s.net ? (
          <small className={netDiff >= 0 ? 'good' : 'bad'}><Money value={netDiff} sign="always" round /></small>
        ) : null}
      </div>
      <div className="total">
        <span>В среднем за день</span>
        <b><Money value={s.avgPerDay} round /></b>
        <small className="neutral"><Money value={s.avgPerWeek} round /> в неделю</small>
      </div>
    </div>
  );
}

/* ---------- Расходы по дням ---------- */

export function DaysChart({ s, today, kind = 'expense' }: { s: Summary; today: string; kind?: 'expense' | 'income' }) {
  const days = s.daily;
  const val = (d: Summary['daily'][number]) => d[kind];
  const avg = kind === 'expense' ? s.avgPerDay : s.daysElapsed ? Math.round(s.income / s.daysElapsed) : 0;
  const forecast = s.forecastExpense === null ? null : kind === 'expense' ? s.forecastExpense : avg * s.daysTotal;
  const max = Math.max(1, ...days.map(val)) * 1.05;
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  const cols = { gridTemplateColumns: `repeat(${days.length}, 1fr)` };
  const avgBottom = avg ? (avg / max) * 100 : null;

  return (
    <div className="days">
      <div className="days-chart" style={cols}>
        {avgBottom !== null && s.daysElapsed > 0 && (
          <div className="avg-line" style={{ bottom: `${avgBottom}%` }}>
            <span className="avg-tag num">в среднем {formatMoney(Math.round(avg / 100) * 100)}</span>
          </div>
        )}
        {days.map((d) => {
          const future = d.date > today;
          const cls = ['d', kind === 'income' ? 'd-in' : '', future ? 'future' : val(d) === 0 ? 'zero' : '', d.date === today ? 'today' : ''].join(' ');
          const dayNum = Number(d.date.slice(8));
          return (
            <div
              key={d.date}
              className={cls}
              style={future ? undefined : { height: `${Math.max(3, (val(d) / max) * 100)}%` }}
              title={future ? undefined : `${dayNum}: ${formatMoney(val(d))}`}
            />
          );
        })}
      </div>
      <div className="days-axis" style={cols}>
        {days.map((d) => {
          const n = Number(d.date.slice(8));
          const show = n === 1 || n % 5 === 0 || (d.date === today && !narrow);
          return <span key={d.date} style={d.date === today ? { color: 'var(--ink)', fontWeight: 600 } : undefined}>{show ? n : ''}</span>;
        })}
      </div>
      {forecast !== null && (
        <div className="days-note">
          <span>Прошло {s.daysElapsed} {plural(s.daysElapsed, 'день', 'дня', 'дней')} из {s.daysTotal}</span>
          {s.daysElapsed > 0 && (
            <span>Если так продолжится, за {s.daysTotal > 31 ? 'период' : 'месяц'} {kind === 'expense' ? 'уйдёт' : 'придёт'} <b>≈ <Money value={forecast} round /></b></span>
          )}
        </div>
      )}
    </div>
  );
}

/** Итоги в режиме «только расходы» / «только доходы» (можно с фильтром по категории). */
export function TypeTotals({ s, all, kind, prevLabel }: { s: Summary; all?: Summary; kind: 'expense' | 'income'; prevLabel: PrevLabel }) {
  const cmp = s.prevToDate ?? s.prev;
  const value = s[kind];
  const avg = s.daysElapsed ? Math.round(value / s.daysElapsed) : 0;
  const whole = all ? all[kind] : 0;
  const share = all && whole ? Math.round((value / whole) * 100) : null;
  return (
    <div className="totals">
      <div className={'total ' + (kind === 'expense' ? 't-out' : 't-in')}>
        <span>{kind === 'expense' ? 'Расход' : 'Приход'}</span>
        <b><Money value={value} round /></b>
        {delta(value, cmp[kind], kind === 'expense', prevLabel)}
      </div>
      <div className="total">
        <span>В {prevLabel.prep}</span>
        <b><Money value={s.prev[kind]} round /></b>
        <small className="neutral">за весь период</small>
      </div>
      <div className="total">
        <span>В среднем за день</span>
        <b><Money value={avg} round /></b>
        <small className="neutral"><Money value={avg * 7} round /> в неделю</small>
      </div>
      {share !== null ? (
        <div className="total">
          <span>Доля</span>
          <b>{share}%</b>
          <small className="neutral">от всех {kind === 'expense' ? 'расходов' : 'доходов'}</small>
        </div>
      ) : (
        <div className="total">
          <span>Прошло дней</span>
          <b>{s.daysElapsed}</b>
          <small className="neutral">из {s.daysTotal}</small>
        </div>
      )}
    </div>
  );
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/* ---------- Куда ушли деньги ---------- */

export function CategoryBars({ s, l, limits = [] }: { s: Summary; l: Lookups; limits?: LimitStatus[] }) {
  const list = s.expenseByCategory;
  if (!list.length) return <div className="empty"><p>Расходов в этом месяце пока нет</p></div>;
  const limitOf = new Map(limits.map((x) => [x.categoryId, x]));
  // категории с лимитом показываем всегда, остальные — самые крупные
  const withLimit = list.filter((c) => limitOf.has(c.categoryId));
  const others = list.filter((c) => !limitOf.has(c.categoryId));
  const top = [...withLimit, ...others.slice(0, Math.max(0, 4 - withLimit.length))];
  const rest = list.filter((c) => !top.includes(c));
  const restSum = rest.reduce((x, c) => x + c.amount, 0);
  const max = Math.max(...top.filter((c) => !limitOf.has(c.categoryId)).map((c) => c.amount), restSum, 1);
  return (
    <>
      {top.map((c) => {
        const cat = l.category(c.categoryId);
        const color = cat?.color ?? '#8A8F9C';
        const lim = limitOf.get(c.categoryId);
        const width = lim ? Math.min(100, (c.amount / lim.limit) * 100) : (c.amount / max) * 100;
        const barColor = lim?.state === 'over' ? 'var(--expense)' : lim?.state === 'warn' ? '#E0A100' : color;
        return (
          <div className="cat-row" key={c.categoryId ?? 'none'}>
            <div className="cat-ic sm" style={{ ['--c' as string]: color }}><CatIcon name={cat?.icon ?? 'dots'} size={16} /></div>
            <div className="cat-name">{cat?.name ?? 'Без категории'}</div>
            <div className="cat-sum">
              <Money value={c.amount} round />
              {lim && <span className="cat-limit"> из <Money value={lim.limit} round /></span>}
            </div>
            <div className="cat-track"><i style={{ width: `${width}%`, background: barColor }} /></div>
            {c.subs.length > 0 && (
              <div className="cat-subs">
                {c.subs.slice(0, 3).map((x) => `${l.category(x.categoryId)?.name ?? '—'} ${formatMoney(Math.round(x.amount / 100) * 100)}`).join(', ')}
              </div>
            )}
          </div>
        );
      })}
      {restSum > 0 && (
        <div className="cat-row">
          <div className="cat-ic sm"><CatIcon name="dots" size={16} /></div>
          <div className="cat-name">Остальное</div>
          <div className="cat-sum"><Money value={restSum} round /></div>
          <div className="cat-track"><i style={{ width: `${(restSum / max) * 100}%`, background: 'var(--muted)' }} /></div>
        </div>
      )}
    </>
  );
}

/* ---------- Счета ---------- */

export function bankBadge(a: Account) {
  const name = a.bankName || a.name;
  if (a.kind === 'cash') return '₽';
  return name.slice(0, 1).toUpperCase();
}

export function AccountsList({ accounts, onClick }: { accounts: Account[]; onClick?: (a: Account) => void }) {
  const free = accounts.filter((a) => !a.isFrozen);
  const frozen = accounts.filter((a) => a.isFrozen);
  const row = (a: Account) => (
    <div className={'acc' + (a.isFrozen ? ' frozen' : '')} key={a.id} onClick={onClick ? () => onClick(a) : undefined} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="acc-name">
        <span className="bank" style={a.color ? { background: a.color, color: '#fff' } : a.isFrozen ? { background: 'var(--frozen-soft)', color: 'var(--frozen)' } : undefined}>
          {bankBadge(a)}
        </span>
        <span>
          {a.name}
          {(a.bankName || a.note) && <small>{[a.bankName, a.note].filter(Boolean).join(', ')}</small>}
        </span>
      </div>
      <Money value={a.balance} className={'acc-sum' + (a.balance < 0 ? ' exp' : '')} />
    </div>
  );
  return (
    <>
      {free.length > 0 && (
        <div className="acc-group">
          {frozen.length > 0 && <h3>В обороте</h3>}
          {free.map(row)}
        </div>
      )}
      {frozen.length > 0 && (
        <div className="acc-group">
          <h3 className="frz"><Snowflake size={14} />Заморожено</h3>
          {frozen.map(row)}
        </div>
      )}
    </>
  );
}

export function PanelLink({ to, children }: { to: string; children: string }) {
  return <Link className="link" to={to}>{children}</Link>;
}
