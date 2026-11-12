import { useState, type FormEvent } from 'react';
import { BellRing, Ban, Pencil, ShoppingCart, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { addDays, amountToInput, parseAmount, todayISO, type Planned, type PlannedItem, type PlannedOverview } from '@selfinance/shared';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBudget } from '../lib/budget';
import { CatIcon } from '../lib/icons';
import type { Lookups } from '../lib/lookups';
import { usePlannedAction, useSavePlanned, useUpcoming } from '../lib/queries';
import { useTxSheet } from './Layout';
import { Money } from './Money';
import { dueLabel, shortDate, UpcomingRow } from './Upcoming';

/** «20 ноября, через 8 дней» / «без даты». */
export function planWhen(p: PlannedItem) {
  if (!p.date || p.daysLeft === null) return 'без даты';
  return `${shortDate(p.date)}, ${dueLabel(p.daysLeft)}`;
}

/** «Денег хватает» / «К этой дате не хватает X». */
function PlanStatus({ p }: { p: PlannedItem }) {
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

function catColor(l: Lookups, categoryId: string | null) {
  const cat = l.category(categoryId);
  return { cat, color: cat?.color ?? (cat?.parentId ? l.category(cat.parentId)?.color : null) ?? null };
}

/** Строка плана — только информация; по нажатию открывается карточка с действиями. */
export function PlanRow({ p, l, onOpen }: { p: PlannedItem; l: Lookups; onOpen: () => void }) {
  const { cat, color } = catColor(l, p.categoryId);
  const overdue = p.daysLeft !== null && p.daysLeft < 0;
  return (
    <button type="button" className={'up-row plan-row' + (overdue ? ' overdue' : '')} onClick={onOpen}>
      <div className="cat-ic" style={color ? { ['--c' as string]: color } : undefined}>
        <CatIcon name={cat?.icon ?? 'dots'} />
      </div>
      <div className="tx-main">
        <div className="tx-title">{p.name}</div>
        <div className={'tx-sub' + (overdue ? ' exp' : '')}>{planWhen(p)}</div>
      </div>
      <div className="tx-sum num"><Money value={-p.amount} /></div>
      <div className="plan-extra"><PlanStatus p={p} /></div>
    </button>
  );
}

/* ---------- карточка плана с действиями ---------- */

function PlanCard({ p, l, onClose, onEdit }: { p: PlannedItem; l: Lookups; onClose: () => void; onEdit: () => void }) {
  const open = useTxSheet();
  const { canEdit } = useBudget();
  const action = usePlannedAction();
  const { cat } = catColor(l, p.categoryId);
  const acc = l.account(p.accountId);
  const overdue = p.daysLeft !== null && p.daysLeft < 0;

  async function cancel() {
    if (!confirm(`Отменить план «${p.name}»? Его можно будет вернуть из списка отменённых.`)) return;
    await action.mutateAsync({ id: p.id, action: 'cancel' });
    onClose();
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={p.name}>
        <div className="sheet-head">
          <h2>{p.name}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>

        <div className="plan-card-sum num"><Money value={p.amount} /></div>
        <p className={'plan-card-when' + (overdue ? ' exp' : '')}>{p.date ? planWhen(p) : 'Без даты — когда-нибудь'}</p>
        <p className="plan-card-status"><PlanStatus p={p} /></p>
        {(cat || acc || p.comment) && (
          <p className="muted plan-card-meta">
            {[cat?.name, acc ? `со счёта «${acc.name}»` : null, p.comment].filter(Boolean).join(' · ')}
          </p>
        )}

        {canEdit && (
          <div className="plan-actions">
            <button
              type="button"
              className="more-item"
              onClick={() => {
                onClose();
                open({ planned: p });
              }}
            >
              <span className="more-ico plan-ico-buy"><ShoppingCart size={19} strokeWidth={1.8} /></span>
              <span className="more-text">
                <b>Внести покупку</b>
                <small className="muted">Уже купил — записать расход и закрыть план</small>
              </span>
            </button>
            <button type="button" className="more-item" onClick={onEdit}>
              <span className="more-ico"><Pencil size={18} strokeWidth={1.8} /></span>
              <span className="more-text">
                <b>Изменить</b>
                <small className="muted">Сумма, дата, название, категория</small>
              </span>
            </button>
            <button type="button" className="more-item" onClick={cancel} disabled={action.isPending}>
              <span className="more-ico"><Ban size={18} strokeWidth={1.8} /></span>
              <span className="more-text">
                <b>Отменить план</b>
                <small className="muted">Передумал покупать — убрать из списка</small>
              </span>
            </button>
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

export function PlannedSheet({ plan, l, onClose }: { plan: Planned | null; l: Lookups; onClose: () => void }) {
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

  async function remove() {
    if (!plan || !confirm(`Удалить план «${plan.name}»?`)) return;
    try {
      await action.mutateAsync({ id: plan.id, action: 'delete' });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось');
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <h2>{plan ? 'Изменить план' : 'Запланировать расход'}</h2>
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

        {error && <div className="form-error">{error}</div>}
        <div className="sheet-actions">
          {plan && (
            <button type="button" className="btn btn-danger" onClick={remove} disabled={action.isPending} aria-label="Удалить"><Trash2 size={18} /></button>
          )}
          <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Сохраняю…' : plan ? 'Сохранить' : 'Запланировать'}</button>
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
          {data.horizon ? ` до ${shortDate(data.horizon)}` : ''}. Будущие доходы не учитываются.
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

/* ---------- листы плана (главная и экран «Планы») ---------- */

type SheetState = { kind: 'card'; plan: PlannedItem } | { kind: 'edit'; plan: Planned | null };

export function usePlanSheets(l: Lookups) {
  const [state, setState] = useState<SheetState | null>(null);
  const close = () => setState(null);
  const sheets = !state ? null : state.kind === 'card' ? (
    <PlanCard p={state.plan} l={l} onClose={close} onEdit={() => setState({ kind: 'edit', plan: state.plan })} />
  ) : (
    <PlannedSheet plan={state.plan} l={l} onClose={close} />
  );
  return {
    create: () => setState({ kind: 'edit', plan: null }),
    open: (plan: PlannedItem) => setState({ kind: 'card', plan }),
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
      {shown.map((p) => <PlanRow key={p.id} p={p} l={l} onOpen={() => s.open(p)} />)}
      {items.length > shown.length && (
        <Link className="link plan-more" to="/planned">Ещё {items.length - shown.length} в списке планов</Link>
      )}
      {s.sheets}
    </section>
  );
}
