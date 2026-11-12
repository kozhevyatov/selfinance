import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import type { AuthResponse, Meta } from '@selfinance/shared';
import { ApiError, post } from '../lib/api';
import { deviceName, useAuth } from '../lib/auth';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="logo">
          <div className="logo-mark"><Wallet size={18} /></div>
          <span>Selfinance</span>
        </div>
        <div className="panel">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className={'field' + (error ? ' has-error' : '')}>
      <span>{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function LoginPage({ meta }: { meta: Meta }) {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const auth = await post<AuthResponse>('/auth/login', { login, password, deviceName: deviceName() });
      signIn(auth);
      nav('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1>Вход</h1>
      <p className="sub">Учёт доходов и расходов</p>
      <form onSubmit={submit}>
        <Field label="Email или телефон">
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus required />
        </Field>
        <Field label="Пароль">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Вхожу…' : 'Войти'}</button>
      </form>
      {meta.registration !== 'closed' && (
        <p className="auth-foot">Нет аккаунта? <Link className="link" to="/register">Зарегистрироваться</Link></p>
      )}
    </AuthShell>
  );
}

export function RegisterPage({ meta }: { meta: Meta }) {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const params = new URLSearchParams(location.search);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(params.get('invite') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (meta.registration === 'closed') {
    return (
      <AuthShell>
        <h1>Регистрация закрыта</h1>
        <p className="sub">Попросите администратора создать вам аккаунт.</p>
        <Link className="btn btn-block" to="/login">Ко входу</Link>
      </AuthShell>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const auth = await post<AuthResponse>('/auth/register', {
        name,
        login,
        password,
        inviteCode: inviteCode || undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        deviceName: deviceName(),
      });
      signIn(auth);
      nav('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else setError('Не удалось зарегистрироваться');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1>Регистрация</h1>
      <p className="sub">Для входа подойдёт email или номер телефона</p>
      <form onSubmit={submit}>
        <Field label="Имя" error={fields.name}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus required />
        </Field>
        <Field label="Email или телефон" error={fields.login}>
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
        </Field>
        <Field label="Пароль" error={fields.password}>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required />
        </Field>
        {meta.registration === 'invite' && (
          <Field label="Код приглашения" error={fields.inviteCode}>
            <input className="input" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
          </Field>
        )}
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Создаю…' : 'Создать аккаунт'}</button>
      </form>
      <p className="auth-foot">Уже есть аккаунт? <Link className="link" to="/login">Войти</Link></p>
    </AuthShell>
  );
}
