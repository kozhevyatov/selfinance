import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Repeat, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { monthRange, monthTitle, shiftMonth, todayISO } from '@selfinance/shared';
import { TopBar, useTxSheet } from '../components/Layout';
import { TxDays } from '../components/TxList';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { useTransactions, type TxFilters } from '../lib/queries';

const TYPES = [
  { v: '', label: 'Все' },
  { v: 'expense', label: 'Расходы' },
  { v: 'income', label: 'Доходы' },
  { v: 'transfer', label: 'Переводы' },
];

export function OperationsPage() {
  const { user } = useAuth();
  const curMonth = todayISO(user?.timezone).slice(0, 7);
  const [month, setMonth] = useState<string | null>(curMonth);
  const [type, setType] = useState('');
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const l = useLookups();
  const open = useTxSheet();

  const filters = useMemo<TxFilters>(() => {
    const f: TxFilters = {};
    if (month) Object.assign(f, monthRange(month));
    if (type) f.type = type;
    if (account) f.account = account;
    if (category) f.category = category;
    if (q.trim().length >= 2) f.q = q.trim();
    return f;
  }, [month, type, account, category, q]);

  const list = useTransactions(filters, 50);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const topCats = l.categories.filter((c) => !c.parentId);

  return (
    <>
      <TopBar title="Операции">
        <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month ?? curMonth, -1))}>
          <ChevronLeft size={18} />
        </button>
        <b>{month ? monthTitle(month) : 'Все время'}</b>
        <button
          className="icon-btn"
          aria-label="Следующий месяц"
          disabled={!month || month >= curMonth}
          onClick={() => month && setMonth(shiftMonth(month, 1))}
        >
          <ChevronRight size={18} />
        </button>
      </TopBar>

      <div className="filters">
        <div className="filters-row">
          <div className="chips">
            {TYPES.map((t) => (
              <button key={t.v} className="chip" aria-pressed={type === t.v} onClick={() => setType(t.v)}>{t.label}</button>
            ))}
            <button className="chip" aria-pressed={month === null} onClick={() => setMonth(month ? null : curMonth)}>Все время</button>
          </div>
          <Link className="link" to="/recurring" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Repeat size={15} /> Регулярные платежи
          </Link>
        </div>
        <div className="filters-row">
          <label style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
            <Search size={16} className="muted" style={{ position: 'absolute', left: 14, top: 12 }} />
            <input className="input" style={{ paddingLeft: 38 }} placeholder="Поиск по комментарию" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {l.multiAccount && (
            <select className="select" style={{ width: 'auto', minHeight: 40, borderRadius: 999, padding: '8px 14px' }} value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Счёт">
              <option value="">Все счета</option>
              {l.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <select className="select" style={{ width: 'auto', minHeight: 40, borderRadius: 999, padding: '8px 14px' }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Категория">
            <option value="">Все категории</option>
            <option value="none">Без категории</option>
            <optgroup label="Расходы">
              {topCats.filter((c) => c.type === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
            <optgroup label="Доходы">
              {topCats.filter((c) => c.type === 'income').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          </select>
        </div>
      </div>

      <section className="panel">
        {list.isLoading || !l.ready ? (
          <div className="skeleton" style={{ height: 300 }} />
        ) : items.length ? (
          <>
            <TxDays items={items} l={l} onOpen={(tx) => open({ tx })} timezone={user?.timezone} />
            {list.hasNextPage && (
              <div className="load-more">
                <button className="btn" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                  {list.isFetchingNextPage ? 'Загружаю…' : 'Показать ещё'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty"><p>Операций не найдено</p></div>
        )}
      </section>
    </>
  );
}
