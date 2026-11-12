import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { X, Trash2 } from 'lucide-react';
import { addDays, amountToInput, formatMoney, parseAmount, todayISO, type Recurring, type Transaction, type TxType } from '@selfinance/shared';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBudget } from '../lib/budget';
import { CatIcon } from '../lib/icons';
import { useLookups } from '../lib/lookups';
import { useDeleteRecurring, useDeleteTx, useRecurring, useSaveRecurring, useSaveTx } from '../lib/queries';
import { PERIODS, periodText } from '../pages/RecurringPage';

export interface TxSheetOptions {
  tx?: Transaction;
  type?: 'expense' | 'income' | 'transfer';
  accountId?: string;
  toAccountId?: string;
  /** оплата регулярного платежа: форма заполняется из правила */
  recurring?: Recurring;
}

const LAST_ACC = 'sf.lastAccount.';

export function TxSheet({ opts, onClose }: { opts: TxSheetOptions; onClose: () => void }) {
  const { user } = useAuth();
  const { budgetId, canEdit } = useBudget();
  const l = useLookups();
  const save = useSaveTx();
  const remove = useDeleteTx();
  const saveRule = useSaveRecurring();
  const deleteRule = useDeleteRecurring();
  const { data: rules = [] } = useRecurring();
  const pay = opts.recurring;
  const today = todayISO(user?.timezone);
  const edit = opts.tx;

  const activeAccounts = l.accounts.filter((a) => !a.isArchived);
  const lastAcc = (() => {
    try {
      return localStorage.getItem(LAST_ACC + budgetId) ?? '';
    } catch {
      return '';
    }
  })();
  const defaultAcc = activeAccounts.find((a) => a.id === lastAcc)?.id ?? activeAccounts.find((a) => !a.isFrozen)?.id ?? activeAccounts[0]?.id ?? '';

  const [type, setType] = useState<TxType>(edit?.type ?? pay?.type ?? opts.type ?? 'expense');
  const [amountStr, setAmountStr] = useState(edit ? amountToInput(edit.amount) : pay ? amountToInput(pay.amount) : '');
  const [categoryId, setCategoryId] = useState<string | null>(edit?.categoryId ?? pay?.categoryId ?? null);
  const initialAcc = edit?.accountId ?? pay?.accountId ?? opts.accountId ?? defaultAcc;
  const [accountId, setAccountId] = useState(initialAcc);
  const [toAccountId, setToAccountId] = useState(
    edit?.toAccountId ?? opts.toAccountId ?? (opts.type === 'transfer' ? activeAccounts.find((a) => a.id !== initialAcc)?.id ?? '' : ''),
  );
  const [date, setDate] = useState(edit?.date ?? today);
  const linkedRule = rules.find((r) => r.id === (edit?.recurringId ?? pay?.id));
  const [comment, setComment] = useState(
    edit?.comment ?? (pay && pay.name !== l.category(pay.categoryId)?.name ? pay.name : ''),
  );
  const [isRecurring, setIsRecurring] = useState(!!(edit?.recurringId || pay));
  // настройки регулярного платежа — раскрываются под переключателем
  const [ruleName, setRuleName] = useState(linkedRule?.name ?? '');
  const [ruleInterval, setRuleInterval] = useState(linkedRule?.intervalMonths ?? 1);
  const [ruleRemind, setRuleRemind] = useState(linkedRule?.remindDays ?? 3);
  useEffect(() => {
    if (!linkedRule) return;
    setRuleName(linkedRule.name);
    setRuleInterval(linkedRule.intervalMonths ?? 1);
    setRuleRemind(linkedRule.remindDays);
  }, [linkedRule?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!edit) amountRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [edit, onClose]);

  const amount = parseAmount(amountStr);
  const isExpr = /[+\-*/]/.test(amountStr.replace(/^-/, ''));

  const catType = type === 'income' ? 'income' : 'expense';
  const tops = useMemo(
    () => l.categories.filter((c) => c.type === catType && !c.parentId && (!c.isArchived || c.id === categoryId)),
    [l.categories, catType, categoryId],
  );
  const selected = l.category(categoryId);
  const selectedTop = selected?.parentId ? l.category(selected.parentId) : selected;
  const subs = selectedTop ? l.categories.filter((c) => c.parentId === selectedTop.id && (!c.isArchived || c.id === categoryId)) : [];

  const switchType = (t: TxType) => {
    setType(t);
    if (selected && selected.type !== (t === 'income' ? 'income' : 'expense')) setCategoryId(null);
    if (t === 'transfer' && !toAccountId) {
      setToAccountId(activeAccounts.find((a) => a.id !== accountId)?.id ?? '');
    }
  };

  const pickTop = (id: string) => setCategoryId(selectedTop?.id === id && selected?.id === id ? null : id);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setFields({});
    if (amount === null || amount === 0 || (type !== 'adjustment' && amount < 0)) {
      setFields({ amount: 'Введите сумму' });
      amountRef.current?.focus();
      return;
    }
    // регулярные доходы в окне операции не заводим; уже привязанный доход оставляем как есть
    const regularAllowed = type === 'expense' || (type === 'income' && !!(edit?.recurringId ?? pay?.id));
    const ruleId = edit?.recurringId ?? pay?.id ?? null;
    const unlink = !!ruleId && (!isRecurring || !regularAllowed);
    if (unlink && !confirm(`Отключить регулярный платёж${linkedRule ? ` «${linkedRule.name}»` : ''}? Напоминаний больше не будет.`)) return;
    try {
      const saved = await save.mutateAsync({
        id: edit?.id,
        data: {
          type,
          amount,
          date,
          accountId: accountId || null,
          toAccountId: type === 'transfer' ? toAccountId || null : null,
          categoryId: regularAllowed ? categoryId : null,
          comment: comment.trim() || null,
          recurringId: unlink ? null : ruleId,
        },
      });
      if (unlink && ruleId) await deleteRule.mutateAsync(ruleId);
      else if (isRecurring && regularAllowed && !ruleId) {
        await saveRule.mutateAsync({
          data: { transactionId: saved.id, name: ruleName.trim() || undefined, intervalMonths: ruleInterval, remindDays: ruleRemind },
        });
      } else if (isRecurring && ruleId && linkedRule) {
        const patch: { name?: string; intervalMonths?: number; remindDays?: number } = {};
        if (ruleName.trim() && ruleName.trim() !== linkedRule.name) patch.name = ruleName.trim();
        if (ruleInterval !== (linkedRule.intervalMonths ?? 1)) patch.intervalMonths = ruleInterval;
        if (ruleRemind !== linkedRule.remindDays) patch.remindDays = ruleRemind;
        if (Object.keys(patch).length) await saveRule.mutateAsync({ id: ruleId, data: patch });
      }
      try {
        if (accountId && type !== 'transfer') localStorage.setItem(LAST_ACC + budgetId, accountId);
      } catch {
        /* ignore */
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else setError('Не удалось сохранить');
    }
  }

  async function onDelete() {
    if (!edit || !confirm('Удалить операцию?')) return;
    await remove.mutateAsync(edit.id);
    onClose();
  }

  const title = edit ? 'Операция' : pay ? `Оплата: ${pay.name}` : 'Новая операция';
  const showAccount = activeAccounts.length > 1 || type === 'transfer';

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit} role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        {type === 'adjustment' ? (
          <p className="hint" style={{ marginTop: 0 }}>Корректировка баланса счёта. Сумма со знаком: минус уменьшает остаток.</p>
        ) : (
          <div className={'segmented t-' + type}>
            {(['expense', 'income', 'transfer'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={type === t} onClick={() => switchType(t)}>
                {t === 'expense' ? 'Расход' : t === 'income' ? 'Доход' : 'Перевод'}
              </button>
            ))}
          </div>
        )}

        <input
          ref={amountRef}
          className="amount-input num"
          inputMode="decimal"
          placeholder="0 ₽"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          aria-label="Сумма"
          autoComplete="off"
          style={{ color: type === 'income' ? 'var(--income)' : type === 'expense' ? 'var(--ink)' : 'var(--ink)' } as CSSProperties}
        />
        <div className="amount-preview">
          {fields.amount ? (
            <span className="exp">{fields.amount}</span>
          ) : isExpr && amount !== null ? (
            <>= {formatMoney(amount)}</>
          ) : amountStr && amount === null ? (
            <span className="exp">Не получается посчитать</span>
          ) : null}
        </div>

        {(type === 'income' || type === 'expense') && (
          <div className="sheet-section">
            <span className="label">Категория{fields.categoryId && <span className="exp"> — {fields.categoryId}</span>}</span>
            <div className="cat-grid">
              {tops.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="cat-cell"
                  aria-pressed={selectedTop?.id === c.id}
                  onClick={() => pickTop(c.id)}
                >
                  <span className="cat-ic sm" style={{ ['--c' as string]: c.color ?? 'var(--ink-2)' }}>
                    <CatIcon name={c.icon} size={16} />
                  </span>
                  {c.name}
                </button>
              ))}
            </div>
            {subs.length > 0 && (
              <div className="chips subcats">
                {subs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="chip"
                    aria-pressed={categoryId === s.id}
                    onClick={() => setCategoryId(categoryId === s.id ? selectedTop!.id : s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showAccount && (
          <div className="sheet-section">
            {type === 'transfer' ? (
              <div className="row2">
                <label className={'field' + (fields.accountId ? ' has-error' : '')} style={{ marginBottom: 0 }}>
                  <span>Откуда</span>
                  <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isFrozen ? ' ❄' : ''}</option>)}
                  </select>
                </label>
                <label className={'field' + (fields.toAccountId ? ' has-error' : '')} style={{ marginBottom: 0 }}>
                  <span>Куда</span>
                  <select className="select" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                    <option value="">—</option>
                    {activeAccounts.filter((a) => a.id !== accountId).map((a) => (
                      <option key={a.id} value={a.id}>{a.name}{a.isFrozen ? ' ❄' : ''}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <label className="field" style={{ marginBottom: 0 }}>
                <span>Счёт</span>
                <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isFrozen ? ' ❄' : ''}</option>)}
                </select>
              </label>
            )}
            {type === 'transfer' && activeAccounts.length < 2 && (
              <p className="hint" style={{ margin: '8px 0 0' }}>Для перевода нужен второй счёт — добавьте его в разделе «Счета».</p>
            )}
            {(fields.toAccountId || fields.accountId) && <p className="field-error">{fields.toAccountId || fields.accountId}</p>}
          </div>
        )}

        <div className="sheet-section">
          <span className="label">Дата</span>
          <div className="filters-row">
            <div className="chips">
              {[0, -1, -2].map((d) => {
                const v = addDays(today, d);
                return (
                  <button key={d} type="button" className="chip" aria-pressed={date === v} onClick={() => setDate(v)}>
                    {d === 0 ? 'Сегодня' : d === -1 ? 'Вчера' : 'Позавчера'}
                  </button>
                );
              })}
            </div>
            <input
              type="date"
              className="input"
              style={{ width: 'auto', minHeight: 36, padding: '6px 12px', borderRadius: 999 }}
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="Дата"
            />
          </div>
        </div>

        {(type === 'expense' || (type === 'income' && !!linkedRule)) && (
          <>
            <label className="switch-row">
              <span>
                <b>Регулярный платёж</b>
                <small>
                  {linkedRule
                    ? `«${linkedRule.name}», ${periodText(linkedRule)}`
                    : 'Напомню за несколько дней до следующего платежа'}
                </small>
              </span>
              <input type="checkbox" className="switch" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            </label>
            {isRecurring && (
              <div className="rule-box">
                <label className="field">
                  <span>Название</span>
                  <input
                    className="input"
                    value={ruleName}
                    maxLength={100}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder={comment.trim() || selected?.name || 'Например, Интернет'}
                  />
                </label>
                <div className="row2">
                  <label className="field">
                    <span>Период</span>
                    <select className="select" value={ruleInterval} onChange={(e) => setRuleInterval(Number(e.target.value))}>
                      {PERIODS.map((p) => <option key={p.months} value={p.months}>{p.label}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Напоминать</span>
                    <select className="select" value={ruleRemind} onChange={(e) => setRuleRemind(Number(e.target.value))}>
                      <option value={0}>в день платежа</option>
                      {[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>за {n} {n === 1 ? 'день' : n < 5 ? 'дня' : 'дней'}</option>)}
                    </select>
                  </label>
                </div>
                <small className="muted">
                  Следующий платёж — {Number(date.slice(8))}-го числа, {PERIODS.find((p) => p.months === ruleInterval)?.label.toLowerCase()}, считая от даты этой операции.
                </small>
              </div>
            )}
          </>
        )}

        <label className="field">
          <span>Комментарий</span>
          <input className="input" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" />
        </label>

        {error && <div className="form-error">{error}</div>}

        {canEdit && (
          <div className="sheet-actions">
            {edit && (
              <button type="button" className="btn btn-danger" onClick={onDelete} disabled={remove.isPending} aria-label="Удалить">
                <Trash2 size={18} />
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? 'Сохраняю…' : edit ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
