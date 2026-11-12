import { useState, type FormEvent } from 'react';
import { BellRing, PiggyBank, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { addDays, amountToInput, formatMoney, parseAmount, todayISO, type Planned, type PlannedItem, type PlannedOverview } from '@selfinance/shared';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBudget } from '../lib/budget';
import { CatIcon } from '../lib/icons';
import type { Lookups } from '../lib/lookups';
import { usePlannedAction, useReservePlanned, useSavePlanned, useUpcoming } from '../lib/queries';
import { useTxSheet } from './Layout';
import { Money } from './Money';
import { dueLabel, shortDate, UpcomingRow } from './Upcoming';

/** «через 3 дня» / «без даты» / «просрочен на 2 дня». */
export function planWhen(p: PlannedItem) {
  if (!p.date || p.daysLeft === null) return 'без даты';
  return `${shortDate(p.date)}, ${dueLabel(p.daysLeft)}`;
}

/** Строка «хватает / не хватает». */
function PlanStatus({ p }: { p: PlannedItem }) {
  if (p.need === 0) return <span className="plan-status ok">Отложено полностью</span>;
  if (p.shortfall > 0) {
    return (
      <span className="plan-status bad">
        {p.date ? 'К этой дате не хватает ' : 'Не хватает '}
        <Money value={p.shortfall} round />
      </span>
    );
  }
  return <span className="plan-status ok">{p.date ? 'Денег хватает' : 'Можно купить сейчас'}</span>;
}

