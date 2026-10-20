/* nortest service worker — bump VERSION when you change files so phones get the update */
const VERSION = 'nortest-v16';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './backup.js',
  './style.css',
  './fonts.css',
  './m3.js',
  './sf.js',
  './glass.js',
  './glass.css',
  './b1.js',
  './radio.js',
  './spotify.js',
  './extras.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];
// Static libraries from other sites that are safe to keep offline (NOT APIs).
const CDN = ['https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js'];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    await Promise.all(CDN.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Other sites: only static CDN files are cached. Everything else
  // (ntfy.sh remote, LRCLIB lyrics, any API) is left completely alone.
  if (url.origin !== self.location.origin) {
    if (!CDN_HOSTS.includes(url.hostname)) return;
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  // Only handle files inside this app's folder.
  if (!url.pathname.startsWith(new URL('./', self.location).pathname)) return;
  if (req.headers.has('range')) return;

  // Our own files: network first (so updates come through), cache when offline.
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }
  })());
});
