# Auditoría de la sincronización con Supabase

**16/09/2026, 01:40.** Revisión pedida para verificar que login, productos, clientes,
proveedores y ventas sincronicen contra la base remota.

---

## Lo primero, y lo que cambia todo lo demás

**La app en producción no está conectada a Supabase.** No parcialmente: nada.

Verificado sobre `pompi-mayorista.netlify.app`, no sobre una copia local:

| Qué se miró | Resultado |
|---|---|
| Variables de entorno en Netlify | **"No environment variables set for this project"** |
| ¿El bundle contiene la URL de Supabase? | **No** (`/supabase\.co/` no aparece en los 320 kB del JS servido) |
| ¿La app pide ingreso? | No — entra directo, con el punto naranja de "sin cuenta" |
| ¿El repo está conectado a Netlify? | **Sí.** El build salió de Vite (`/assets/index-C5ZLQHAl.js`), y el código es el último |
| ¿El service worker se sirve bien? | Sí, con su versión reemplazada |

Así que **no había nada que sincronizar todavía**. Lo que sí se podía hacer, y se hizo, es
auditar el camino de sincronización contra el esquema real para que funcione al primer intento
cuando se carguen las variables.

De esa auditoría salieron **cuatro defectos**. **Los cuatro están corregidos** (el primero, que era
el más grave, el 16/09 a las 16:20).

---

## 1. Los datos suben, pero nunca bajan — CORREGIDO el 16/09, 16:20

**Era el más grave, y es exactamente lo que se pidió verificar.**

`servidor.ts` tiene un solo verbo: `POST`. No existe ninguna lectura del servidor. Y la carga
inicial de la app lo dice con todas las letras:

```ts
// Primera vez: se siembra con datos de ejemplo para que nunca abra vacía.
// En producción, acá va la descarga inicial desde el servidor.
e = construirSemilla(new Date().toISOString());
```

Ese comentario describe un agujero que todavía está abierto.

**Qué pasaría hoy con las variables cargadas:** él carga sus productos y sus comercios en el
celular, todo sube bien a Supabase. Después entra desde la computadora, o cambia de teléfono, o
el navegador limpia los datos del sitio. La app no encuentra nada local, **y se siembra con los
datos de ejemplo** — Pet Shop Huellitas, Forrajería El Ceibo. Sus datos reales quedan en
Supabase, intactos, invisibles.

O sea: la persistencia está construida a la mitad. Se escribe, no se lee.

**Cómo quedó:** `src/data/descarga.ts`. Doce consultas a PostgREST, y la app baja **en cada
apertura**, no solo la primera vez. Eso es lo que hace que cambiar de teléfono, entrar desde la
computadora o que el navegador limpie los datos del sitio no le borre nada.

Lo que costó más que las consultas fue **unir lo que baja con lo que ya hay en el aparato**, porque
las formas ingenuas de hacerlo le borran trabajo hecho. Las cinco reglas, y el caso real de cada
una:

| Regla | El caso que evita |
|---|---|
| Lo que está en la cola de salida **no se pisa** | Corrigió el nombre de un comercio sin señal. El servidor manda el viejo. Sin la regla, la corrección se le borra de la pantalla |
| Bajar **no borra** | La venta de la vereda que todavía no subió. Borrarla porque "el servidor no la tiene" es perder plata |
| Un precio que el aparato **ya cerró** no se vuelve a abrir | Cambió un precio sin señal. El servidor sigue mandando el viejo abierto. Sin la regla quedan **dos precios vigentes** del mismo producto y la app no sabe cuál cobrar |
| Una sugerencia **ya resuelta** no vuelve a aparecer pendiente | Aceptó el aumento sin señal. Le volvería a preguntar lo mismo |
| Una sola sugerencia pendiente por producto y lista | Las sugerencias nacen en los dos lados con ids distintos (el aparato al entrar mercadería, `registrar_compra` con `gen_random_uuid()`). Sin la regla ve **dos veces el mismo cartel** |

Tres cosas más que salieron al escribirlo, y que no se habrían visto probando a mano:

1. **Las fechas del servidor vienen en otro formato.** Postgres devuelve
   `2026-09-16T01:40:00+00:00`; el aparato genera `2026-09-16T01:40:00.000Z`. Toda la app ordena
   fechas comparando los textos, y mezclar las dos formas invierte el orden de dos filas del mismo
   segundo — `+` viene antes que `.`. Dónde se nota: `costoDe` toma el costo de la **última**
   compra. Un orden mal ahí es **una ganancia mal calculada, en silencio**. Se normaliza todo al
   bajar.
2. **PostgREST puede cortar de a 1000 filas.** Sin paginar, el día que `movimientos_stock` pase las
   mil la app bajaría las primeras mil y **no diría nada**: stock mal, cero errores a la vista. Se
   pide de a páginas y hay un test con 2500 movimientos que lo prueba.
3. **Los datos de ejemplo no pueden mezclarse con los reales.** Si él usó la app sin cuenta, tiene
   Pet Shop Huellitas y Forrajería El Ceibo guardados. Al entrar por primera vez con cuenta, esos
   comercios inventados quedarían adentro de su lista real — y como nunca subieron a Supabase, no
   habría forma de sacarlos desde el otro lado. Ahora la semilla queda marcada y la primera
   descarga real la tira entera.

**Tests:** 22 nuevos, incluido un servidor de mentira que respeta el encabezado `Range` para probar
la paginación de verdad. **102 tests, 102 en verde.**

---

## 2. Aceptar una sugerencia de precio nunca habría llegado al servidor — CORREGIDO

