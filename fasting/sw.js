// Service Worker：让轻断食 app 离线也能打开。
// 每次改代码都把版本号加一，iPhone 才会加载新文件。
const CACHE = 'qingduanshi-v2.0.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('qingduanshi-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 先用缓存（快、离线可用），同时在后台更新。
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;
  if (sameOrigin && !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  const update = fetch(req).then(async (res) => {
    if (res && (res.ok || res.type === 'opaque')) {
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
    }
    return res;
  });
  event.waitUntil(update.catch(() => undefined));
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (cached) => cached || update.catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
    )
  );
});
