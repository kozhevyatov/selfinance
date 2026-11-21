import { useState, type FormEvent } from 'react';
import { ArrowLeftRight, Check, LogOut, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { DEFAULT_CURRENCY, type Budget, type BudgetRole } from '@selfinance/shared';
import { CurrencySelect } from '../components/CurrencySelect';
import { TopBar, useTxSheet } from '../components/Layout';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBudget } from '../lib/budget';
import { useAnswerInvite, useBudgetActions, useBudgetInvites, useCandidates, useIncomingInvites, useMembers } from '../lib/queries';
import { Field } from './AuthPages';

export const ROLE_LABEL: Record<BudgetRole, string> = { owner: 'владелец', member: 'участник', viewer: 'наблюдатель' };
const ROLE_HINT: Record<BudgetRole, string> = {
  owner: 'всё, включая участников и удаление бюджета',
  member: 'вносит и правит операции, счета, категории',
  viewer: 'только просмотр',
};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

/** Бюджеты: личный и общие (семейные), участники, приглашения, перевод между бюджетами. */
export function BudgetsPage() {
  const { user } = useAuth();
  const { budgets, budget: current, setBudgetId } = useBudget();
  const openSheet = useTxSheet();
  const [selId, setSelId] = useState(current?.id ?? '');
  const [creating, setCreating] = useState(false);
  const sel = budgets.find((b) => b.id === selId) ?? current;
  const writable = budgets.filter((b) => b.role !== 'viewer');

  return (
    <>
      <TopBar title="Бюджеты" />
      <div className="settings">
        <IncomingInvites />
        <section className="panel">
          <div className="panel-head">
            <h2>Мои бюджеты</h2>
            {user?.canShare && (
              <button className="link" onClick={() => setCreating(true)}><Plus size={14} style={{ verticalAlign: -2 }} /> Общий бюджет</button>
            )}
          </div>
          {budgets.map((b) => (
            <button key={b.id} type="button" className="budget-card" aria-current={sel?.id === b.id} onClick={() => setSelId(b.id)}>
              <span className="more-avatar" style={{ width: 38, height: 38, fontSize: 16 }}>{b.name.slice(0, 1).toUpperCase()}</span>
              <span className="more-text">
                <b>{b.name}</b>
                <small className="muted">{b.type === 'personal' ? 'Личный — видите только вы' : `Общий · вы ${ROLE_LABEL[b.role]}`}{b.id === current?.id ? ' · открыт сейчас' : ''}</small>
              </span>
              {b.id !== current?.id && (
                <span
                  role="button"
                  tabIndex={0}
                  className="chip"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBudgetId(b.id);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && setBudgetId(b.id)}
                >
                  Открыть
                </span>
              )}
            </button>
          ))}
          {!user?.canShare && budgets.length < 2 && (
            <p className="hint" style={{ marginBottom: 0 }}>Создавать общие бюджеты может пользователь, которому это разрешил администратор.</p>
          )}
          {writable.length > 1 && (
            <button className="btn" style={{ marginTop: 14 }} onClick={() => openSheet({ cross: true })}>
              <ArrowLeftRight size={16} /> Перевод между бюджетами
            </button>
          )}
        </section>

        {sel && sel.type === 'shared' && <SharedBudget key={sel.id} b={sel} onGone={() => setSelId(budgets[0]?.id ?? '')} />}
      </div>
      {creating && (
        <CreateBudgetSheet
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setSelId(id);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

function SharedBudget({ b, onGone }: { b: Budget; onGone: () => void }) {
  const { user } = useAuth();
  const isOwner = b.role === 'owner';
  const members = useMembers(b.id);
  const act = useBudgetActions();
  const [name, setName] = useState(b.name);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = members.data ?? [];
  const owners = list.filter((m) => m.role === 'owner').length;

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Не получилось');
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      fail(e);
    }
  };

  const leave = () =>
    confirm(`Выйти из бюджета «${b.name}»? Вернуться можно будет только по новому приглашению.`) &&
    run(async () => {
      await act.removeMember.mutateAsync({ budgetId: b.id, userId: user!.id });
      onGone();
    });

  const removeBudget = () =>
    confirm(`Удалить бюджет «${b.name}» для всех участников? Его операции станут недоступны.`) &&
    run(async () => {
      await act.remove.mutateAsync(b.id);
      onGone();
    });

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          {renaming ? (
            <form
              style={{ display: 'flex', gap: 8, flex: 1 }}
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await act.rename.mutateAsync({ id: b.id, name });
                  setRenaming(false);
                });
              }}
            >
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus />
              <button className="icon-btn" aria-label="Сохранить"><Check size={16} /></button>
              <button type="button" className="icon-btn" aria-label="Отмена" onClick={() => { setName(b.name); setRenaming(false); }}><X size={16} /></button>
            </form>
          ) : (
            <>
              <h2>{b.name}: участники</h2>
              {isOwner && <button className="icon-btn" aria-label="Переименовать" onClick={() => setRenaming(true)}><Pencil size={15} /></button>}
            </>
          )}
        </div>

        {list.map((m) => (
          <div className="member-row" key={m.userId}>
            <span className="member-name">
              <b>{m.name}</b>{m.userId === user?.id && <span className="muted"> (вы)</span>}
              <br />
              <small className="muted">
                с {fmtDate(m.joinedAt)}
                {!m.active && ' · администратор отключил ему общие бюджеты, сейчас бюджет ему не виден'}
              </small>
            </span>
            {isOwner && !(m.role === 'owner' && owners <= 1) ? (
              <select
                className="select"
                value={m.role}
                aria-label="Роль"
                onChange={(e) => run(() => act.setRole.mutateAsync({ budgetId: b.id, userId: m.userId, role: e.target.value as BudgetRole }))}
              >
                {(['owner', 'member', 'viewer'] as const).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            ) : (
              <span className="badge" style={{ marginLeft: 0 }}>{ROLE_LABEL[m.role]}</span>
            )}
            {isOwner && m.userId !== user?.id && !(m.role === 'owner' && owners <= 1) && (
              <button
                className="icon-btn"
                aria-label="Убрать из бюджета"
                onClick={() => confirm(`Убрать «${m.name}» из бюджета?`) && run(() => act.removeMember.mutateAsync({ budgetId: b.id, userId: m.userId }))}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
        <p className="hint" style={{ marginBottom: 0 }}>
          Владелец — {ROLE_HINT.owner}; участник — {ROLE_HINT.member}; наблюдатель — {ROLE_HINT.viewer}.
        </p>
        {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      </section>

      {isOwner && <InviteSection b={b} run={run} />}

      <section className="panel">
        <div className="danger-zone">
          {(!isOwner || owners > 1) && <button className="btn" onClick={leave}><LogOut size={16} /> Выйти из бюджета</button>}
          {isOwner && <button className="btn btn-danger" onClick={removeBudget}><Trash2 size={16} /> Удалить бюджет</button>}
        </div>
      </section>
    </>
  );
}

function CreateBudgetSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { budget } = useBudget();
  const { create } = useBudgetActions();
  const [name, setName] = useState('Семья');
  const [currency, setCurrency] = useState(budget?.currency ?? DEFAULT_CURRENCY);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const b = await create.mutateAsync({ name, currency });
      onCreated(b.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать');
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <h2>Общий бюджет</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        <Field label="Название"><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus /></Field>
        <Field label="Валюта"><CurrencySelect value={currency} onChange={setCurrency} /></Field>
        <p className="hint">Появится кошелёк и стартовые категории. Потом пригласите участников по ссылке.</p>
        {error && <div className="form-error">{error}</div>}
        <div className="sheet-actions"><button className="btn btn-primary" disabled={create.isPending}>Создать</button></div>
      </form>
    </div>
  );
}

/** Пригласить: выбрать человека из списка. В списке только пользователи с разрешением «Общие бюджеты». */
function InviteSection({ b, run }: { b: Budget; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const act = useBudgetActions();
  const invites = useBudgetInvites(b.id);
  const candidates = useCandidates(b.id);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'member' | 'viewer'>('member');
  const list = candidates.data ?? [];
  const picked = list.some((c) => c.userId === userId) ? userId : '';

  return (
    <section className="panel">
      <div className="panel-head"><h2>Пригласить</h2></div>
      {list.length ? (
        <form
          className="invite-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!picked) return;
            run(async () => {
              await act.invite.mutateAsync({ budgetId: b.id, userId: picked, role });
              setUserId('');
            });
          }}
        >
          <select className="select" value={picked} onChange={(e) => setUserId(e.target.value)} aria-label="Кого пригласить" required>
            <option value="">Выберите пользователя</option>
            {list.map((c) => <option key={c.userId} value={c.userId}>{c.name}{c.login ? ` — ${c.login}` : ''}</option>)}
          </select>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as 'member' | 'viewer')} aria-label="Роль">
            <option value="member">участник</option>
            <option value="viewer">наблюдатель</option>
          </select>
          <button className="btn btn-primary" disabled={!picked || act.invite.isPending}><UserPlus size={16} /> Пригласить</button>
        </form>
      ) : (
        <p className="hint" style={{ marginTop: 0 }}>Пригласить некого: все пользователи с разрешением «Общие бюджеты» уже в бюджете или приглашены.</p>
      )}

      {(invites.data ?? []).map((i) => (
        <div className="member-row" key={i.id}>
          <span className="member-name">
            <b>{i.userName}</b>
            <br />
            <small className="muted">приглашён как {ROLE_LABEL[i.role]}, ждём ответа</small>
          </span>
          <button className="icon-btn" aria-label="Отозвать приглашение" onClick={() => run(() => act.deleteInvite.mutateAsync({ budgetId: b.id, id: i.id }))}><X size={15} /></button>
        </div>
      ))}
      <p className="hint" style={{ marginBottom: 0 }}>
        В списке только пользователи, которым администратор разрешил общие бюджеты. Приглашённый увидит приглашение у себя и сам решит, принять ли его.
      </p>
    </section>
  );
}

/** Приглашения, адресованные мне. */
export function IncomingInvites() {
  const { user } = useAuth();
  const { setBudgetId } = useBudget();
  const { data = [] } = useIncomingInvites(!!user?.canShare);
  const answer = useAnswerInvite();
  const [error, setError] = useState<string | null>(null);
  if (!data.length) return null;

  const reply = async (id: string, accept: boolean) => {
    setError(null);
    try {
      const r = await answer.mutateAsync({ id, accept });
      if (accept && r.budgetId) setBudgetId(r.budgetId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не получилось');
    }
  };

  return (
    <section className="panel invite-panel">
      <div className="panel-head"><h2>Вас пригласили</h2></div>
      {data.map((i) => (
        <div className="member-row" key={i.id}>
          <span className="member-name">
            <b>{i.budgetName}</b>
            <br />
            <small className="muted">{i.invitedBy ? `${i.invitedBy} приглашает` : 'Приглашение'} как {ROLE_LABEL[i.role]}а: {ROLE_HINT[i.role]}</small>
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={answer.isPending} onClick={() => reply(i.id, true)}>Принять</button>
            <button className="btn" disabled={answer.isPending} onClick={() => reply(i.id, false)}>Отклонить</button>
          </span>
        </div>
      ))}
      <p className="hint" style={{ marginBottom: 0 }}>Ваш личный бюджет участники не увидят.</p>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
    </section>
  );
}
