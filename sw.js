/* Informes GRI - modo sin conexión.
   Guarda una copia de la plataforma y sus librerías en el celular para que abra sin señal.
   Los datos (Firebase) NO pasan por aquí: Firestore maneja su propia cola sin conexión. */
const CACHE = 'gri-v1';
const LOCAL = ['./', './index.html', './manifest.json', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  'https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap'
];
// Solo estos servidores se guardan en el celular (nunca la base de datos ni el inicio de sesión).
const CACHEABLE = u =>
  u.origin === self.location.origin ||
  u.hostname === 'cdn.jsdelivr.net' || u.hostname === 'cdnjs.cloudflare.com' ||
  u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com' ||
  (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/'));

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled([
      ...LOCAL.map(u => c.add(u)),
      ...LIBS.map(u => fetch(u, { mode: 'cors' }).then(r => r.ok ? c.put(u, r) : null))
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!CACHEABLE(url)) return;

  // La página: primero internet (para recibir actualizaciones); sin señal, la copia guardada.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await fetch(req);
        if (r.ok) c.put('./', r.clone());
        return r;
      } catch (_) {
        return (await c.match('./')) || (await c.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Archivos propios: copia guardada y se actualiza en segundo plano.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }

  // Librerías y fuentes (versiones fijas): se usan desde el celular si ya están guardadas.
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreVary: true });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok || r.type === 'opaque') c.put(req, r.clone());
      return r;
    } catch (_) {
      return Response.error();
    }
  })());
});
