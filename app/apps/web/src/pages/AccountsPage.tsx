import { useState, type FormEvent } from 'react';
import { Archive, ArrowLeftRight, Plus, Snowflake, Sun, X } from 'lucide-react';
import { amountToInput, formatMoney, parseAmount, type Account, type AccountKind } from '@selfinance/shared';
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
              <div><span>Всего</span><b><Money value={capital.data.total} /></b></div>
            </div>
          </div>
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
  const [initial, setInitial] = useState('');
  const [actual, setActual] = useState(account ? amountToInput(account.balance) : '');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const pickKind = (k: AccountKind) => {
    setKind(k);
    if (!frozenTouched) setIsFrozen(k === 'deposit' || k === 'savings');
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    const init = initial.trim() ? parseAmount(initial) : 0;
    if (init === null) return setFields({ initialBalance: 'Не получается разобрать сумму' });
    try {
      await save.mutateAsync({
        id: account?.id,
        data: {
          name: name.trim(),
          kind,
          isFrozen,
          bankName: kind === 'cash' ? null : bankName.trim() || null,
          note: note.trim() || null,
          ...(account ? {} : { initialBalance: init }),
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
    const v = parseAmount(actual);
    if (v === null) return setFields({ actual: 'Не получается разобрать сумму' });
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
  const frozenTarget = active.find((a) => a.isFrozen);
  const freeTarget = active.find((a) => !a.isFrozen);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <h2>{account ? account.name : 'Новый счёт'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>

        {account && !account.isArchived && (
          <div className="sheet-section">
            <div className="cap-label">Остаток</div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 12 }}>
              <Money value={account.balance} className={account.isFrozen ? 'frz' : ''} />
            </div>
            <div className="chips">
              <button type="button" className="chip" onClick={() => { onClose(); openTx({ type: 'transfer', accountId: account.id }); }}>
                <ArrowLeftRight size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Перевести
              </button>
              {!account.isFrozen && frozenTarget && (
                <button type="button" className="chip" onClick={() => { onClose(); openTx({ type: 'transfer', accountId: account.id, toAccountId: frozenTarget.id }); }}>
                  <Snowflake size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Заморозить
                </button>
              )}
              {account.isFrozen && freeTarget && (
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
          <div className="segmented">
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

        <div className="choice" style={{ marginBottom: 16 }}>
          <label>
            <input type="checkbox" checked={isFrozen} onChange={(e) => { setIsFrozen(e.target.checked); setFrozenTouched(true); }} />
            <span>
              <b>Заморожено</b>
              <small>Деньги на этом счёте не входят в свободные — вклад или накопления</small>
            </span>
          </label>
        </div>

        {!account && (
          <label className={'field' + (fields.initialBalance ? ' has-error' : '')}>
            <span>Сколько сейчас на счёте</span>
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
              <input className="input num" style={{ flex: 1 }} inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} aria-label="Фактический остаток" />
              <button type="button" className="btn" onClick={doReconcile} disabled={reconcile.isPending}>Сверить</button>
            </div>
            {fields.actual ? <p className="field-error">{fields.actual}</p> : <p className="hint" style={{ margin: '6px 0 0' }}>Введите, сколько на счёте на самом деле — разница запишется корректировкой.</p>}
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
