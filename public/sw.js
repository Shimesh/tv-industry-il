const CACHE_NAME = 'tv-industry-il-v2.6.15';
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
