import { useState } from 'react';
import { ArrowUpCircle, Check, Copy, RefreshCw, WifiOff } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useOnline } from '../lib/offline';
import { useCheckVersion, useVersion } from '../lib/queries';

const UPDATE_CMD = 'docker compose pull && docker compose up -d';

/** Есть ли обновление, о котором стоит сказать этому пользователю (обновляет сервер только администратор). */
export function useUpdateBadge() {
  const { user } = useAuth();
  const { data } = useVersion();
  return !!user?.isAdmin && !!data?.updateAvailable;
}

/** Блок внизу «Ещё»: версия сервера и подсказка про обновление. */
export function UpdateInfo() {
  const { user } = useAuth();
  const { data, isLoading } = useVersion();
  const check = useCheckVersion();
  const [copied, setCopied] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const admin = !!user?.isAdmin;

  if (isLoading) return null;
  const info = check.data ?? data;
  if (!info) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(UPDATE_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* нет доступа к буферу — команду видно и так */
    }
  }

  const checkBtn = info.enabled && (
    <button type="button" className="link ver-check" onClick={() => check.mutate()} disabled={check.isPending}>
      <RefreshCw size={13} className={check.isPending ? 'spin' : undefined} /> {check.isPending ? 'Проверяю…' : 'Проверить'}
    </button>
  );

  if (!info.updateAvailable) {
    return (
      <div className="ver-line muted">
        <span>
          Selfinance {info.current}
          {info.enabled && !info.error && info.latest && ' · последняя версия'}
          {info.error && ` · ${info.error.toLowerCase()}`}
        </span>
        {admin && checkBtn}
      </div>
    );
  }

  return (
    <section className="update-card" aria-label="Доступно обновление">
      <div className="update-head">
        <ArrowUpCircle size={22} />
        <div>
          <b>Доступна новая версия {info.latest}</b>
          <small>
            У вас {info.current}.{' '}
            {admin ? 'Рекомендуем обновить сервер.' : 'Обновить сервер может администратор.'}
          </small>
        </div>
      </div>

      {info.notes.length > 0 && (
        <>
          <button type="button" className="link" onClick={() => setShowNotes(!showNotes)}>
            {showNotes ? 'Скрыть, что нового' : 'Что нового'}
          </button>
          {showNotes && (
            <div className="update-notes">
              {info.notes.map((n) => (
                <div key={n.version}>
                  <b>{n.version}</b>
                  <ul>{n.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {admin && (
        <>
          <p className="muted update-how">В папке с docker-compose.yml на сервере выполните:</p>
          <div className="update-cmd">
            <code>{UPDATE_CMD}</code>
            <button type="button" className="icon-btn" onClick={copy} aria-label="Скопировать команду">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <p className="muted update-how">Данные в папке data не затрагиваются. Если собираете сами — git pull и docker compose up -d --build.</p>
          <div className="update-foot">
            <a className="link" href={`https://github.com/${info.repo}`} target="_blank" rel="noreferrer">Страница на GitHub</a>
            {checkBtn}
          </div>
        </>
      )}
    </section>
  );
}

/** Полоска «нет интернета» над страницей. */
export function OfflineBar() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-bar" role="status">
      <WifiOff size={15} /> Нет интернета — показаны сохранённые данные. Обновятся сами, когда связь появится.
    </div>
  );
}
