/* NT1 Float Recorder — lets the app open without a connection (a practice room with no signal).
   Only the app page itself is kept. Recordings and scores never pass through here: they live in the
   browser's own storage on this device. The network is always asked first, so a new version appears
   as soon as there is a connection; the kept copy is used only when the network fails or is too slow. */
const CACHE = "nt1-app-v1";
const WAIT_MS = 5000;                       // a reply this slow (or none): open the kept copy instead

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
  // the visit that installed this already opened the page without it: keep a copy now, so the next open
  // works offline too
  try {
    const cache = await caches.open(CACHE), key = new URL("./", self.registration.scope).href;
    if (!(await cache.match(key))) { const res = await fetch(key); if (res.ok && res.type === "basic") await cache.put(key, res); }
  } catch (x) {}
})()));

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  const url = new URL(req.url), scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return;
  if (!url.pathname.startsWith(scope.pathname)) return;
  const path = url.pathname.slice(scope.pathname.length);
  if (path !== "" && path !== "index.html") return;     // only the app page
  e.respondWith(openApp(req, e));
});

async function openApp(req, e){
  const cache = await caches.open(CACHE), key = new URL("./", self.registration.scope).href;
  const net = fetch(req).then(res => {
    if (res.ok && res.type === "basic") e.waitUntil(cache.put(key, res.clone()).catch(() => {}));
    return res;
  });
  const kept = await cache.match(key);
  if (!kept) return net;                                // first visit: the network as usual
  let timer;
  const slow = new Promise(r => { timer = setTimeout(() => r(null), WAIT_MS); });
  try {
    const res = await Promise.race([net.catch(() => null), slow]);
    if (res && (res.ok || res.type === "opaqueredirect")) return res;      // (a redirect is the server's to make)
    return kept;
  } finally { clearTimeout(timer); e.waitUntil(net.catch(() => {})); }
}
