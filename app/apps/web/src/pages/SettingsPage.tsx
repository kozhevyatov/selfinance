import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, LogOut, Monitor, Moon, Plus, Share, Sun, Trash2, X } from 'lucide-react';
import { formatPhone, type AdminUser, type Invite, type RegistrationMode, type User } from '@selfinance/shared';
import { TopBar } from '../components/Layout';
import { ApiError, del, get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { setTheme, syncThemeColor } from '../lib/theme';
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall } from '../lib/pwa';
import { Field } from './AuthPages';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

export function SettingsPage() {
  const { user } = useAuth();
  return (
    <>
      <TopBar title="Настройки" />
      <div className="settings">
        <InstallSection />
        <ProfileSection />
        <PasswordSection />
        <ThemeSection />
        <SessionsSection />
        {user?.isAdmin && <AdminSection />}
      </div>
    </>
  );
}

function InstallSection() {
  const [, force] = useState(0);
  useEffect(() => onInstallChange(() => force((n) => n + 1)), []);
  if (isStandalone()) return null;

  return (
    <section className="panel">
      <div className="panel-head"><h2>Приложение на телефоне</h2></div>
      {canPromptInstall() ? (
        <>
          <p className="sub" style={{ marginTop: 0 }}>Установите Selfinance как приложение: иконка на экране, открывается без адресной строки.</p>
          <button className="btn btn-primary" onClick={() => promptInstall()}><Download size={16} /> Установить</button>
        </>
      ) : isIOS() ? (
        <p style={{ margin: 0, color: 'var(--ink-2)' }}>
          В Safari нажмите <Share size={15} style={{ verticalAlign: -2 }} /> «Поделиться», затем «На экран Домой».
        </p>
      ) : (
        <p style={{ margin: 0, color: 'var(--ink-2)' }}>
          Откройте сервис в Chrome на телефоне и выберите в меню «Установить приложение» или «Добавить на главный экран». Нужен HTTPS.
        </p>
      )}
    </section>
  );
}

function ProfileSection() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ? formatPhone(user.phone) : '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'Europe/Moscow');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const zones = (() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
    } catch {
      return [timezone];
    }
  })();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    setFields({});
    try {
      const u = await patch<User>('/auth/me', { name, email: email || null, phone: phone || null, timezone });
      setUser(u);
      setMsg('Сохранено');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      }
    }
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Профиль</h2></div>
      <form onSubmit={submit}>
        <Field label="Имя" error={fields.name}><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <div className="row2">
          <Field label="Email" error={fields.email}><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Телефон" error={fields.phone}><input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        </div>
        <p className="hint">Войти можно по любому из них. Нужен хотя бы один.</p>
        <Field label="Часовой пояс">
          <select className="select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </Field>
        {error && <div className="form-error">{error}</div>}
        {msg && <div className="ok-note">{msg}</div>}
        <button className="btn btn-primary">Сохранить</button>
      </form>
    </section>
  );
}

function PasswordSection() {
  const [currentPassword, setCur] = useState('');
  const [newPassword, setNew] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    try {
      await patch('/auth/me', { currentPassword, newPassword });
      setCur('');
      setNew('');
      setMsg('Пароль изменён');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сменить пароль');
    }
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Пароль</h2></div>
      <form onSubmit={submit}>
        <div className="row2">
          <Field label="Текущий пароль"><input className="input" type="password" value={currentPassword} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required /></Field>
          <Field label="Новый пароль"><input className="input" type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" minLength={6} required /></Field>
        </div>
        {error && <div className="form-error">{error}</div>}
        {msg && <div className="ok-note">{msg}</div>}
        <button className="btn">Сменить пароль</button>
      </form>
    </section>
  );
}

function ThemeSection() {
  const [, force] = useState(0);
  const stored = (() => {
    try {
      return localStorage.getItem('sf.theme');
    } catch {
      return null;
    }
  })();
  const set = (v: 'light' | 'dark' | 'system') => {
    if (v === 'system') {
      try {
        localStorage.removeItem('sf.theme');
      } catch {
        /* ignore */
      }
      document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      syncThemeColor();
    } else setTheme(v);
    force((n) => n + 1);
  };
  const cur = stored ?? 'system';
  return (
    <section className="panel">
      <div className="panel-head"><h2>Оформление</h2></div>
      <div className="segmented">
        <button type="button" aria-pressed={cur === 'light'} onClick={() => set('light')}><Sun size={15} style={{ verticalAlign: -2 }} /> Светлая</button>
        <button type="button" aria-pressed={cur === 'dark'} onClick={() => set('dark')}><Moon size={15} style={{ verticalAlign: -2 }} /> Тёмная</button>
        <button type="button" aria-pressed={cur === 'system'} onClick={() => set('system')}><Monitor size={15} style={{ verticalAlign: -2 }} /> Как в системе</button>
      </div>
    </section>
  );
}

interface Session { id: string; deviceName: string | null; createdAt: string; expiresAt: string }

function SessionsSection() {
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const { data = [] } = useQuery({ queryKey: ['sessions'], queryFn: () => get<Session[]>('/auth/sessions') });
  const revoke = useMutation({ mutationFn: (id: string) => del(`/auth/sessions/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) });
  return (
    <section className="panel">
      <div className="panel-head"><h2>Устройства</h2></div>
      {data.map((s) => (
        <div className="acc" key={s.id}>
          <div className="acc-name">
            <span>{s.deviceName ?? 'Устройство'}<small>вход {fmtDate(s.createdAt)}</small></span>
          </div>
          <button className="icon-btn" aria-label="Завершить сеанс" onClick={() => revoke.mutate(s.id)}><X size={16} /></button>
        </div>
      ))}
      <button className="btn" style={{ marginTop: 14 }} onClick={() => signOut()}><LogOut size={16} /> Выйти</button>
    </section>
  );
}

/* ---------- Администрирование ---------- */

function AdminSection() {
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
  const inviteLink = (code: string) => `${location.origin}/register?invite=${code}`;
  const activeInvites = (invites.data ?? []).filter((i) => !i.usedBy && (!i.expiresAt || i.expiresAt > new Date().toISOString()));

  return (
    <>
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
            {u.id !== me?.id && (
              <div className="chips">
                <button className="chip" onClick={() => resetPassword(u)}>Пароль</button>
                <button className="chip" onClick={() => updUser.mutate({ id: u.id, data: { isAdmin: !u.isAdmin } })}>{u.isAdmin ? 'Снять админа' : 'Сделать админом'}</button>
                <button className="chip" onClick={() => updUser.mutate({ id: u.id, data: { isBlocked: !u.isBlocked } })}>{u.isBlocked ? 'Разблокировать' : 'Заблокировать'}</button>
              </div>
            )}
          </div>
        ))}
        <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>Администратор управляет аккаунтами, но не видит чужие финансы.</p>
      </section>

      {adding && <AddUserSheet onClose={() => setAdding(false)} />}
    </>
  );
}

function AddUserSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    try {
      await post('/admin/users', { name, login, password });
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
        <p className="hint">Передайте пароль пользователю — он сможет сменить его в настройках.</p>
        {error && <div className="form-error">{error}</div>}
        <div className="sheet-actions"><button className="btn btn-primary">Создать</button></div>
      </form>
    </div>
  );
}
