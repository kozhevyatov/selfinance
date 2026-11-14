import { useState, type FormEvent } from 'react';
import { Pause, Plus, Trash2, X } from 'lucide-react';
import { amountToInput, parseAmount, todayISO, type Recurring } from '@selfinance/shared';
import { TopBar } from '../components/Layout';
import { Money } from '../components/Money';
import { dueLabel, shortDate } from '../components/Upcoming';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBudget } from '../lib/budget';
import { CatIcon } from '../lib/icons';
import { useLookups, type Lookups } from '../lib/lookups';
import { useDeleteRecurring, useRecurring, useSaveRecurring } from '../lib/queries';

/** Период регулярного платежа, в месяцах. */
export const PERIODS: { months: number; label: string }[] = [
  { months: 1, label: 'Каждый месяц' },
  { months: 2, label: 'Раз в 2 месяца' },
  { months: 3, label: 'Раз в квартал' },
  { months: 6, label: 'Раз в полгода' },
  { months: 12, label: 'Раз в год' },
];

/** «каждый месяц 5-го», «раз в квартал, 5-го» … */
export function periodText(r: Pick<Recurring, 'intervalMonths' | 'dayOfMonth'>) {
  const m = r.intervalMonths || 1;
  if (m === 1) return `каждый месяц ${r.dayOfMonth}-го`;
  const p = PERIODS.find((x) => x.months === m)?.label.toLowerCase() ?? `раз в ${m} мес.`;
  return `${p}, ${r.dayOfMonth}-го`;
}

