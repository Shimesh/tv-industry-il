importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBeeSbrkhNoHhHUroX4GpvslUa1u70beYc',
  authDomain: 'tv-industry-il.firebaseapp.com',
  projectId: 'tv-industry-il',
  storageBucket: 'tv-industry-il.firebasestorage.app',
  messagingSenderId: '859315851876',
  appId: '1:859315851876:web:d8f9866f84b06c66284571',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'TV Industry IL';
  const body = payload.notification?.body ?? '';
  const clickAction = payload.data?.linkUrl ?? '/';

  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: { clickAction },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.clickAction ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then(() => client.navigate(url));
        }
      }
      return clients.openWindow(url);
    })
  );
});
