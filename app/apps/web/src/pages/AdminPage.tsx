import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { Copy, Plus, Trash2, X } from 'lucide-react';
import { formatPhone, type AdminUser, type Invite, type RegistrationMode } from '@selfinance/shared';
import { TopBar } from '../components/Layout';
import { ApiError, del, get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Field } from './AuthPages';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

/** Админка: регистрация, приглашения, пользователи. Чужие финансы администратор не видит. */
export function AdminPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: () => get<{ registration: RegistrationMode; version: string; dbType: string | null }>('/admin/settings') });
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => get<AdminUser[]>('/admin/users') });
  const invites = useQuery({ queryKey: ['admin-invites'], queryFn: () => get<Invite[]>('/admin/invites') });
  const [adding, setAdding] = useState(false);

  const setReg = useMutation({
    mutationFn: (registration: RegistrationMode) => patch('/admin/settings', { registration }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['meta'] });
    },
  });
  const updUser = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => patch(`/admin/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (e) => alert(e instanceof ApiError ? e.message : 'Ошибка'),
  });
  const newInvite = useMutation({ mutationFn: () => post<Invite>('/admin/invites', { days: 7 }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-invites'] }) });
  const delInvite = useMutation({ mutationFn: (id: string) => del(`/admin/invites/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-invites'] }) });

  const resetPassword = (u: AdminUser) => {
    const p = prompt(`Новый пароль для «${u.name}» (минимум 6 символов)`);
    if (p && p.length >= 6) updUser.mutate({ id: u.id, data: { password: p } });
  };
  const blockToggle = (u: AdminUser) => {
    if (!u.isBlocked && !confirm(`Заблокировать «${u.name}»? Все его сеансы завершатся.`)) return;
    updUser.mutate({ id: u.id, data: { isBlocked: !u.isBlocked } });
  };
  const inviteLink = (code: string) => `${location.origin}/register?invite=${code}`;
  const activeInvites = (invites.data ?? []).filter((i) => !i.usedBy && (!i.expiresAt || i.expiresAt > new Date().toISOString()));

  if (!me?.isAdmin) return <Navigate to="/" replace />;

  return (
    <>
      <TopBar title="Админка" />
      <div className="settings">
      <section className="panel">
        <div className="panel-head">
          <h2>Регистрация</h2>
          {settings.data && <span className="muted" style={{ fontSize: 13 }}>v{settings.data.version}, {settings.data.dbType === 'mysql' ? 'MySQL/MariaDB' : 'SQLite'}</span>}
        </div>
        <div className="segmented">
          {([['closed', 'Закрытая'], ['invite', 'По приглашениям'], ['open', 'Открытая']] as const).map(([v, t]) => (
            <button key={v} type="button" aria-pressed={settings.data?.registration === v} onClick={() => setReg.mutate(v)}>{t}</button>
          ))}
        </div>

        {settings.data?.registration === 'invite' && (
          <div style={{ marginTop: 18 }}>
            <div className="panel-head" style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: 15 }}>Приглашения</h2>
              <button className="link" onClick={() => newInvite.mutate()}><Plus size={14} style={{ verticalAlign: -2 }} /> Создать ссылку</button>
            </div>
            {activeInvites.length ? activeInvites.map((i) => (
              <div className="acc" key={i.id}>
                <div className="acc-name" style={{ minWidth: 0 }}>
                  <span style={{ minWidth: 0 }}>
                    <span className="num" style={{ fontSize: 13, wordBreak: 'break-all' }}>{inviteLink(i.code)}</span>
                    <small>до {i.expiresAt ? fmtDate(i.expiresAt) : '—'}</small>
                  </span>
                </div>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="icon-btn" aria-label="Скопировать" onClick={() => navigator.clipboard?.writeText(inviteLink(i.code))}><Copy size={15} /></button>
                  <button className="icon-btn" aria-label="Удалить" onClick={() => delInvite.mutate(i.id)}><Trash2 size={15} /></button>
                </span>
              </div>
            )) : <p className="hint" style={{ margin: 0 }}>Активных приглашений нет. Ссылка действует 7 дней и подходит одному человеку.</p>}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Пользователи</h2>
          <button className="link" onClick={() => setAdding(true)}><Plus size={14} style={{ verticalAlign: -2 }} /> Добавить</button>
        </div>
        {(users.data ?? []).map((u) => (
          <div className="acc user-row" key={u.id} style={u.isBlocked ? { opacity: 0.55 } : undefined}>
            <div className="acc-name">
              <span>
                {u.name}
                {u.isAdmin && <span className="badge">админ</span>}
                {u.isBlocked && <span className="badge bad">заблокирован</span>}
                <small>{[u.email, u.phone && formatPhone(u.phone)].filter(Boolean).join(', ')}</small>
              </span>
            </div>
            <div className="chips">
              <label className="chip chip-check" title="Может создавать общие (семейные) бюджеты и видит раздел «Бюджеты»">
                <input type="checkbox" checked={u.canShare} onChange={(e) => updUser.mutate({ id: u.id, data: { canShare: e.target.checked } })} />
                Общие бюджеты
              </label>
              {u.id !== me?.id && (
                <>
                  <button className="chip" onClick={() => resetPassword(u)}>Пароль</button>
                  <button className="chip" onClick={() => updUser.mutate({ id: u.id, data: { isAdmin: !u.isAdmin } })}>{u.isAdmin ? 'Снять админа' : 'Сделать админом'}</button>
                  <button className="chip" onClick={() => blockToggle(u)}>{u.isBlocked ? 'Разблокировать' : 'Заблокировать'}</button>
                </>
              )}
            </div>
          </div>
        ))}
        <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
          «Общие бюджеты» — пользователь может создавать семейные бюджеты, вступать в чужие по приглашению и видит раздел «Бюджеты». Без галочки у него только личный бюджет; если снять её позже, общие бюджеты у него скроются (вернутся, если включить снова).
          Администратор управляет аккаунтами, но не видит чужие финансы.
        </p>
      </section>
      </div>

      {adding && <AddUserSheet onClose={() => setAdding(false)} />}
    </>
  );
}

function AddUserSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [canShare, setCanShare] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    try {
      await post('/admin/users', { name, login, password, canShare, isAdmin });
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      }
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <h2>Новый пользователь</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        <Field label="Имя" error={fields.name}><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
        <Field label="Email или телефон" error={fields.login}><input className="input" value={login} onChange={(e) => setLogin(e.target.value)} required /></Field>
        <Field label="Пароль" error={fields.password}><input className="input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></Field>
        <label className="switch-row">
          <span><b>Общие бюджеты</b><small>Может создавать семейные бюджеты</small></span>
          <input type="checkbox" className="switch" checked={canShare} onChange={(e) => setCanShare(e.target.checked)} />
        </label>
        <label className="switch-row">
          <span><b>Администратор</b><small>Управляет пользователями и регистрацией</small></span>
          <input type="checkbox" className="switch" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
        </label>
        <p className="hint">Передайте пароль пользователю — он сможет сменить его в настройках.</p>
        {error && <div className="form-error">{error}</div>}
        <div className="sheet-actions"><button className="btn btn-primary">Создать</button></div>
      </form>
    </div>
  );
}