function daysLeft(today: string, due: string) {
  const a = Date.parse(today + 'T00:00:00Z');
  const b = Date.parse(due + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

export function RecurringPage() {
  const { user } = useAuth();
  const today = todayISO(user?.timezone);
  const { data: rules = [], isLoading } = useRecurring();
  const l = useLookups();
  const { canEdit } = useBudget();
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);

  const active = rules.filter((r) => !r.isPaused);
  const monthlyExpense = active.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const monthlyIncome = active.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <TopBar title="Регулярные платежи" />

      <section className="panel" style={{ maxWidth: 760 }}>
        <div className="panel-head">
          <h2>Каждый месяц</h2>
          {canEdit && (
            <button className="link" onClick={() => setEditing('new')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Plus size={16} /> Добавить
            </button>
          )}
        </div>

        {(monthlyExpense > 0 || monthlyIncome > 0) && (
          <div className="totals" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: 18 }}>
            <div className="total t-out"><span>Обязательные расходы</span><b><Money value={monthlyExpense} round /></b></div>
            <div className="total t-in"><span>Регулярные доходы</span><b><Money value={monthlyIncome} round /></b></div>
          </div>
        )}

        {isLoading || !l.ready ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : rules.length ? (
          rules.map((r) => <RuleRow key={r.id} r={r} l={l} today={today} onClick={canEdit ? () => setEditing(r) : undefined} />)
        ) : (
          <div className="empty">
            <p>Отметьте операцию переключателем «Регулярный платёж» — и за пару дней до следующего на главной появится напоминание.</p>
            {canEdit && <button className="btn" onClick={() => setEditing('new')}>Добавить вручную</button>}
          </div>
        )}
      </section>

      {editing && <RecurringSheet rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RuleRow({ r, l, today, onClick }: { r: Recurring; l: Lookups; today: string; onClick?: () => void }) {
  const cat = l.category(r.categoryId);
  const color = cat?.color ?? (cat?.parentId ? l.category(cat.parentId)?.color : null);
  const left = daysLeft(today, r.nextDue);
  return (
    <button type="button" className="tx" onClick={onClick} style={r.isPaused ? { opacity: 0.55 } : undefined}>
      <div className="cat-ic" style={color ? { ['--c' as string]: color } : undefined}>
        {r.isPaused ? <Pause size={18} /> : <CatIcon name={cat?.icon ?? 'dots'} />}
      </div>
      <div className="tx-main">
        <div className="tx-title">{r.name}</div>
        <div className={'tx-sub' + (left < 0 && !r.isPaused ? ' exp' : '')}>
          {r.isPaused ? 'на паузе' : `${shortDate(r.nextDue)}, ${dueLabel(left)}`}
          {(r.intervalMonths ?? 1) > 1 && `, ${PERIODS.find((x) => x.months === r.intervalMonths)?.label.toLowerCase() ?? `раз в ${r.intervalMonths} мес.`}`}
          {r.dayPinned && `, всегда ${r.dayOfMonth}-го`}
        </div>
      </div>
      <div className="tx-right">
        <div className={'tx-sum' + (r.type === 'income' ? ' in' : '')}>
          {r.amountVaries && '≈ '}
          <Money value={r.type === 'expense' ? -r.amount : r.amount} sign={r.type === 'income' ? 'always' : 'auto'} />
        </div>
        {r.lastPaidDate && <div className="tx-acc">последний {shortDate(r.lastPaidDate)}</div>}
      </div>
    </button>
  );
}

function RecurringSheet({ rule, onClose }: { rule: Recurring | null; onClose: () => void }) {
  const l = useLookups();
  const save = useSaveRecurring();
  const remove = useDeleteRecurring();
  const [name, setName] = useState(rule?.name ?? '');
  const [type, setType] = useState<'expense' | 'income'>(rule?.type ?? 'expense');
  const [amount, setAmount] = useState(rule ? amountToInput(rule.amount) : '');
  const [amountVaries, setAmountVaries] = useState(rule?.amountVaries ?? false);
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '');
  const [accountId, setAccountId] = useState(rule?.accountId ?? '');
  const [day, setDay] = useState(String(rule?.dayOfMonth ?? new Date().getDate()));
  const [dayPinned, setDayPinned] = useState(rule?.dayPinned ?? false);
  const [remindDays, setRemindDays] = useState(rule?.remindDays ?? 3);
  const [intervalMonths, setIntervalMonths] = useState(rule?.intervalMonths ?? 1);
  const [isPaused, setIsPaused] = useState(rule?.isPaused ?? false);
  const [error, setError] = useState<string | null>(null);

  const cats = l.categories.filter((c) => c.type === type && !c.isArchived);
  const tops = cats.filter((c) => !c.parentId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const a = parseAmount(amount);
    const d = Number(day);
    if (!a || a <= 0) return setError('Введите сумму');
    if (!(d >= 1 && d <= 31)) return setError('День месяца — от 1 до 31');
    try {
      await save.mutateAsync({
        id: rule?.id,
        data: {
          name: name.trim(),
          ...(rule ? {} : { type }),
          amount: a,
          ...(rule ? { amountVaries } : {}),
          categoryId: categoryId || null,
          accountId: accountId || null,
          dayOfMonth: d,
          dayPinned,
          intervalMonths,
          remindDays,
          ...(rule ? { isPaused } : {}),
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    }
  }

  async function onDelete() {
    if (!rule || !confirm(`Удалить регулярный платёж «${rule.name}»? Операции останутся.`)) return;
    await remove.mutateAsync(rule.id);
    onClose();
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <h2>{rule ? rule.name : 'Регулярный платёж'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>

        {!rule && (
          <div className={'segmented t-' + type} style={{ marginBottom: 16 }}>
            <button type="button" aria-pressed={type === 'expense'} onClick={() => { setType('expense'); setCategoryId(''); }}>Расход</button>
            <button type="button" aria-pressed={type === 'income'} onClick={() => { setType('income'); setCategoryId(''); }}>Доход</button>
          </div>
        )}

        <label className="field">
          <span>Название</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Интернет" required maxLength={100} />
        </label>

        <div className="row2">
          <label className="field">
            <span>Сумма</span>
            <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0 ₽" />
          </label>
          <label className="field">
            <span>День месяца</span>
            <input className="input num" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
        </div>

        <label className="field">
          <span>Категория</span>
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Без категории</option>
            {tops.map((t) => [
              <option key={t.id} value={t.id}>{t.name}</option>,
              ...cats.filter((c) => c.parentId === t.id).map((c) => <option key={c.id} value={c.id}>{'\u00A0\u00A0\u00A0↳ '}{c.name}</option>),
            ])}
          </select>
        </label>

        {l.multiAccount && (
          <label className="field">
            <span>Счёт</span>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Любой</option>
              {l.accounts.filter((a) => !a.isArchived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}

        <div className="row2">
          <label className="field">
            <span>Период</span>
            <select className="select" value={intervalMonths} onChange={(e) => setIntervalMonths(Number(e.target.value))}>
              {PERIODS.map((p) => <option key={p.months} value={p.months}>{p.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Напоминать</span>
            <select className="select" value={remindDays} onChange={(e) => setRemindDays(Number(e.target.value))}>
              <option value={0}>в день платежа</option>
              {[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>за {n} {n === 1 ? 'день' : n < 5 ? 'дня' : 'дней'}</option>)}
            </select>
          </label>
        </div>
        {intervalMonths > 1 && (
          <p className="muted" style={{ fontSize: 13, margin: '-6px 0 14px' }}>
            Следующая дата — последняя оплата плюс период. Пока оплат не было, напомню в ближайшее {Number(day) || 1}-е число.
          </p>
        )}

        <label className="switch-row">
          <span><b>Закрепить день</b><small>Иначе дата берётся из последней оплаты</small></span>
          <input type="checkbox" className="switch" checked={dayPinned} onChange={(e) => setDayPinned(e.target.checked)} />
        </label>
        {rule && (
          <>
            <label className="switch-row">
              <span><b>Сумма меняется</b><small>Показывать «≈» перед суммой</small></span>
              <input type="checkbox" className="switch" checked={amountVaries} onChange={(e) => setAmountVaries(e.target.checked)} />
            </label>
            <label className="switch-row">
              <span><b>Пауза</b><small>Не напоминать, пока не включите снова</small></span>
              <input type="checkbox" className="switch" checked={isPaused} onChange={(e) => setIsPaused(e.target.checked)} />
            </label>
          </>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="sheet-actions">
          {rule && (
            <button type="button" className="btn btn-danger" onClick={onDelete} aria-label="Удалить"><Trash2 size={18} /></button>
          )}
          <button className="btn btn-primary" disabled={save.isPending}>{rule ? 'Сохранить' : 'Добавить'}</button>
        </div>
      </form>
    </div>
  );
}
