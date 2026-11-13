import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import './styles.css';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { cachedUser } from './lib/auth';
import { restoreCache, setCacheOwner, startPersist } from './lib/offline';
import { initPwa } from './lib/pwa';
import { syncThemeColor } from './lib/theme';

initPwa();
syncThemeColor();

const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime побольше — чтобы сохранённые для офлайна данные не выкидывались через 5 минут
    queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 10_000, gcTime: 24 * 60 * 60 * 1000 },
    // без сети изменения не ждут молча, а сразу показывают «Нет связи с сервером»
    mutations: { networkMode: 'always' },
  },
});

// сначала показываем сохранённое на устройстве, свежее подтянется с сервера
const me = cachedUser();
setCacheOwner(me?.id ?? null);
restoreCache(queryClient, me?.id ?? null);
startPersist(queryClient);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
