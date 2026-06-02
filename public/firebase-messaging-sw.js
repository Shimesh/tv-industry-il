const CACHE_NAME = 'tv-industry-il-v2.8.9';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

const SKIP_PATH_PREFIXES = [
  '/api/',
  '/__/auth/',
  '/auth/',
];

function shouldHandleRequest(request) {
  if (request.method !== 'GET') return false;
  if (request.headers.has('range')) return false;
  if (request.mode === 'navigate') return false;
  if (request.destination === 'document') return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (SKIP_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return false;
  if (url.pathname.startsWith('/_next/')) return false;

  return true;
}

function shouldCacheResponse(response) {
  return response && response.ok && response.status === 200 && response.type === 'basic';
}

function showAppNotification(payload) {
  const data = payload?.data || {};
  const notification = payload?.notification || {};
  const title = notification.title || data.title || 'TV Industry IL';
  const body = notification.body || data.body || '';
  const link = payload?.fcmOptions?.link || data.link || data.linkUrl || '/';
  const tag = data.type && data.type.startsWith('world_cup_') ? data.type : 'tv-industry-push';

  return self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag,
    renotify: true,
    dir: 'rtl',
    lang: 'he',
    data: { link },
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return clients.openWindow(link);
    }),
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { data: { title: 'TV Industry IL', body: event.data.text(), link: '/' } };
  }

  // Always show a system notification. FCMForegroundListener in the main thread
  // handles the foreground case (in-app toast) via Firebase's onMessage — that
  // fires before the push event reaches the SW when the app is open, so the
  // user sees the toast. The system notification tag deduplicates on the OS level.
  event.waitUntil(showAppNotification(payload));
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name.startsWith('tv-industry-il-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      )),
      clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  if (!shouldHandleRequest(event.request)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (shouldCacheResponse(response)) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;

        if (event.request.mode === 'navigate') {
          const cachedRoot = await caches.match('/');
          if (cachedRoot) return cachedRoot;
        }

        return Response.error();
      }),
  );
});
