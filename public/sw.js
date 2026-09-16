/* STEP 1: Offline-First PWA Service Worker (Dexie outbox + auto-sync support).
   Strategy: app-shell cache-first for GET navigation/assets; API calls go network-first
   so field answers never get stuck behind a stale cache. */
const CACHE = 'ai-survey-v1';
const CORE = ['/survey', '/survey.html', '/public/dashboard', '/manifest.json', '/offline-db.js', '/sync.js', '/survey.js', '/styles.css'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return; // let POST /api/* pass through (sync.js handles offline)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('/survey.html')))
  );
});
