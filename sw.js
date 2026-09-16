/**
 * Service worker.
 *
 * Cuarenta líneas propias en vez de Workbox. En una app cuyo requisito número
 * uno es abrir sin señal parado en la vereda, conviene que el mecanismo que
 * garantiza eso se pueda leer entero de una sentada.
 *
 * Estrategia, y por qué cada una:
 *
 *   - `index.html` y cualquier navegación: **primero la red**, con el caché de
 *     respaldo. Es el único archivo cuyo nombre no cambia entre versiones, así
 *     que es el único que puede quedar viejo. Pesa 5 kB: pedirlo no se nota
 *     cuando hay señal, y cuando no hay, responde el caché igual que antes.
 *
 *   - Archivos con hash en el nombre (el JS y el CSS): **primero el caché**,
 *     para siempre. El hash cambia con cada build, así que una versión nueva
 *     pide una URL distinta. Un archivo con hash nunca está desactualizado.
 *
 *   - Tipografías: primero el caché, y si no están, la red.
 *
 *   - La API: NUNCA se cachea. Las escrituras las reintenta la cola de salida;
 *     una respuesta vieja de la API sería peor que un error.
 *
 * Lo que esto evita: que él actualice la app y el cliente siga viendo la
 * versión de la semana pasada en el celular, sin forma de arreglarlo a
 * distancia y sin saber que le está pasando.
 */

// VERSION la reemplaza el build con el hash del bundle. Si el archivo se sirve
// sin reemplazar, el valor de acá abajo funciona igual: solo se pierde el
// borrado del caché viejo.
const VERSION = '__VERSION__';
const CACHE = `pompi-${VERSION}`;

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

/** Los archivos que el bundler nombra con un hash de contenido. */
const tieneHash = (pathname) => /-[a-z0-9]{8,}\.(js|css|webmanifest|png)$/i.test(pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const esPropio = url.origin === self.location.origin;
  const esTipografia = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);

  if (!esPropio && !esTipografia) return;          // la API nunca se cachea
  if (esPropio && url.pathname.includes('/rest/v1/')) return;

  const esDocumento = req.mode === 'navigate'
    || (esPropio && (url.pathname === '/' || url.pathname.endsWith('/index.html')));

  // --- El documento: primero la red -----------------------------------------
  if (esDocumento) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copia));
          }
          return res;
        })
        // Sin señal: lo último que se guardó. La app abre igual.
        .catch(() => caches.match('./index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  // --- Todo lo demás: primero el caché --------------------------------------
  e.respondWith(
    caches.match(req).then((enCache) => {
      // Con hash en el nombre no hace falta ni revalidar: ese contenido no cambia.
      if (enCache && tieneHash(url.pathname)) return enCache;

      if (enCache) {
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
        .catch(() => Response.error());
    }),
  );
});
