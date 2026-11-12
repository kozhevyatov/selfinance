/* Selfinance service worker.
 * - /assets/* (файлы с хешем в имени) — из кеша, иначе из сети и в кеш;
 * - страницы — из сети, без сети — сохранённая оболочка приложения;
 * - /api/* — только сеть, финансовые данные не кешируем.
 */
const SHELL = 'sf-shell-v1';
const ASSETS = 'sf-assets-v1';
const SHELL_FILES = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/favicon.svg'];
const MAX_ASSETS = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // статика с хешем — неизменна
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(req, copy)).then(() => trim(ASSETS, MAX_ASSETS));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // переходы по страницам SPA: сеть, при ошибке — сохранённый index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // прочие файлы из public: сначала сеть, затем кеш
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
