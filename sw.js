/**
 * Service worker.
 *
 * Cuarenta líneas propias en vez de Workbox. En una app cuyo requisito número
 * uno es abrir sin señal parado en la vereda, conviene que el mecanismo que
 * garantiza eso se pueda leer entero de una sentada.
 *
 * Estrategia:
 *   - Navegación y archivos propios: primero el caché, después la red.
 *     La app tiene que abrir instantáneamente aunque no haya nada de señal.
 *   - Tipografías: primero el caché, y si no están, la red (y se guardan).
 *   - Todo lo demás (la API): NUNCA se cachea. Las escrituras las reintenta
 *     la cola de salida; una respuesta vieja de la API sería peor que un error.
 */

const CACHE = 'pompi-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './index.html']).catch(() => {})),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const esPropio = url.origin === self.location.origin;
  const esTipografia = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);

  // La API nunca se cachea.
  if (!esPropio && !esTipografia) return;
  if (esPropio && url.pathname.includes('/rest/v1/')) return;

  e.respondWith(
    caches.match(req).then((enCache) => {
      if (enCache) {
        // Refresca en segundo plano, pero responde ya con lo que hay.
        if (esPropio) {
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          }).catch(() => {});
        }
        return enCache;
      }
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() =>
          req.mode === 'navigate'
            ? caches.match('./index.html').then((r) => r ?? Response.error())
            : Response.error(),
        );
    }),
  );
});
