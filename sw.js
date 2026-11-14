/* Legeniko Arcade service worker — the whole cabinet is static, so it can live
   offline. Shell + game scripts are precached on install; anything else that
   gets fetched is cached as it is used. */
const VERSION = 'legeniko-arcade-v8';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/core.js',
  'js/main.js',
  'js/geometry-dash.js',
  'js/flappy.js',
  'js/games/breakout.js',
  'js/games/snake.js',
  'js/games/puzzle2048.js',
  'js/games/asteroids.js',
  'js/games/pong.js',
  'js/games/memory.js',
  'js/games/whack.js',
  'vendor/three.min.js',
  'js/games/vice3d.js',
  'js/lib/kit3d.js', 'js/lib/stage3d.js',
  'js/lib/touch.js',
  'js/lib/net.js',
  'js/lib/auth.js',
  'js/lib/friends.js',
  'js/lib/mp.js',
  'js/games/ridge.js',
  'js/games/skate.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon-180.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // addAll fails the whole install if one file 404s, so add them individually
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // accounts, friends and the live socket always go straight to the server
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;
  // where the server lives can change between deploys: never serve a cached copy
  if (url.pathname.endsWith('/js/config.js')) return;

  // Navigations: network first so a new deploy shows up, cache as the fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
    );
    return;
  }

  // Assets: cache first, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
