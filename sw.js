// Supper Board offline support: the app, recipes and photos are kept on the phone so the
// grocery list opens in the store even with no signal. Pages and data are fetched fresh
// when there is a connection (falling back to the saved copy after a few seconds).
const CACHE = 'supper-board-v2';
const CORE = ['./', 'index.html', 'recipes.json', 'thumbs.json', 'manifest.webmanifest', 'icons/logo.svg', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (p, ms) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error('timeout')), ms); p.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); no(e); }); });

async function networkFirst(req, key, ms){
  const c = await caches.open(CACHE);
  try {
    const res = await timeout(fetch(req), ms);
    if (res && res.ok) c.put(key, res.clone());
    return res;
  } catch {
    const hit = await c.match(key) || await c.match(key, {ignoreSearch: true});
    if (hit) return hit;
    throw new Error('offline');
  }
}
async function staleWhileRevalidate(req, key){
  const c = await caches.open(CACHE);
  const hit = await c.match(key);
  const fresh = fetch(req).then(res => { if (res && res.ok) c.put(key, res.clone()); return res; }).catch(() => null);
  return hit || (await fresh) || fetch(req);
}
async function cacheFirst(req){
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // fonts: keep a copy once loaded
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(cacheFirst(req)); return; }
  if (url.origin !== location.origin) return; // sync, Claude and store links go straight to the network
  // the update check asks for a fresh copy: never answer it from the cache
  if (url.searchParams.has('v')) return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, 'index.html', 2500)); return; }
  // recipes and photos: answer from the phone right away and refresh the saved copy in the background
  if (/\/(recipes|thumbs)\.json$/.test(url.pathname)) { e.respondWith(staleWhileRevalidate(req, url.pathname.replace(/^.*\//, ''))); return; }
  if (/\.(json|webmanifest|js)$/.test(url.pathname)) { e.respondWith(networkFirst(req, url.pathname.replace(/^.*\//, ''), 3000).catch(() => fetch(req))); return; }
  e.respondWith(cacheFirst(req));
});
