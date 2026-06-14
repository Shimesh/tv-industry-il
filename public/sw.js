

const CACHE_NAME = 'tv-industry-il-v2.8.123';

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

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { data: { title: 'TV Industry IL', body: event.data.text() } };
  }

  const data = payload?.data || {};
  const notification = payload?.notification || {};
  const title = notification.title || data.title || 'TV Industry IL';
  const body = notification.body || data.body || '';
  const link = payload?.fcmOptions?.link || data.link || data.linkUrl || '/';
  const notifType = data.notifType || data.type || '';

  if (!title && !body) return;

  // Incoming call — show with answer/decline action buttons
  if (notifType === 'incoming_call') {
    const callId = data.callId || '';
    const actionToken = data.actionToken || '';
    const tag = `incoming-call-${callId}`;

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag,
        renotify: true,
        requireInteraction: true,
        dir: 'rtl',
        lang: 'he',
        actions: [
          { action: 'decline', title: '✕ דחה' },
          { action: 'answer', title: '✓ ענה' },
        ],
        data: { link, callId, actionToken, notifType: 'incoming_call' },
      }),
    );
    return;
  }

  const tag = data.type && data.type.startsWith('world_cup_') ? data.type : 'tv-industry-push';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag,
      renotify: true,
      dir: 'rtl',
      lang: 'he',
      data: { link },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};

  // Handle call action buttons
  if (notifData.notifType === 'incoming_call') {
    const { callId, actionToken } = notifData;

    if (event.action === 'decline') {
      event.waitUntil(
        fetch('/api/call/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId, action: 'decline', token: actionToken }),
        }).catch(() => {}),
      );
      return;
    }

    // 'answer' action or tap on notification body — open app and auto-answer
    const answerUrl = `/chat?callId=${encodeURIComponent(callId)}&callAction=answer`;
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            void client.navigate(answerUrl);
            return client.focus();
          }
        }
        return clients.openWindow(answerUrl);
      }),
    );
    return;
  }

  const link = notifData.link || '/';
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
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
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((name) => name.startsWith('tv-industry-il-') && name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    ))
  );
  self.clients.claim();
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
      })
  );
});
