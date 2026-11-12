import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Target, Trash2, X } from 'lucide-react';
import { MONTHS_GEN, MONTHS_NOM, MONTHS_PREP, amountToInput, parseAmount, type Limits } from '@selfinance/shared';
import { ApiError } from '../lib/api';
import { useBudget } from '../lib/budget';
import { CatIcon } from '../lib/icons';
import type { Lookups } from '../lib/lookups';
import { useSaveLimits } from '../lib/queries';
import { plural } from './HomeWidgets';
import { Money } from './Money';

const monthIdx = (m: string) => Number(m.slice(5)) - 1;

/** Общий лимит месяца: полоса, остаток, сколько можно тратить в день. */
export function LimitCard({ data, onEdit }: { data: Limits; onEdit?: () => void }) {
  const o = data.overall;
  const name = MONTHS_NOM[monthIdx(data.month)].toLowerCase();
  const rec = data.recurring.paid + data.recurring.upcoming;

  if (!o) {
    if (!onEdit || !data.isCurrent) return null;
    return (
      <section className="panel span-all limit-empty">
        <Target size={20} className="muted" />
        <span>Задайте лимит расходов на месяц, и сервис подскажет, сколько можно тратить в день.</span>
        <button className="btn btn-sm" onClick={onEdit}>Задать лимит</button>
      </section>
    );
  }

  const pct = Math.min(100, (o.spent / o.limit) * 100);
  const fpct = o.forecast !== null ? Math.min(100, (o.forecast / o.limit) * 100) : null;

  return (
    <section className={'panel span-all limit-card ' + o.state} aria-label="Лимит расходов">
      <div className="panel-head">
        <h2>Лимит на {name}: <Money value={o.limit} round /></h2>
        {onEdit && (
          <button className="icon-btn" aria-label="Настроить лимит" onClick={onEdit}><Pencil size={16} /></button>
        )}
      </div>

      <div className="limit-bar" role="img" aria-label={`Потрачено ${Math.round((o.spent / o.limit) * 100)}% лимита`}>
        <i style={{ width: `${pct}%` }} />
        {fpct !== null && fpct > pct && <b style={{ left: `${fpct}%` }} title="Прогноз на конец месяца" />}
      </div>

      <div className="limit-text">
        <span>
          Потрачено <Money value={o.spent} round />
          {o.remaining >= 0 ? <>, осталось <Money value={o.remaining} round /></> : null}
        </span>
        {o.remaining < 0 && <span className="exp">Лимит превышен на <Money value={-o.remaining} round /></span>}
      </div>

      {data.isCurrent && o.daysLeft !== null && o.remaining > 0 && (
        <p className="limit-perday">
          До конца месяца {o.daysLeft} {plural(o.daysLeft, 'день', 'дня', 'дней')}, можно тратить{' '}
          <b>≈ <Money value={o.perDay ?? 0} round /> в день</b>
        </p>
      )}
      {data.isCurrent && o.remaining === 0 && <p className="limit-perday">Лимит исчерпан</p>}
      {data.isCurrent && o.forecast !== null && o.forecast > o.limit && o.remaining > 0 && (
        <p className="limit-warn">
          При таком темпе выйдет ≈ <Money value={o.forecast} round />, это на <Money value={o.forecast - o.limit} round /> больше лимита
        </p>
      )}
      {!data.isCurrent && (
        <p className={'limit-perday' + (o.remaining < 0 ? ' exp' : ' inc')}>
          {o.remaining >= 0 ? `В ${MONTHS_PREP[monthIdx(data.month)]} уложились в лимит` : `В ${MONTHS_PREP[monthIdx(data.month)]} лимит превышен`}
        </p>
      )}

      {!data.includeRecurring && rec > 0 && (
        <p className="limit-rec">
          Обязательные платежи отдельно: <Money value={rec} round />
          {data.recurring.upcoming > 0 && data.recurring.paid > 0 && (
            <> (оплачено <Money value={data.recurring.paid} round />, впереди <Money value={data.recurring.upcoming} round />)</>
          )}
          {data.recurring.upcoming > 0 && data.recurring.paid === 0 && <> (ещё впереди)</>}
        </p>
      )}
    </section>
  );
}

