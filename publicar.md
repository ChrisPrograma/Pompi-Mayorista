# Publicar la app en línea

**Recomendación: Netlify.** Los dos planes gratuitos alcanzan de sobra para este proyecto, pero
Netlify gana por una razón concreta: **Netlify Drop** te deja subir la carpeta arrastrándola, sin
crear cuenta, sin instalar nada y sin repositorio. En treinta segundos tenés una dirección en línea
para mostrarle al cliente el martes.

Vercel no tiene equivalente: o conectás un repositorio de GitHub, o instalás su herramienta de
consola. Es mejor cuando el proyecto ya vive en GitHub y querés despliegue automático en cada
cambio — que es exactamente el paso 2 de abajo.

Ambos dan HTTPS gratis, que **no es opcional acá**: sin HTTPS el service worker no se registra y la
app deja de funcionar sin señal.

---

## Paso 1 — En línea ya, sin cuenta (2 minutos)

1. Descomprimí `pompi-dist.zip`. Adentro hay una carpeta `dist` con 8 archivos.
2. Entrá a **app.netlify.com/drop**.
3. Arrastrá la carpeta `dist` entera a la ventana.
4. Te da una dirección tipo `https://algo-random-123.netlify.app`. Ya está en línea.

Esa dirección funciona sin haber creado ninguna cuenta, pero **expira**. Para que quede tuya,
Netlify te ofrece "Claim this site": creás la cuenta gratis (con el mail o con GitHub) y el sitio
pasa a tu panel. Ahí mismo podés cambiarle el nombre a algo como `pompi-mayorista.netlify.app`.

Probalo desde el celular apenas esté: entrá a la dirección, tocá el menú del navegador y
**"Agregar a pantalla de inicio"**. Debería quedarte el ícono de la patita y abrirse a pantalla
completa. Después ponelo en modo avión y volvé a abrirlo: tiene que funcionar igual. Si eso pasa,
el service worker quedó bien.

---

## Paso 2 — Despliegue automático (cuando el código esté en GitHub)

1. Subí el proyecto a un repositorio de GitHub (puede ser privado).
2. En Netlify: **Add new site → Import an existing project → GitHub**, elegís el repo.
3. No hace falta configurar nada: `netlify.toml` ya define el comando (`npm run build`) y la
   carpeta (`dist`).
4. Cada vez que hagas `git push`, se despliega solo.

Si preferís Vercel, `vercel.json` ya está con la misma configuración: importás el repo y listo.

---

## Las variables del backend

Cuando tengas Supabase andando, las dos variables van cargadas en el panel del hosting, **no en el
repositorio**:

- Netlify: *Site configuration → Environment variables*
- Vercel: *Settings → Environment Variables*

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Se leen en tiempo de compilación, así que después de cargarlas hay que volver a desplegar.

Aclaración por si surge: la clave `anon` de Supabase **está pensada para ir en el cliente**, no es
un secreto. Lo que protege los datos son las políticas por fila de `004_rls.sql`. Por eso importa
que esas políticas estén bien, y por eso las dejamos activas aunque hoy haya un solo usuario.

---

## Lo que ya está resuelto en la configuración

Los archivos `_headers`, `netlify.toml` y `vercel.json` se encargan de una cosa que suele romper
las PWA y es difícil de diagnosticar después:

- `index.html` y `sw.js` se sirven **sin caché**;
- los archivos con hash en el nombre se cachean **un año**.

Si el service worker quedara cacheado, el cliente se congelaría en una versión vieja de la app y no
habría forma de actualizarlo a distancia. Alguien que no sabe "borrar el caché del navegador" se
quedaría con un sistema roto y sin saber por qué.

---

## Costo

| | Netlify gratis | Vercel gratis |
|---|---|---|
| Ancho de banda | 100 GB/mes | 100 GB/mes |
| HTTPS y dominio propio | Sí | Sí |
| Sitios | Ilimitados | Ilimitados |

La app pesa 286 kB y se cachea entera en el celular después de la primera visita. Un usuario
consume unos pocos megas por mes. Para dimensionarlo: el plan gratuito aguanta miles de clientes
como este antes de que haga falta pagar algo.
