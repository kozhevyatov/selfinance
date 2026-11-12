import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Meta } from '@selfinance/shared';
import { Layout } from './components/Layout';
import { get } from './lib/api';
import { useAuth } from './lib/auth';
import { BudgetProvider } from './lib/budget';
import { AccountsPage } from './pages/AccountsPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { HomePage } from './pages/HomePage';
import { OperationsPage } from './pages/OperationsPage';
import { SetupPage } from './pages/SetupPage';
import { SoonPage } from './pages/SoonPage';
import { StatsPage } from './pages/StatsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { RecurringPage } from './pages/RecurringPage';
import { SettingsPage } from './pages/SettingsPage';
import { MorePage } from './pages/MorePage';

export function App() {
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => get<Meta>('/meta'), staleTime: 60_000 });
  const { user, loading } = useAuth();

  if (meta.isLoading || loading) return <div className="boot"><div className="spinner" /></div>;
  if (meta.isError || !meta.data) {
    return (
      <div className="boot">
        <div className="empty">
          <p>Сервер не отвечает</p>
          <button className="btn" onClick={() => meta.refetch()}>Повторить</button>
        </div>
      </div>
    );
  }

  if (!meta.data.setupDone) return <SetupPage />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage meta={meta.data} />} />
        <Route path="/register" element={<RegisterPage meta={meta.data} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <BudgetProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="operations" element={<OperationsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="recurring" element={<RecurringPage />} />
          <Route path="budgets" element={<SoonPage title="Бюджеты" />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BudgetProvider>
  );
}