/** Окно настройки лимитов. Изменения действуют с текущего месяца. */
export function LimitSheet({ data, l, month, onClose }: { data: Limits; l: Lookups; month: string; onClose: () => void }) {
  const save = useSaveLimits();
  const { canEdit } = useBudget();
  const initialOverall = data.settings.find((s) => s.categoryId === null)?.amount ?? 0;
  const initialCats = data.settings.filter((s) => s.categoryId !== null);

  const [overall, setOverall] = useState(initialOverall ? amountToInput(initialOverall) : '');
  const [includeRecurring, setIncludeRecurring] = useState(data.includeRecurring);
  const [cats, setCats] = useState(initialCats.map((c) => ({ categoryId: c.categoryId as string, value: amountToInput(c.amount) })));
  const [adding, setAdding] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tops = l.categories.filter((c) => c.type === 'expense' && !c.parentId && !c.isArchived);
  const free = tops.filter((c) => !cats.some((x) => x.categoryId === c.id));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const set: { categoryId: string | null; amount: number }[] = [];
    const ov = overall.trim() ? parseAmount(overall) : 0;
    if (ov === null || ov < 0) return setError('Проверьте сумму общего лимита');
    if (ov !== initialOverall) set.push({ categoryId: null, amount: ov });
    for (const c of cats) {
      const v = c.value.trim() ? parseAmount(c.value) : 0;
      if (v === null || v < 0) return setError(`Проверьте сумму для «${l.category(c.categoryId)?.name}»`);
      const was = initialCats.find((x) => x.categoryId === c.categoryId)?.amount ?? 0;
      if (v !== was) set.push({ categoryId: c.categoryId, amount: v });
    }
    for (const was of initialCats) {
      if (!cats.some((c) => c.categoryId === was.categoryId)) set.push({ categoryId: was.categoryId, amount: 0 });
    }
    try {
      await save.mutateAsync({
        includeRecurring: includeRecurring !== data.includeRecurring ? includeRecurring : undefined,
        set,
        fromMonth: month,
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <h2>Лимит расходов</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>

        <label className="field">
          <span>На месяц, всего</span>
          <input className="input num" inputMode="decimal" value={overall} onChange={(e) => setOverall(e.target.value)} placeholder="Например, 50 000" autoFocus />
        </label>
        <p className="hint">Оставьте пустым, чтобы убрать лимит.</p>

        <label className="switch-row">
          <span>
            <b>Учитывать обязательные платежи</b>
            <small>Операции, отмеченные как регулярный платёж (ЖКХ, связь, кредит). Обычно лимит ставят только на повседневные траты.</small>
          </span>
          <input type="checkbox" className="switch" checked={includeRecurring} onChange={(e) => setIncludeRecurring(e.target.checked)} />
        </label>

        <div className="sheet-section">
          <span className="label">Лимиты по категориям</span>
          {cats.map((c, i) => {
            const cat = l.category(c.categoryId);
            return (
              <div className="limit-cat-row" key={c.categoryId}>
                <span className="cat-ic sm" style={{ ['--c' as string]: cat?.color ?? 'var(--ink-2)' }}><CatIcon name={cat?.icon} size={16} /></span>
                <span className="cat-name">{cat?.name ?? '—'}</span>
                <input
                  className="input num"
                  inputMode="decimal"
                  value={c.value}
                  onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  aria-label={`Лимит для ${cat?.name}`}
                />
                <button type="button" className="icon-btn" aria-label="Убрать" onClick={() => setCats(cats.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
              </div>
            );
          })}
          {free.length > 0 && (
            <div className="filters-row" style={{ marginTop: 8 }}>
              <select className="select" style={{ flex: 1 }} value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Выберите категорию…</option>
                {free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                type="button"
                className="btn"
                disabled={!adding}
                onClick={() => {
                  setCats([...cats, { categoryId: adding, value: '' }]);
                  setAdding('');
                }}
              >
                <Plus size={16} /> Добавить
              </button>
            </div>
          )}
        </div>

        <p className="hint">
          Изменения действуют с {MONTHS_GEN[monthIdx(month)]} — у прошлых месяцев сохранятся их лимиты.
          Категорию можно исключить из общего лимита в разделе «Категории».
        </p>

        {error && <div className="form-error">{error}</div>}
        {canEdit && (
          <div className="sheet-actions">
            <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Сохраняю…' : 'Сохранить'}</button>
          </div>
        )}
      </form>
    </div>
  );
}
