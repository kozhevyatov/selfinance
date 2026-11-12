import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { BarChart3, ChevronDown, Home, List, LogOut, Menu, Moon, Plus, Repeat, Settings, Sun, Tag, Users, Wallet } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useBudget } from '../lib/budget';
import { getTheme, toggleTheme } from '../lib/theme';
import { TxSheet, type TxSheetOptions } from './TxSheet';

const SheetCtx = createContext<(o?: TxSheetOptions) => void>(() => undefined);
export const useTxSheet = () => useContext(SheetCtx);

const NAV = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/operations', label: 'Операции', icon: List },
  { to: '/stats', label: 'Статистика', icon: BarChart3 },
  { to: '/accounts', label: 'Счета', icon: Wallet },
  { to: '/recurring', label: 'Регулярные', icon: Repeat },
  { to: '/categories', label: 'Категории', icon: Tag },
  { to: '/budgets', label: 'Бюджеты', icon: Users },
];

export function Layout() {
  const { user, signOut } = useAuth();
  const { canEdit } = useBudget();
  const [sheet, setSheet] = useState<TxSheetOptions | null>(null);
  const open = useCallback((o?: TxSheetOptions) => setSheet(o ?? {}), []);
  const close = useCallback(() => setSheet(null), []);
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const moreActive = ['/more', '/accounts', '/recurring', '/categories', '/budgets', '/settings'].some((p) => pathname.startsWith(p));

  // ярлык «Добавить операцию» с иконки приложения: /?add=1
  useEffect(() => {
    if (params.get('add') === '1') {
      if (canEdit) setSheet({});
      params.delete('add');
      setParams(params, { replace: true });
    }
  }, [params, setParams, canEdit]);

  return (
    <SheetCtx.Provider value={open}>
      <div className="app">
        <aside className="side">
          <Link to="/" className="logo" title="На главную">
            <div className="logo-mark"><Wallet size={18} /></div>
            <span>Selfinance</span>
          </Link>
          <nav className="nav" aria-label="Разделы">
            {NAV.map(({ to, label, icon: I, end }) => (
              <NavLink key={to} to={to} end={end} title={label}>
                <I size={20} strokeWidth={1.8} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="side-foot nav">
            <div className="side-user">{user?.name}</div>
            <NavLink to="/settings" title="Настройки">
              <Settings size={20} strokeWidth={1.8} />
              <span>Настройки</span>
            </NavLink>
            <button type="button" onClick={() => signOut()} title="Выйти">
              <LogOut size={20} strokeWidth={1.8} />
              <span>Выйти</span>
            </button>
          </div>
        </aside>

        <main className="page">
          <Outlet />
        </main>
      </div>

      <nav className="tabbar" aria-label="Разделы">
        <NavLink to="/" end><Home size={20} strokeWidth={1.8} />Главная</NavLink>
        <NavLink to="/operations"><List size={20} strokeWidth={1.8} />Операции</NavLink>
        {canEdit ? (
          <button type="button" className="fab" aria-label="Добавить операцию" onClick={() => open()}>
            <Plus size={26} strokeWidth={2.2} />
          </button>
        ) : <span />}
        <NavLink to="/stats"><BarChart3 size={20} strokeWidth={1.8} />Статистика</NavLink>
        <NavLink to="/more" className={() => (moreActive ? 'active' : '')}><Menu size={20} strokeWidth={1.8} />Ещё</NavLink>
      </nav>

      {sheet && <TxSheet opts={sheet} onClose={close} />}
    </SheetCtx.Provider>
  );
}

/** Шапка страницы: выбор бюджета, произвольный центр, тема и кнопка «Добавить». */
export function TopBar({ title, children }: { title?: string; children?: ReactNode }) {
  const { budgets, budget, setBudgetId, canEdit } = useBudget();
  const open = useTxSheet();
  const [, force] = useState(0);
  const dark = getTheme() === 'dark';

  return (
    <header className="top">
      {title && <h1>{title}</h1>}
      {budgets.length > 1 && budget && (
        <label className="budget-pick">
          <span className="dot">{budget.name.slice(0, 1).toUpperCase()}</span>
          <select
            value={budget.id}
            onChange={(e) => setBudgetId(e.target.value)}
            style={{ border: 0, background: 'transparent', fontWeight: 500, appearance: 'none', paddingRight: 4 }}
            aria-label="Бюджет"
          >
            {budgets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <ChevronDown size={16} className="muted" />
        </label>
      )}
      <div className="month">{children}</div>
      <button
        type="button"
        className="icon-btn"
        aria-label="Сменить тему"
        onClick={() => {
          toggleTheme();
          force((n) => n + 1);
        }}
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      {canEdit && (
        <button type="button" className="btn-add" onClick={() => open()}>
          <Plus size={20} /> Добавить
        </button>
      )}
    </header>
  );
}
