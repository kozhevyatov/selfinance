import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Coins, Download, KeyRound, LogOut, Monitor, Moon, Palette, Share, Shield, Smartphone, Sun, User as UserIcon, X } from 'lucide-react';
import { formatPhone, type User, type WeekStart } from '@selfinance/shared';
import { TopBar } from '../components/Layout';
import { ApiError, del, get, patch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { setTheme, syncThemeColor } from '../lib/theme';
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall } from '../lib/pwa';
import { Field } from './AuthPages';
import { useBudget } from '../lib/budget';
import { CurrencySelect } from '../components/CurrencySelect';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

type SectionKey = 'profile' | 'password' | 'currency' | 'theme' | 'devices' | 'install';

const SECTIONS: { key: SectionKey; label: string; hint: string; icon: typeof UserIcon }[] = [
  { key: 'profile', label: 'Профиль', hint: 'Имя, email, телефон, часовой пояс, начало недели', icon: UserIcon },
  { key: 'password', label: 'Пароль', hint: 'Сменить пароль входа', icon: KeyRound },
  { key: 'currency', label: 'Валюта', hint: 'Валюта текущего бюджета', icon: Coins },
  { key: 'theme', label: 'Оформление', hint: 'Светлая, тёмная или как в системе', icon: Palette },
  { key: 'devices', label: 'Устройства', hint: 'Где выполнен вход, завершить сеансы', icon: Smartphone },
  { key: 'install', label: 'Приложение на телефоне', hint: 'Установить Selfinance как приложение', icon: Download },
];

/** Настройки — список разделов; каждый открывается отдельной страницей /settings/<раздел>. */
export function SettingsPage() {
  const { user, signOut } = useAuth();
  const items = SECTIONS.filter((s) => s.key !== 'install' || !isStandalone());
  return (
    <>
      <TopBar title="Настройки" />
      <section className="panel more-list" style={{ maxWidth: 720 }}>
        {items.map(({ key, label, hint, icon: I }) => (
          <Link key={key} to={`/settings/${key}`} className="more-item">
            <span className="more-ico"><I size={19} strokeWidth={1.8} /></span>
            <span className="more-text">
              <b>{label}</b>
              <small className="muted">{hint}</small>
            </span>
            <ChevronRight size={18} className="muted" />
          </Link>
        ))}
        {user?.isAdmin && (
          <Link to="/admin" className="more-item">
            <span className="more-ico"><Shield size={19} strokeWidth={1.8} /></span>
            <span className="more-text">
              <b>Админка</b>
              <small className="muted">Пользователи, регистрация, приглашения</small>
            </span>
            <ChevronRight size={18} className="muted" />
          </Link>
        )}
        <button type="button" className="more-item more-exit" onClick={() => signOut()}>
          <span className="more-ico"><LogOut size={19} strokeWidth={1.8} /></span>
          <span className="more-text"><b>Выйти</b></span>
        </button>
      </section>
    </>
  );
}

/** Отдельная страница раздела настроек. */
export function SettingsSectionPage() {
  const { section } = useParams();
  const item = SECTIONS.find((s) => s.key === section);
  if (!item) return <Navigate to="/settings" replace />;
  const body = {
    profile: <ProfileSection />,
    password: <PasswordSection />,
    currency: <CurrencySection />,
    theme: <ThemeSection />,
    devices: <SessionsSection />,
    install: <InstallSection />,
  }[item.key];
  return (
    <>
      <TopBar title={item.label} />
      <Link to="/settings" className="back-link"><ChevronLeft size={16} /> Настройки</Link>
      <div className="settings">{body}</div>
    </>
  );
}

function InstallSection() {
  const [, force] = useState(0);
  useEffect(() => onInstallChange(() => force((n) => n + 1)), []);
  if (isStandalone()) {
    return <section className="panel"><p style={{ margin: 0 }}>Selfinance уже установлен как приложение.</p></section>;
  }

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
  const [weekStart, setWeekStart] = useState<WeekStart>(user?.weekStart ?? 1);
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
      const u = await patch<User>('/auth/me', { name, email: email || null, phone: phone || null, timezone, weekStart });
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
        <Field label="Первый день недели">
          <div className="segmented">
            <button type="button" aria-pressed={weekStart === 1} onClick={() => setWeekStart(1)}>Понедельник</button>
            <button type="button" aria-pressed={weekStart === 0} onClick={() => setWeekStart(0)}>Воскресенье</button>
          </div>
        </Field>
        {error && <div className="form-error">{error}</div>}
        {msg && <div className="ok-note">{msg}</div>}
        <button className="btn btn-primary">Сохранить</button>
      </form>
    </section>
  );
}

function CurrencySection() {
  const qc = useQueryClient();
  const { budget, budgets } = useBudget();
  const [currency, setCurrency] = useState(budget?.currency ?? 'RUB');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = budget?.role === 'owner';

  useEffect(() => {
    setCurrency(budget?.currency ?? 'RUB');
    setMsg(null);
    setError(null);
  }, [budget?.id, budget?.currency]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!budget) return;
    setMsg(null);
    setError(null);
    try {
      await patch(`/budgets/${budget.id}`, { currency });
      await qc.invalidateQueries({ queryKey: ['budgets'] });
      setMsg('Сохранено');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    }
  }

  if (!budget) return null;
  return (
    <section className="panel">
      <div className="panel-head"><h2>Валюта{budgets.length > 1 ? ` · ${budget.name}` : ''}</h2></div>
      <form onSubmit={submit}>
        <Field label="Валюта бюджета">
          <CurrencySelect value={currency} onChange={setCurrency} disabled={!isOwner} />
        </Field>
        <p className="hint">
          {isOwner
            ? 'Меняется только обозначение: суммы не пересчитываются по курсу.'
            : 'Сменить валюту может только владелец бюджета.'}
        </p>
        {error && <div className="form-error">{error}</div>}
        {msg && <div className="ok-note">{msg}</div>}
        {isOwner && <button className="btn btn-primary" disabled={currency === budget.currency}>Сохранить</button>}
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
