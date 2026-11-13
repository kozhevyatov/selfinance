import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight, LogOut, Repeat, Settings, Tag, Users, Wallet } from 'lucide-react';
import { TopBar } from '../components/Layout';
import { UpdateInfo } from '../components/UpdateInfo';
import { useAuth } from '../lib/auth';

const ITEMS = [
  { to: '/accounts', label: 'Счета', hint: 'Банки, наличные, накопления', icon: Wallet },
  { to: '/recurring', label: 'Регулярные платежи', hint: 'Напоминания о ежемесячных платежах', icon: Repeat },
  { to: '/planned', label: 'Планы', hint: 'Запланированные покупки и ожидаемые доходы', icon: CalendarClock },
  { to: '/categories', label: 'Категории', hint: 'Добавить, изменить, удалить', icon: Tag },
  { to: '/budgets', label: 'Бюджеты', hint: 'Личный и семейные', icon: Users },
  { to: '/settings', label: 'Настройки', hint: 'Профиль, пароль, оформление', icon: Settings },
];

/** «Ещё» — разделы, которые не поместились в нижнюю панель на телефоне. */
export function MorePage() {
  const { user, signOut } = useAuth();
  return (
    <>
      <TopBar title="Ещё" />
      <section className="panel more-list">
        {user?.name && (
          <Link to="/settings" className="more-user">
            <span className="more-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="more-text">
              <b>{user.name}</b>
              <small className="muted">Профиль и пароль</small>
            </span>
            <ChevronRight size={18} className="muted" />
          </Link>
        )}
        {ITEMS.map(({ to, label, hint, icon: I }) => (
          <Link key={to} to={to} className="more-item">
            <span className="more-ico"><I size={19} strokeWidth={1.8} /></span>
            <span className="more-text">
              <b>{label}</b>
              <small className="muted">{hint}</small>
            </span>
            <ChevronRight size={18} className="muted" />
          </Link>
        ))}
        <button type="button" className="more-item more-exit" onClick={() => signOut()}>
          <span className="more-ico"><LogOut size={19} strokeWidth={1.8} /></span>
          <span className="more-text"><b>Выйти</b></span>
        </button>
      </section>
      <UpdateInfo />
    </>
  );
}
