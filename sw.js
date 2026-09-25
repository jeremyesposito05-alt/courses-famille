// Service worker : l'appli s'ouvre même sans réseau (au fond du magasin).
// Les données de la liste passent par Firebase, qui a son propre cache hors ligne.
const VERSION = 'courses-v15';
const SHELL = ['./', 'index.html', 'app.js', 'budget.js', 'recettes.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));   // toujours la version fraîche du serveur
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const own = url.origin === location.origin;
  const cdn = url.hostname === 'www.gstatic.com' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!own && !cdn) return; // Firestore et le reste : laissés au réseau

  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: own });
    const network = fetch(e.request, own ? { cache: 'no-cache' } : {}).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    });
    if (own) return network.catch(() => cached || cache.match('index.html'));   // l'appli : la version en ligne d'abord
    return cached || network;                              // bibliothèques et polices : le cache d'abord
  }));
});
