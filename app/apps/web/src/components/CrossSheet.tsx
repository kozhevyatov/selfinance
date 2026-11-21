import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, Trash2, X } from 'lucide-react';
import { addDays, amountToInput, currencySymbol, formatMoney, isCredit, parseAmount, todayISO, type Account, type Transaction } from '@selfinance/shared';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBudget } from '../lib/budget';
import { useBudgetAccounts, useCrossTransfer, useDeleteTxEverywhere } from '../lib/queries';

const accLabel = (a: Account) => a.name + (a.isFrozen ? ' ❄' : '') + (a.kind === 'credit' ? ' · кредитка' : a.kind === 'loan' ? ' · кредит' : '');
const usable = (list: Account[] = []) => list.filter((a) => !a.isArchived);
const firstFree = (list: Account[]) => list.find((a) => !a.isFrozen && !isCredit(a))?.id ?? list[0]?.id ?? '';

/**
 * Перевод между бюджетами: «скинул 20 000 с личной карты в семейный бюджет».
 * Без tx — новый перевод, с tx — просмотр и правка (сумма, дата, комментарий).
 */
export function CrossSheet({ tx, onClose }: { tx?: Transaction; onClose: () => void }) {
  const { user } = useAuth();
  const { budgets, budget, canEdit } = useBudget();
  const today = todayISO(user?.timezone);
  const writable = budgets.filter((b) => b.role !== 'viewer');
  const { create, update } = useCrossTransfer();
  const remove = useDeleteTxEverywhere();

  const [fromBudget, setFromBudget] = useState(budget && budget.role !== 'viewer' ? budget.id : writable[0]?.id ?? '');
  const [toBudget, setToBudget] = useState(() => writable.find((b) => b.id !== fromBudget)?.id ?? '');
  const fromAccs = usable(useBudgetAccounts(tx ? '' : fromBudget).data);
  const toAccs = usable(useBudgetAccounts(tx ? '' : toBudget).data);
  const [fromAcc, setFromAcc] = useState('');
  const [toAcc, setToAcc] = useState('');
  const [amountStr, setAmountStr] = useState(tx ? amountToInput(Math.abs(tx.amount)) : '');
  const [date, setDate] = useState(tx?.date ?? today);
  const [comment, setComment] = useState(tx?.comment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  // счёт по умолчанию — первый свободный в выбранном бюджете
  useEffect(() => {
    if (!fromAccs.some((a) => a.id === fromAcc)) setFromAcc(firstFree(fromAccs));
  }, [fromAccs, fromAcc]);
  useEffect(() => {
    if (!toAccs.some((a) => a.id === toAcc)) setToAcc(firstFree(toAccs));
  }, [toAccs, toAcc]);
  useEffect(() => {
    if (toBudget === fromBudget) setToBudget(writable.find((b) => b.id !== fromBudget)?.id ?? '');
  }, [fromBudget, toBudget, writable]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const amount = parseAmount(amountStr);
  const symbol = currencySymbol(budget?.currency);
  const fromCur = budgets.find((b) => b.id === fromBudget)?.currency;
  const toCur = budgets.find((b) => b.id === toBudget)?.currency;
  const pending = create.isPending || update.isPending;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    if (amount === null || amount <= 0) {
      setFields({ amount: 'Введите сумму больше нуля' });
      return;
    }
    try {
      if (tx) {
        await update.mutateAsync({ groupId: tx.transferGroupId!, data: { amount, date, comment: comment || null } });
      } else {
        await create.mutateAsync({ fromBudgetId: fromBudget, fromAccountId: fromAcc, toBudgetId: toBudget, toAccountId: toAcc, amount, date, comment: comment || null });
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
    if (!tx || !confirm('Удалить перевод? Он исчезнет из обоих бюджетов.')) return;
    try {
      await remove.mutateAsync(tx.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить');
    }
  }

  const outgoing = tx ? tx.amount < 0 : true;
  const other = tx?.linkedBudget?.name ?? 'другой бюджет';
  const title = tx ? (outgoing ? `В бюджет «${other}»` : `Из бюджета «${other}»`) : 'Перевод между бюджетами';

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit} role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>

        {tx ? (
          <p className="hint" style={{ marginTop: 0 }}>
            {outgoing ? `Ушло из «${budget?.name}» в «${other}».` : `Пришло из «${other}» в «${budget?.name}».`} В доходы и расходы не входит.
            Изменения применяются сразу в обоих бюджетах.
          </p>
        ) : (
          <p className="hint" style={{ marginTop: 0 }}>Деньги уйдут со счёта одного бюджета и придут на счёт другого. В доходы и расходы не входит.</p>
        )}

        <label className={'amount-box' + (fields.amount ? ' has-error' : '')} data-type="transfer">
          <input
            className="amount-input num"
            inputMode="decimal"
            placeholder={'0 ' + symbol}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            aria-label="Сумма"
            autoComplete="off"
            autoFocus={!tx}
            readOnly={!canEdit}
          />
        </label>
        <div className="amount-preview">
          {fields.amount ? <span className="exp">{fields.amount}</span> : amount !== null && /[+\-*/]/.test(amountStr) ? <>= {formatMoney(amount)}</> : null}
        </div>

        {!tx && (
          <div className="sheet-section">
            <div className="row2">
              <label className="field" style={{ marginBottom: 0 }}>
                <span>Из бюджета</span>
                <select className="select" value={fromBudget} onChange={(e) => setFromBudget(e.target.value)}>
                  {writable.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className={'field' + (fields.fromAccountId ? ' has-error' : '')} style={{ marginBottom: 0 }}>
                <span>Со счёта</span>
                <select className="select" value={fromAcc} onChange={(e) => setFromAcc(e.target.value)}>
                  {fromAccs.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}
                </select>
              </label>
            </div>
            <div className="muted" style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}><ArrowDown size={18} /></div>
            <div className="row2">
              <label className={'field' + (fields.toBudgetId ? ' has-error' : '')} style={{ marginBottom: 0 }}>
                <span>В бюджет</span>
                <select className="select" value={toBudget} onChange={(e) => setToBudget(e.target.value)}>
                  {writable.filter((b) => b.id !== fromBudget).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className={'field' + (fields.toAccountId ? ' has-error' : '')} style={{ marginBottom: 0 }}>
                <span>На счёт</span>
                <select className="select" value={toAcc} onChange={(e) => setToAcc(e.target.value)}>
                  {toAccs.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}
                </select>
              </label>
            </div>
            {writable.length < 2 && <p className="hint" style={{ margin: '8px 0 0' }}>Нужен второй бюджет, в который вы можете вносить операции.</p>}
            {fromCur && toCur && fromCur !== toCur && (
              <p className="hint" style={{ margin: '8px 0 0' }}>У бюджетов разные валюты — сумма запишется в обоих без пересчёта по курсу.</p>
            )}
            {(fields.fromAccountId || fields.toAccountId || fields.toBudgetId) && (
              <p className="field-error">{fields.fromAccountId || fields.toAccountId || fields.toBudgetId}</p>
            )}
          </div>
        )}

        <div className="sheet-section">
          <span className="label">Дата</span>
          <div className="filters-row">
            {canEdit && (
              <div className="chips">
                {[0, -1].map((d) => {
                  const v = addDays(today, d);
                  return (
                    <button key={d} type="button" className="chip" aria-pressed={date === v} onClick={() => setDate(v)}>
                      {d === 0 ? 'Сегодня' : 'Вчера'}
                    </button>
                  );
                })}
              </div>
            )}
            <input
              type="date"
              className="input"
              style={{ width: 'auto', minHeight: 36, padding: '6px 12px', borderRadius: 999 }}
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="Дата"
              readOnly={!canEdit}
            />
          </div>
        </div>

        <label className="field">
          <span>Комментарий</span>
          <input className="input" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" readOnly={!canEdit} />
        </label>

        {error && <div className="form-error">{error}</div>}

        {canEdit && (
          <div className="sheet-actions">
            {tx && (
              <button type="button" className="btn btn-danger" onClick={onDelete} disabled={remove.isPending} aria-label="Удалить">
                <Trash2 size={18} />
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={pending || (!tx && (!fromAcc || !toAcc))}>
              {pending ? 'Сохраняю…' : tx ? 'Сохранить' : 'Перевести'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