La app mandaba `aplicar_sugerencia` con el id de la sugerencia. Pero las sugerencias se generan
**en el dispositivo**, con un id propio que del lado del servidor no existe: `registrar_compra`
crea las suyas con `gen_random_uuid()`, otros ids.

La función habría respondido "la sugerencia no existe" → 4xx → **error permanente**. El precio
nuevo se veía aplicado en la pantalla y no estaba en la base. Silencioso.

**Corregido:** se manda `cambiar_precio`, que es lo que importa y da la misma garantía
transaccional (cierra la fila anterior, abre la nueva). La sugerencia es contabilidad interna de
la pantalla.

---

## 3. La cola seguía después de una falla, y eso podía perder una venta — CORREGIDO

La cola recorría todas las operaciones pendientes y **continuaba aunque una fallara**.

El caso concreto: él carga un comercio nuevo y le vende en el acto. La cola tiene
`[guardar_cliente, registrar_venta]`. Si `guardar_cliente` falla por un corte de red, la venta se
intentaba igual, llegaba al servidor antes que el comercio y rebotaba por clave foránea. Ese
rebote es un 4xx, o sea **permanente**: la venta quedaba marcada como imposible de subir cuando
en realidad solo había llegado temprano.

**Corregido:** la cola corta en la primera falla. Las de atrás esperan su turno. Es preferible
una cola frenada y visible a un libro mayor con agujeros.

---

## 4. Una operación fallada desaparecía del contador — CORREGIDO

El contador de "X operaciones sin subir" contaba solo `pendiente` y `enviando`. Una operación en
estado `error` **no se contaba**.

El comentario del código prometía lo contrario: *"nunca se descarta en silencio una operación que
él dio por hecha"*. Pero el cartel decía "0 sin subir" con una venta rechazada adentro de la cola.

**Corregido:** el contador incluye `error`. Lo que falló para siempre es justamente lo que más
necesita ver.

---

## 5. Un archivo clave no se podía testear — CORREGIDO

`outbox.ts` usaba propiedades de parámetro (`constructor(private almacen: ...)`), una de las pocas
formas de TypeScript que no se pueden borrar con un quitado simple de tipos. El runner nativo de
Node la rechaza.

Consecuencia: **la cola de salida, la pieza que no puede perder una venta, no tenía un solo test
propio.** Los 75 tests anteriores cubrían dominio y pantallas; la cola no.

**Corregido:** cuatro líneas más largas en el constructor, y `src/data/__tests__/cola.test.ts`
con los casos de los puntos 3 y 4. **80 tests, 80 en verde.**

---

## Lo que sí quedó verificado como correcto

Se comparó cada operación que la app encola contra la firma de su función SQL y contra las
columnas de las tablas:

| Operación | Contra | Estado |
|---|---|---|
| `registrar_venta` | `003_funciones.sql` | ✅ coincide |
| `registrar_compra` | `003_funciones.sql` | ✅ coincide |
| `trasladar_stock` | `003_funciones.sql` | ✅ coincide |
| `cambiar_precio` | `003_funciones.sql` | ✅ coincide |
| `guardar_cliente` | columnas de `clientes` | ✅ coincide (incluye `contacto`) |
| `guardar_producto` | columnas de `productos` | ✅ coincide (incluye `sugerido_en_vehiculo`) |
| `guardar_proveedor` | columnas de `proveedores` | ✅ coincide |
| `registrar_pago_cliente` | columnas de `pagos_cliente` | ✅ coincide |
| `reclamar_negocio` | `006_reclamar_negocio.sql` | ✅ aplicada y verificada en la base |

El encabezado `Authorization` manda el token de la sesión y no la clave `anon`, que es lo que hace
que RLS pueda saber quién pregunta.

---

## Para que esto se pueda dar por verificado de verdad

Lo de arriba es auditoría de código y prueba con simulaciones. **Todavía no hubo una sola
escritura real contra Supabase desde la app**, y eso no se puede saltear: los errores que quedan
son justamente los que solo aparecen contra un servidor de verdad.

El orden, con quién hace cada paso:

| # | Paso | Quién | Estado |
|---|---|---|---|
| 1 | **Cargar las dos variables en Netlify** y volver a desplegar | **Chris** — son credenciales, no las manejo yo | Pendiente |
| 2 | **Registrar la primera cuenta** desde la app. Reclama el negocio (migración 006) | **Chris** — la contraseña la define él | Pendiente |
| 3 | **Cargar un producto y hacer una venta**, y mirar las tablas en Supabase | Los dos: él hace la venta, yo miro las filas | Bloqueado por 1 y 2 |
| 4 | **Programar la descarga inicial**, que es lo que cierra la persistencia | Yo | ✅ **Hecho el 16/09, 16:20** |

El 4 se hizo primero porque es el único de los cuatro que no necesita credenciales ni una persona
frente a la pantalla. Así, cuando las variables lleguen, el camino completo —subir y bajar— ya está
escrito y probado, y el paso 3 verifica las dos direcciones de una sola vez en vez de una.

**Cómo se verifica el paso 3, concretamente.** Después de cargar el producto y hacer la venta, en
Supabase → Table editor tienen que estar: la fila en `productos`, una en `precios_venta` con
`vigente_hasta` en null, una en `ventas` con su `venta_items`, y dos en `movimientos_stock` (la
entrada de la carga inicial y la salida de la venta). Después —y esto es lo que el punto 4 hace
posible— **abrir la app en el celular con la misma cuenta**: tiene que aparecer todo sin haber
cargado nada ahí.
