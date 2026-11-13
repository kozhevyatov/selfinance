import { useState, type FormEvent } from 'react';
import { Archive, ArrowLeftRight, CreditCard, Plus, Snowflake, Sun, X } from 'lucide-react';
import { amountToInput, creditAvailableOf, debtOf, formatMoney, isCredit, isCreditKind, parseAmount, type Account, type AccountKind } from '@selfinance/shared';
import { AccountsList } from '../components/HomeWidgets';
import { TopBar, useTxSheet } from '../components/Layout';
import { Money } from '../components/Money';
import { ApiError } from '../lib/api';
import { useBudget } from '../lib/budget';
import { useAllAccounts, useCapital, useDeleteAccount, useReconcile, useSaveAccount } from '../lib/queries';

const KINDS: { v: AccountKind; label: string }[] = [
  { v: 'cash', label: 'Наличные' },
  { v: 'bank', label: 'Банк' },
  { v: 'deposit', label: 'Вклад' },
  { v: 'savings', label: 'Копилка' },
  { v: 'credit', label: 'Кредитка' },
  { v: 'loan', label: 'Кредит' },
];

export function AccountsPage() {
  const capital = useCapital();
  const all = useAllAccounts();
  const { canEdit } = useBudget();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const archived = (all.data ?? []).filter((a) => a.isArchived);

  return (
    <>
      <TopBar title="Счета" />

      {capital.data && (
        <div className="capital">
          <div className="cap-head">
            <div>
              <div className="cap-label">Свободные деньги</div>
              <div className="cap-free num" style={{ fontSize: 40 }}><Money value={capital.data.free} /></div>
            </div>
            <div className="cap-side">
              <div className="frz"><span>Заморожено</span><b><Money value={capital.data.frozen} /></b></div>
              {capital.data.debt > 0 && <div className="crd"><span>Долг</span><b><Money value={capital.data.debt} /></b></div>}
              <div><span>Всего</span><b><Money value={capital.data.total} /></b></div>
            </div>
          </div>
          {capital.data.creditAvailable > 0 && (
            <div className="cap-credit">+ <Money value={capital.data.creditAvailable} round /> доступно по кредиткам</div>
          )}
        </div>
      )}

      <section className="panel" style={{ maxWidth: 720 }}>
        <div className="panel-head">
          <h2>Мои счета</h2>
          {canEdit && (
            <button className="link" onClick={() => setEditing('new')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Plus size={16} /> Добавить счёт
            </button>
          )}
        </div>
        {capital.data ? (
          <AccountsList accounts={capital.data.accounts} onClick={canEdit ? (a) => setEditing(a) : undefined} />
        ) : (
          <div className="skeleton" style={{ height: 160 }} />
        )}
        <p className="hint" style={{ marginTop: 16, marginBottom: 0 }}>
          Замороженные счета (вклады, копилки) не входят в свободные деньги. Чтобы заморозить или разморозить деньги, откройте счёт и сделайте перевод.
          Кредитки и кредиты — не ваши деньги: их долг вычитается из «Всего». Покупка с кредитки — обычный расход, погашение — перевод на неё.
        </p>
      </section>

      {archived.length > 0 && (
        <section className="panel" style={{ maxWidth: 720, marginTop: 20 }}>
          <div className="panel-head"><h2>Архив</h2></div>
          <AccountsList accounts={archived} onClick={canEdit ? (a) => setEditing(a) : undefined} />
        </section>
      )}

      {editing && <AccountSheet account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AccountSheet({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const save = useSaveAccount();
  const remove = useDeleteAccount();
  const reconcile = useReconcile();
  const { data: accounts = [] } = useAllAccounts();
  const openTx = useTxSheet();

  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'bank');
  const [bankName, setBankName] = useState(account?.bankName ?? '');
  const [isFrozen, setIsFrozen] = useState(account?.isFrozen ?? false);
  const [frozenTouched, setFrozenTouched] = useState(!!account);
  const [note, setNote] = useState(account?.note ?? '');
  const [creditLimit, setCreditLimit] = useState(account?.creditLimit ? amountToInput(account.creditLimit) : '');
  const [initial, setInitial] = useState('');
  // у кредитов вводим долг положительным числом, храним отрицательным балансом
  const [actual, setActual] = useState(account ? amountToInput(isCredit(account) ? Math.max(0, -account.balance) : account.balance) : '');
  const credit = isCreditKind(kind);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const pickKind = (k: AccountKind) => {
    setKind(k);
    if (!frozenTouched || isCreditKind(k)) setIsFrozen(k === 'deposit' || k === 'savings');
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    const init = initial.trim() ? parseAmount(initial) : 0;
    if (init === null) return setFields({ initialBalance: 'Не получается разобрать сумму' });
    const limit = kind === 'credit' && creditLimit.trim() ? parseAmount(creditLimit) : null;
    if (kind === 'credit' && creditLimit.trim() && (limit === null || limit < 0)) return setFields({ creditLimit: 'Не получается разобрать сумму' });
    try {
      await save.mutateAsync({
        id: account?.id,
        data: {
          name: name.trim(),
          kind,
          isFrozen: credit ? false : isFrozen,
          creditLimit: kind === 'credit' ? limit : null,
          bankName: kind === 'cash' ? null : bankName.trim() || null,
          note: note.trim() || null,
          ...(account ? {} : { initialBalance: credit ? -Math.abs(init) : init }),
        },
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      }
    }
  }

  async function doReconcile() {
    if (!account) return;
    const parsed = parseAmount(actual);
    if (parsed === null) return setFields({ actual: 'Не получается разобрать сумму' });
    const v = isCredit(account) ? -Math.abs(parsed) : parsed;
    const r = await reconcile.mutateAsync({ id: account.id, actualBalance: v });
    setError(null);
    alert(r.adjustment === 0 ? 'Баланс совпадает' : `Добавлена корректировка ${formatMoney(r.adjustment, { sign: 'always' })}`);
    onClose();
  }

  async function doArchive() {
    if (!account) return;
    if (account.isArchived) {
      await save.mutateAsync({ id: account.id, data: { isArchived: false } });
      return onClose();
    }
    if (account.balance !== 0 && !confirm(`На счёте ${formatMoney(account.balance)}. Всё равно убрать в архив?`)) return;
    const r = await remove.mutateAsync(account.id);
    if (r.archived) alert('По счёту есть операции, поэтому он перенесён в архив');
    onClose();
  }

  const active = accounts.filter((a) => !a.isArchived && a.id !== account?.id);
  const frozenTarget = active.find((a) => a.isFrozen && !isCredit(a));
  const freeTarget = active.find((a) => !a.isFrozen && !isCredit(a));
  const accCredit = !!account && isCredit(account);
  const debt = account ? debtOf(account) : 0;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <h2>{account ? account.name : 'Новый счёт'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>

        {account && !account.isArchived && (
          <div className="sheet-section">
            {accCredit ? (
              <CreditSummary account={account} debt={debt} />
            ) : (
              <>
                <div className="cap-label">Остаток</div>
                <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 12 }}>
                  <Money value={account.balance} className={account.isFrozen ? 'frz' : ''} />
                </div>
              </>
            )}
            <div className="chips">
              <button type="button" className="chip" onClick={() => { onClose(); openTx({ type: 'transfer', accountId: account.id }); }}>
                <ArrowLeftRight size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Перевести
              </button>
              {accCredit && freeTarget && debt > 0 && (
                <button type="button" className="chip" onClick={() => { onClose(); openTx({ type: 'transfer', accountId: freeTarget.id, toAccountId: account.id }); }}>
                  <CreditCard size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Погасить
                </button>
              )}
              {!accCredit && !account.isFrozen && frozenTarget && (
                <button type="button" className="chip" onClick={() => { onClose(); openTx({ type: 'transfer', accountId: account.id, toAccountId: frozenTarget.id }); }}>
                  <Snowflake size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Заморозить
                </button>
              )}
              {!accCredit && account.isFrozen && freeTarget && (
                <button type="button" className="chip" onClick={() => { onClose(); openTx({ type: 'transfer', accountId: account.id, toAccountId: freeTarget.id }); }}>
                  <Sun size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Разморозить
                </button>
              )}
            </div>
          </div>
        )}

        <label className={'field' + (fields.name ? ' has-error' : '')}>
          <span>Название</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Т-Банк или Копилка «Отпуск»" required maxLength={100} />
          {fields.name && <span className="field-error">{fields.name}</span>}
        </label>

        <div className="sheet-section">
          <span className="label">Тип</span>
          <div className="segmented wrap">
            {KINDS.map((k) => (
              <button key={k.v} type="button" aria-pressed={kind === k.v} onClick={() => pickKind(k.v)}>{k.label}</button>
            ))}
          </div>
        </div>

        {kind !== 'cash' && (
          <label className="field">
            <span>Банк</span>
            <input className="input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Необязательно" maxLength={100} />
          </label>
        )}

        {credit ? (
          <p className="hint" style={{ marginTop: 0 }}>
            {kind === 'credit'
              ? 'Кредитка: доступный лимит показывается отдельно и не входит в свободные деньги. Покупки — обычные расходы, погашение — перевод на карту.'
              : 'Кредит или ипотека: долг вычитается из капитала. Платёж по кредиту — перевод на этот счёт, проценты — отдельный расход.'}
          </p>
        ) : (
          <div className="choice" style={{ marginBottom: 16 }}>
            <label>
              <input type="checkbox" checked={isFrozen} onChange={(e) => { setIsFrozen(e.target.checked); setFrozenTouched(true); }} />
              <span>
                <b>Заморожено</b>
                <small>Деньги на этом счёте не входят в свободные — вклад или накопления</small>
              </span>
            </label>
          </div>
        )}

        {kind === 'credit' && (
          <label className={'field' + (fields.creditLimit ? ' has-error' : '')}>
            <span>Кредитный лимит</span>
            <input className="input num" inputMode="decimal" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="Например, 100 000" />
            {fields.creditLimit && <span className="field-error">{fields.creditLimit}</span>}
          </label>
        )}

        {!account && (
          <label className={'field' + (fields.initialBalance ? ' has-error' : '')}>
            <span>{credit ? 'Сколько сейчас должны' : 'Сколько сейчас на счёте'}</span>
            <input className="input num" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0 ₽" />
            {fields.initialBalance && <span className="field-error">{fields.initialBalance}</span>}
          </label>
        )}

        <label className="field">
          <span>Заметка</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например, до 15 марта, 16%" maxLength={1000} />
        </label>

        {account && !account.isArchived && (
          <div className="sheet-section">
            <span className="label">Сверить баланс</span>
            <div className="filters-row">
              <input className="input num" style={{ flex: 1 }} inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} aria-label={accCredit ? 'Фактический долг' : 'Фактический остаток'} />
              <button type="button" className="btn" onClick={doReconcile} disabled={reconcile.isPending}>Сверить</button>
            </div>
            {fields.actual ? <p className="field-error">{fields.actual}</p> : <p className="hint" style={{ margin: '6px 0 0' }}>{accCredit ? 'Введите, сколько вы должны на самом деле — разница запишется корректировкой.' : 'Введите, сколько на счёте на самом деле — разница запишется корректировкой.'}</p>}
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="sheet-actions">
          {account && (
            <button type="button" className="btn btn-ghost" onClick={doArchive} title={account.isArchived ? 'Вернуть из архива' : 'В архив'}>
              <Archive size={18} /> {account.isArchived ? 'Вернуть' : 'В архив'}
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {account ? 'Сохранить' : 'Добавить счёт'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Шапка кредитного счёта: долг, доступный остаток и заполненность лимита. */
function CreditSummary({ account, debt }: { account: Account; debt: number }) {
  const limit = account.kind === 'credit' ? account.creditLimit : null;
  const used = limit ? Math.min(100, Math.round((debt / limit) * 100)) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="cap-label">{debt ? 'Долг' : account.balance > 0 ? 'Переплата' : 'Долга нет'}</div>
      <div className="crd" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em' }}>
        <Money value={debt || Math.max(0, account.balance)} />
      </div>
      {limit ? (
        <>
          <div className="credit-bar" role="img" aria-label={`Использовано ${used}% лимита`}><i style={{ width: `${used}%` }} /></div>
          <div className="hint" style={{ margin: '6px 0 0' }}>
            Доступно <b className="num">{formatMoney(creditAvailableOf(account))}</b> из {formatMoney(limit)}
          </div>
        </>
      ) : null}
    </div>
  );
}