export function PlanRow({ p, l, onEdit, onReserve }: { p: PlannedItem; l: Lookups; onEdit: () => void; onReserve: () => void }) {
  const open = useTxSheet();
  const { canEdit } = useBudget();
  const cat = l.category(p.categoryId);
  const color = cat?.color ?? (cat?.parentId ? l.category(cat.parentId)?.color : null) ?? null;
  const overdue = p.daysLeft !== null && p.daysLeft < 0;
  const pct = p.amount ? Math.min(100, Math.round((p.reserved / p.amount) * 100)) : 0;

  return (
    <div className={'up-row plan-row' + (overdue ? ' overdue' : '')}>
      <button type="button" className="cat-ic plan-ic" style={color ? { ['--c' as string]: color } : undefined} onClick={canEdit ? onEdit : undefined} aria-label="Изменить план">
        <CatIcon name={cat?.icon ?? 'dots'} />
      </button>
      <button type="button" className="tx-main plan-main" onClick={canEdit ? onEdit : undefined}>
        <div className="tx-title">{p.name}</div>
        <div className={'tx-sub' + (overdue ? ' exp' : '')}>{planWhen(p)}</div>
      </button>
      <div className="tx-sum num">
        <Money value={-p.amount} />
      </div>
      {canEdit && (
        <div className="up-actions">
          <button className="btn btn-primary btn-sm" onClick={() => open({ planned: p })}>Купил</button>
          <button className="btn btn-ghost btn-sm" onClick={onReserve}>Отложить</button>
        </div>
      )}
      <div className="plan-extra">
        <PlanStatus p={p} />
        {p.reserved > 0 && (
          <div className="plan-res">
            <div className="plan-bar"><i style={{ width: pct + '%' }} /></div>
            <small><PiggyBank size={13} /> отложено <Money value={p.reserved} round /> из <Money value={p.amount} round /></small>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- форма плана ---------- */

const QUICK = [
  { days: 7, label: 'Через неделю' },
  { days: 14, label: 'Через 2 недели' },
  { days: 30, label: 'Через месяц' },
];

export function PlannedSheet({ plan, l, onClose, onRelease }: { plan: Planned | null; l: Lookups; onClose: () => void; onRelease?: () => void }) {
  const { user } = useAuth();
  const today = todayISO(user?.timezone);
  const save = useSavePlanned();
  const action = usePlannedAction();
  const [name, setName] = useState(plan?.name ?? '');
  const [amount, setAmount] = useState(plan ? amountToInput(plan.amount) : '');
  const [date, setDate] = useState<string>(plan ? plan.date ?? '' : addDays(today, 7));
  const [categoryId, setCategoryId] = useState(plan?.categoryId ?? '');
  const [accountId, setAccountId] = useState(plan?.accountId ?? '');
  const [comment, setComment] = useState(plan?.comment ?? '');
  const [excludeFromLimit, setExclude] = useState(plan?.excludeFromLimit ?? true);
  const [error, setError] = useState<string | null>(null);

  const cats = l.categories.filter((c) => c.type === 'expense' && (!c.isArchived || c.id === categoryId));
  const tops = cats.filter((c) => !c.parentId);
  const accounts = l.accounts.filter((a) => !a.isArchived && !a.isFrozen);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const a = parseAmount(amount);
    if (!name.trim()) return setError('Укажите, что купить');
    if (!a || a <= 0) return setError('Введите сумму');
    try {
      await save.mutateAsync({
        id: plan?.id,
        data: {
          name: name.trim(),
          amount: a,
          date: date || null,
          categoryId: categoryId || null,
          accountId: accountId || null,
          comment: comment.trim() || null,
          excludeFromLimit,
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    }
  }

  async function run(kind: 'cancel' | 'delete') {
    if (!plan) return;
    const back = plan.reserved > 0 ? ` Отложенные ${formatMoney(plan.reserved)} вернутся на счёт.` : '';
    const q = kind === 'cancel' ? `Отменить план «${plan.name}»?${back}` : `Удалить план «${plan.name}»?${back}`;
    if (!confirm(q)) return;
    try {
      await action.mutateAsync({ id: plan.id, action: kind });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось');
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <h2>{plan ? plan.name : 'Запланировать расход'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>

        <label className="field">
          <span>Что купить</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, зимняя резина" maxLength={100} autoFocus={!plan} />
        </label>

        <label className="field">
          <span>Сумма</span>
          <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0 ₽" />
        </label>

        <div className="sheet-section">
          <span className="label">Когда</span>
          <div className="filters-row">
            <div className="chips">
              <button type="button" className="chip" aria-pressed={!date} onClick={() => setDate('')}>Без даты</button>
              {QUICK.map((q) => {
                const v = addDays(today, q.days);
                return (
                  <button key={q.days} type="button" className="chip" aria-pressed={date === v} onClick={() => setDate(v)}>{q.label}</button>
                );
              })}
            </div>
            <input
              type="date"
              className="input"
              style={{ width: 'auto', minHeight: 36, padding: '6px 12px', borderRadius: 999 }}
              value={date}
              min={plan?.date && plan.date < today ? plan.date : today}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Дата"
            />
          </div>
          {!date && <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Без даты план не входит в прогноз — просто висит в списке «когда-нибудь».</p>}
        </div>

        <label className="field">
          <span>Категория</span>
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Без категории</option>
            {tops.map((t) => [
              <option key={t.id} value={t.id}>{t.name}</option>,
              ...cats.filter((c) => c.parentId === t.id).map((c) => <option key={c.id} value={c.id}>{' '}{c.name}</option>),
            ])}
          </select>
        </label>

        {l.multiAccount && (
          <label className="field">
            <span>С какого счёта платить</span>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Решу при покупке</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}

        <label className="field">
          <span>Комментарий</span>
          <input className="input" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" />
        </label>

        <label className="switch-row">
          <span><b>Не учитывать в лимите</b><small>Покупка запланирована заранее и не съест месячный лимит</small></span>
          <input type="checkbox" className="switch" checked={excludeFromLimit} onChange={(e) => setExclude(e.target.checked)} />
        </label>

        {plan && plan.reserved > 0 && (
          <div className="rule-box plan-reserved-box">
            <span><PiggyBank size={16} /> Отложено <b><Money value={plan.reserved} /></b></span>
            {onRelease && <button type="button" className="link" onClick={onRelease}>Вернуть на счёт</button>}
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="sheet-actions">
          {plan && (
            <>
              <button type="button" className="btn btn-danger" onClick={() => run('delete')} disabled={action.isPending} aria-label="Удалить"><Trash2 size={18} /></button>
              <button type="button" className="btn" onClick={() => run('cancel')} disabled={action.isPending}>Отменить план</button>
            </>
          )}
          <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Сохраняю…' : plan ? 'Сохранить' : 'Запланировать'}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- отложить / вернуть ---------- */

export function ReserveSheet({ plan, l, mode, onClose }: { plan: PlannedItem | Planned; l: Lookups; mode: 'reserve' | 'release'; onClose: () => void }) {
  const run = useReservePlanned();
  const reserveAcc = l.account(plan.reserveAccountId);
  const accounts = l.accounts.filter((a) => !a.isArchived && !a.isFrozen && a.id !== plan.reserveAccountId);
  const need = Math.max(0, plan.amount - plan.reserved);
  const def =
    mode === 'reserve'
      ? accounts.find((a) => a.id === plan.accountId) ?? accounts.find((a) => a.id === reserveAcc?.parentAccountId) ?? accounts[0]
      : accounts.find((a) => a.id === reserveAcc?.parentAccountId) ?? accounts[0];
  const [accountId, setAccountId] = useState(def?.id ?? '');
  const [amount, setAmount] = useState(amountToInput(mode === 'reserve' ? need || plan.amount : plan.reserved));
  const [error, setError] = useState<string | null>(null);
  const acc = l.account(accountId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const a = parseAmount(amount);
    if (!a || a <= 0) return setError('Введите сумму');
    if (mode === 'release' && a > plan.reserved) return setError(`Отложено только ${formatMoney(plan.reserved)}`);
    if (!accountId) return setError('Выберите счёт');
    try {
      await run.mutateAsync({ id: plan.id, mode, amount: a, accountId });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось');
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <h2>{mode === 'reserve' ? `Отложить: ${plan.name}` : `Вернуть: ${plan.name}`}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          {mode === 'reserve'
            ? 'Деньги переедут на замороженную копилку этого плана и перестанут считаться свободными, чтобы их случайно не потратить.'
            : 'Деньги вернутся из копилки плана на счёт и снова станут свободными.'}
        </p>
        {plan.reserved > 0 && (
          <p className="muted" style={{ fontSize: 14, margin: '0 0 14px' }}>
            Уже отложено <Money value={plan.reserved} /> из <Money value={plan.amount} />
            {mode === 'reserve' && need > 0 && <>, осталось <Money value={need} /></>}
          </p>
        )}
        <label className="field">
          <span>Сумма</span>
          <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>{mode === 'reserve' ? 'С какого счёта' : 'На какой счёт'}</span>
          <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {formatMoney(a.balance)}</option>)}
          </select>
        </label>
        {mode === 'reserve' && acc && (parseAmount(amount) ?? 0) > acc.balance && (
          <p className="limit-warn" style={{ margin: '-6px 0 14px' }}>На счёте меньше — остаток уйдёт в минус.</p>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="sheet-actions">
          <button className="btn btn-primary" disabled={run.isPending}>{mode === 'reserve' ? 'Отложить' : 'Вернуть'}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- расшифровка прогноза ---------- */

export function ForecastSheet({ data, onClose }: { data: PlannedOverview; onClose: () => void }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label="Прогноз">
        <div className="sheet-head">
          <h2>Как посчитано</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          Из свободных денег по порядку вычитаются регулярные платежи и запланированные покупки
          {data.horizon ? ` до ${shortDate(data.horizon)}` : ''}. Будущие доходы не учитываются. Отложенное под план уже не входит в свободные деньги, поэтому вычитается только остаток.
        </p>
        <div className="fc-row fc-start">
          <span>Свободно сейчас</span>
          <b><Money value={data.free} /></b>
        </div>
        {data.steps.map((s, i) => (
          <div key={s.kind + s.id + i} className={'fc-row' + (s.balanceAfter < 0 ? ' neg' : '')}>
            <span>
              <small className="muted">{shortDate(s.date)}</small> {s.name}
              {s.kind === 'recurring' && <small className="muted"> · регулярный</small>}
            </span>
            <span className="fc-sum">
              −{s.approx && '≈'}<Money value={s.amount} round />
              <small className="muted"> → <Money value={s.balanceAfter} round /></small>
            </span>
          </div>
        ))}
        {data.afterPlans !== null && (
          <div className={'fc-row fc-total' + (data.afterPlans < 0 ? ' neg' : '')}>
            <span>После планов</span>
            <b><Money value={data.afterPlans} /></b>
          </div>
        )}
      </div>
    </div>
  );
}

/** Строка под «Свободными деньгами»: сколько останется после планов. */
export function AfterPlans({ data, onOpen }: { data: PlannedOverview; onOpen: () => void }) {
  if (data.afterPlans === null) return null;
  const neg = data.afterPlans < 0;
  return (
    <button type="button" className={'after-plans' + (neg ? ' neg' : '')} onClick={onOpen} title="Как посчитано">
      После планов{data.horizon ? ` (до ${shortDate(data.horizon)})` : ''}: <b><Money value={data.afterPlans} round /></b>
    </button>
  );
}

/* ---------- управление листами плана (главная и экран «Планы») ---------- */

type SheetState =
  | { kind: 'edit'; plan: Planned | null }
  | { kind: 'reserve' | 'release'; plan: Planned };

export function usePlanSheets(l: Lookups) {
  const [state, setState] = useState<SheetState | null>(null);
  const close = () => setState(null);
  const sheets = !state ? null : state.kind === 'edit' ? (
    <PlannedSheet
      plan={state.plan}
      l={l}
      onClose={close}
      onRelease={state.plan ? () => setState({ kind: 'release', plan: state.plan! }) : undefined}
    />
  ) : (
    <ReserveSheet plan={state.plan} l={l} mode={state.kind} onClose={close} />
  );
  return {
    create: () => setState({ kind: 'edit', plan: null }),
    edit: (plan: Planned) => setState({ kind: 'edit', plan }),
    reserve: (plan: Planned) => setState({ kind: 'reserve', plan }),
    sheets,
  };
}

/** Панель «Впереди» на главной: ближайшие регулярные платежи и запланированные покупки. */
export function AheadPanel({ l, planned }: { l: Lookups; planned?: PlannedOverview }) {
  const { data: upcoming = [] } = useUpcoming();
  const { canEdit } = useBudget();
  const s = usePlanSheets(l);
  const items = planned?.items ?? [];
  const shown = items.slice(0, 5);
  if (!upcoming.length && !items.length) return s.sheets;

  return (
    <section className="panel span-all upcoming" aria-label="Впереди">
      <div className="panel-head">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BellRing size={18} className="muted" /> Впереди
        </h2>
        <span style={{ display: 'flex', gap: 16 }}>
          {canEdit && <button className="link" onClick={s.create}>+ Запланировать</button>}
          <Link className="link" to="/planned">Все планы</Link>
        </span>
      </div>
      {upcoming.map((u) => <UpcomingRow key={u.recurring.id} u={u} l={l} />)}
      {shown.map((p) => <PlanRow key={p.id} p={p} l={l} onEdit={() => s.edit(p)} onReserve={() => s.reserve(p)} />)}
      {items.length > shown.length && (
        <Link className="link plan-more" to="/planned">Ещё {items.length - shown.length} в списке планов</Link>
      )}
      {s.sheets}
    </section>
  );
}
