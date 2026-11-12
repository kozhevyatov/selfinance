import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthResponse, DbConfigInput, RegistrationMode } from '@selfinance/shared';
import { ApiError, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { AuthShell, Field } from './AuthPages';

type Step = 0 | 1 | 2;

export function SetupPage() {
  const qc = useQueryClient();
  const { signIn } = useAuth();
  const [step, setStep] = useState<Step>(0);

  const [dbType, setDbType] = useState<'sqlite' | 'mysql'>('sqlite');
  const [host, setHost] = useState('db');
  const [port, setPort] = useState('3306');
  const [user, setUser] = useState('root');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('selfinance');
  const [dbOk, setDbOk] = useState(false);

  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [registration, setRegistration] = useState<RegistrationMode>('closed');

  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const db = (): DbConfigInput =>
    dbType === 'sqlite' ? { type: 'sqlite' } : { type: 'mysql', host, port: Number(port) || 3306, user, password, database };

  async function testDb() {
    setBusy(true);
    setError(null);
    setDbOk(false);
    try {
      await post('/setup/test-db', db());
      setDbOk(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка подключения');
    } finally {
      setBusy(false);
    }
  }

  async function next(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (step === 0) {
      if (dbType === 'mysql' && !dbOk) return testDb();
      return setStep(1);
    }
    if (step === 1) return setStep(2);

    setBusy(true);
    setFields({});
    try {
      const res = await post<{ done: boolean; existing: boolean; auth?: AuthResponse }>('/setup', {
        db: db(),
        admin: { name, login, password: adminPass },
        registration,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (res.auth) signIn(res.auth);
      await qc.invalidateQueries({ queryKey: ['meta'] });
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
        if (Object.keys(e.fields).some((k) => k.startsWith('admin'))) setStep(1);
      } else setError('Не удалось завершить настройку');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="steps" aria-hidden>
        {[0, 1, 2].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}
      </div>
      <form onSubmit={next}>
        {step === 0 && (
          <>
            <h1>База данных</h1>
            <p className="sub">Где хранить данные. Выбор делается один раз.</p>
            <div className="choice">
              <label>
                <input type="radio" name="db" checked={dbType === 'sqlite'} onChange={() => { setDbType('sqlite'); setDbOk(false); }} />
                <span><b>SQLite</b><small>Файл в папке data рядом с сервисом. Ничего настраивать не нужно.</small></span>
              </label>
              <label>
                <input type="radio" name="db" checked={dbType === 'mysql'} onChange={() => { setDbType('mysql'); setDbOk(false); }} />
                <span><b>MySQL / MariaDB</b><small>Своя база на сервере. База будет создана, если её нет.</small></span>
              </label>
            </div>
            {dbType === 'mysql' && (
              <>
                <div className="row2">
                  <Field label="Хост"><input className="input" value={host} onChange={(e) => { setHost(e.target.value); setDbOk(false); }} required /></Field>
                  <Field label="Порт"><input className="input" value={port} inputMode="numeric" onChange={(e) => { setPort(e.target.value); setDbOk(false); }} /></Field>
                </div>
                <div className="row2">
                  <Field label="Пользователь"><input className="input" value={user} onChange={(e) => { setUser(e.target.value); setDbOk(false); }} required /></Field>
                  <Field label="Пароль"><input className="input" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setDbOk(false); }} /></Field>
                </div>
                <Field label="Имя базы" error={fields['db.database']}>
                  <input className="input" value={database} onChange={(e) => { setDatabase(e.target.value); setDbOk(false); }} required />
                </Field>
                {dbOk && <div className="ok-note">Подключение работает</div>}
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h1>Администратор</h1>
            <p className="sub">Ваш аккаунт. Админ управляет пользователями, но не видит чужие финансы.</p>
            <Field label="Имя" error={fields['admin.name']}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
            </Field>
            <Field label="Email или телефон" error={fields['admin.login']}>
              <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
            </Field>
            <Field label="Пароль" error={fields['admin.password']}>
              <input className="input" type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} autoComplete="new-password" minLength={6} required />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Регистрация</h1>
            <p className="sub">Кто может создавать аккаунты. Можно поменять позже.</p>
            <div className="choice">
              {([
                ['closed', 'Закрытая', 'Аккаунты создаёт только администратор'],
                ['invite', 'По приглашениям', 'Регистрация по коду от администратора'],
                ['open', 'Открытая', 'Зарегистрироваться может любой'],
              ] as const).map(([v, t, d]) => (
                <label key={v}>
                  <input type="radio" name="reg" checked={registration === v} onChange={() => setRegistration(v)} />
                  <span><b>{t}</b><small>{d}</small></span>
                </label>
              ))}
            </div>
          </>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="sheet-actions">
          {step > 0 && <button type="button" className="btn" onClick={() => setStep((step - 1) as Step)}>Назад</button>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Подождите…' : step === 0 && dbType === 'mysql' && !dbOk ? 'Проверить подключение' : step === 2 ? 'Готово' : 'Дальше'}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
