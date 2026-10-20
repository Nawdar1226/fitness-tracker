// Service Worker: macht die App offline-fähig (z. B. im Gym ohne Empfang).
// Bei jeder Code-Änderung die Versionsnummer erhöhen, damit das iPhone die neuen Dateien lädt.
const CACHE = 'fitness-tracker-v1.1.0';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Erst aus dem Cache antworten (schnell, offline), im Hintergrund aktualisieren.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const update = fetch(req).then(async (res) => {
    if (res && res.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
    }
    return res;
  });

  event.waitUntil(update.catch(() => undefined));
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (cached) => cached || update.catch(() => caches.match('./index.html'))
    )
  );
});
