# Bitácora del proyecto

Registro cronológico de qué se hizo, cuándo, y qué falló. Todo lo que toca plataformas externas
(Netlify, GitHub, Supabase) queda anotado acá con día y hora.

**Última actualización: miércoles 16/09/2026, 21:30.**

---

## Estado en una línea

**La app está en línea en https://pompi-mayorista.vercel.app** (hasta el 19/09/2026 estuvo en
`pompi-mayorista.netlify.app`; se migró al llegar al límite del plan gratuito). Con el CRUD completo de
productos, clientes y proveedores, el recorrido guiado de 14 pasos y la pantalla de entrar /
crear cuenta.

**El repositorio está conectado a Netlify** y cada cambio en `main` dispara un build.

**El código de la sincronización está completo en las dos direcciones**: sube (cola de salida) y
**ahora también baja** (`src/data/descarga.ts`, 16/09 16:20). En cada apertura con cuenta, la app
trae del servidor lo que tenga y lo une con lo del aparato sin pisar nada que esté esperando señal.

**Las variables de Supabase ya están cargadas en Netlify** (Chris, 16/09 ~17:10). Se hornean en el
bundle recién en el próximo build que salga bien.

> **16/09, 21:30 — limpieza general en curso.** Chris está vaciando el repositorio para volver a
> subir el proyecto entero desde cero. Mientras dure, los builds fallan y el sitio se queda
> mostrando el último deploy bueno (`main@b09f4a2`, 18:18), que todavía tiene los datos de ejemplo.
> Es el estado esperado, no una falla. Ver [la sección de la limpieza](#la-limpieza-general-del-1609)
> para qué subir y cómo.

**La app arranca vacía.** No hay datos de ejemplo por ningún camino: cero productos, cero comercios,
cero deudas. Los que hayan quedado guardados en un navegador de una versión vieja se borran solos al
abrir.

Detalle completo en [`auditoria-sincronizacion.md`](auditoria-sincronizacion.md).

Para saber dónde se hace cada cambio: [`donde-se-hacen-los-cambios.md`](donde-se-hacen-los-cambios.md).

---

## Cronología

### Lunes 14/09/2026

| Hora | Qué pasó |
|---|---|
| **09:06** | **Deploy #1 a Netlify** (Drop). Primera versión en línea con alta de comercios nuevos |
| ~12:20 | Verificado en el sitio en vivo: alta de comercio desde el paso 1 de una venta, con aviso de duplicado y vuelta a la venta con el comercio ya elegido |
| ~12:30 | Confirmado que el repo de GitHub quedó **aplanado** por tercera vez. Causa identificada (ver más abajo). Proyecto escrito en disco con su estructura real + `SUBIR-A-GITHUB.bat` |
| ~13:00 | **Programado el CRUD completo**: alta/edición/baja de productos, clientes y proveedores; campo de contacto; cambio de precio a mano. 23 tests nuevos (75 en total, todos en verde) |
| **10:18** | **Deploy #2 a Netlify** (Drop). Es el que está en línea ahora, con todo el CRUD |
| ~13:10 | **Bug encontrado y corregido: el service worker servía la versión anterior.** Detalle abajo |
| ~15:00 | **Proyecto de Supabase creado** (`pompi`, región São Paulo, plan Free) |
| ~15:20 | **Esquema aplicado**: 16 tablas, 8 vistas, 9 funciones, 16 políticas RLS, 10 triggers de inmutabilidad |
| ~15:35 | Datos iniciales cargados: negocio, lista de precios "Mayorista" y parámetros |
| ~15:45 | **Artefacto de Claude actualizado** a la versión con el CRUD (versión 3) |
| ~16:00 | **Todas las funciones verificadas sobre el sitio de Netlify** (detalle abajo) |

### Martes 15/09/2026

| Hora | Qué pasó |
|---|---|
| ~01:10 | **Detectado: el recorrido guiado no existía en la app.** Vivía solo en el boceto (`docs/boceto-presentacion.html`), que es una maqueta. Al pasar a React se había quedado afuera |
| ~01:30 | **Recorrido guiado programado dentro de la app**: 15 pasos, con los textos del boceto más los de las funciones nuevas (alta de productos, cambio de precio, fichas editables, alta de comercio en medio de una venta) |
| ~01:35 | Dos defectos propios encontrados al probarlo y corregidos: los puntos de progreso no se pintaban (choque de especificidad en el CSS) y la tarjeta se salía del marco en pantalla ancha |
| ~01:40 | Recorrido probado paso por paso en navegador real: los 15 pasos, con su resaltado, sin errores de JS. Verificado a 420 px y a 1280 px |
| ~01:45 | **Artefacto republicado** (versión 5) con el recorrido |
| ~10:00 | **Reunión con el cliente. Proyecto aprobado**, se sigue |
| ~23:00 | **Sitio renombrado a `pompi-mayorista.netlify.app`.** La dirección vieja dejó de funcionar, como avisa Netlify |
| ~23:15 | **Pantalla de ingreso programada** (mail + contraseña). Sesión guardada en el dispositivo: **sin señal la app abre igual**, verificado en modo avión |
| ~23:20 | **Bug propio encontrado antes de que causara daño:** las variables del backend se leían guardando `import.meta.env` en una variable intermedia, y Vite solo garantiza el reemplazo del texto literal `import.meta.env.VITE_X`. Habría compilado, desplegado y nunca conectado, **sin un solo error en consola**. Corregido en `src/data/entorno.ts` |
| ~23:30 | **Registro de cuenta + botonera arriba a la derecha.** Reglas de contraseña que se tildan mientras escribe |
| ~23:40 | Escrito `docs/donde-se-hacen-los-cambios.md`: qué se toca en el código, qué en Netlify y qué en Supabase |

### Miércoles 16/09/2026

| Hora | Qué pasó |
|---|---|
| ~00:30 | **Migración 006 aplicada en Supabase**: `reclamar_negocio()`. El primero que se registra se queda con el negocio; después la función rechaza a todos los demás. La decisión la toma Postgres, no el navegador, así que no se puede saltear llamando a la API directo |
| ~00:35 | Verificado en la base: función creada, 1 negocio, 0 usuarios asociados (nadie reclamó todavía) |
| ~00:40 | La app llama a esa función al entrar y al registrarse. Probados los tres casos: el primero entra, el segundo queda afuera **con el motivo explicado**, y si justo no hay señal entra igual sin quedar trabado |
| ~01:10 | **Repo conectado a Netlify y build por Vite funcionando** (`/assets/index-*.js`). Verificado que el código en línea es el último |
| ~01:15 | **Verificado que NO hay variables de entorno en Netlify**: la app en producción no está conectada a Supabase. El bundle no contiene la URL del proyecto |
| ~01:30 | **Auditoría del camino de sincronización** contra el esquema real. Cuatro defectos encontrados, tres corregidos. Detalle en [`auditoria-sincronizacion.md`](auditoria-sincronizacion.md) |
| ~01:35 | Corregidos: la sugerencia de precio nunca habría llegado al servidor; la cola seguía después de una falla y podía dar una venta por perdida; el contador ocultaba lo que falló |
| ~01:40 | **`outbox.ts` no se podía testear** (sintaxis que el runner nativo rechaza) — por eso la cola no tenía tests propios. Corregido + `src/data/__tests__/cola.test.ts`. **80 tests, 80 en verde** |
| ~15:40 | **Programada la descarga inicial** (`src/data/descarga.ts`), el cuarto defecto de la auditoría y el que cerraba la persistencia. Doce consultas a PostgREST; compras y ventas bajan con sus renglones adentro. La app baja **en cada apertura**, no solo la primera vez |
| ~15:55 | **Cinco reglas de unión** para que bajar no borre trabajo hecho: lo que está en la cola no se pisa; bajar no borra; un precio ya cerrado no se reabre; una sugerencia ya resuelta no vuelve; una sola sugerencia pendiente por producto |
| ~16:00 | **Bug de fechas encontrado al escribirlo:** Postgres devuelve `+00:00` y el aparato genera `Z`. La app ordena fechas comparando textos, y mezclar las dos formas invierte el orden dentro del mismo segundo. Se habría visto como **una ganancia mal calculada, sin ningún error**. Se normaliza todo al bajar |
| ~16:05 | **Paginación de a 1000 filas.** PostgREST puede venir con ese tope; sin paginar, pasadas las mil filas de stock la app bajaría una parte **sin avisar**. Test con 2500 movimientos contra un servidor de mentira que respeta el encabezado `Range` |
| ~16:10 | **Los datos de ejemplo ya no se mezclan con los reales.** Quedan marcados como semilla y la primera descarga con cuenta los tira enteros. Sin esto, Pet Shop Huellitas quedaba para siempre en su lista de comercios: nunca subió a Supabase, así que no había forma de sacarlo desde el otro lado |
| ~16:15 | Agregado en *Mi cuenta* el botón **"Traer los datos del servidor"**, para cuando cargó algo desde otro aparato y lo quiere ver acá sin cerrar la app |
| ~16:20 | **102 tests, 102 en verde** (22 nuevos). Typecheck y build limpios: 341 kB |
| ~17:10 | **Variables de Supabase cargadas en Netlify** (Chris) |
| ~17:30 | **Datos de ejemplo sacados de la app, por todos los caminos.** Antes sembraban cuando no había servidor; ahora arranca vacía siempre. La semilla queda solo como escenario de tests. Los datos viejos guardados en el navegador se reconocen por su `negocioId` (`negocio-demo`) y se borran al abrir, sin depender de que él limpie nada a mano |
| ~17:45 | **Pantallas vacías, una por una.** Al sacar la semilla, el caso "cero productos, cero comercios" pasó de no existir nunca a ser lo PRIMERO que se ve. Tres pantallas mentían y dos eran callejones sin salida — detalle en la tabla de abajo |
| ~18:00 | **109 tests, 109 en verde.** Verificado además con Chromium en 420 px: las cinco pantallas renderizan, ningún `NaN`, cero errores de consola. Build 339 kB |
| ~18:40 | **Revisado el sitio en vivo a pedido de Chris**, que seguía viendo datos de ejemplo. Causa: **nada de lo del 16/09 estaba desplegado**. El bundle servido (`index-D8D8SXq7.js`) no contiene `descarga.ts` ni la app vacía, y sí contiene la semilla. Sí tiene la URL de Supabase, o sea que Netlify recompiló después de cargar las variables, pero **desde el commit viejo** |
| ~18:45 | **Verificado que Supabase está limpio**: 1 negocio, 1 lista de precios, 1 usuario asociado y **cero filas** de productos, clientes, proveedores, ventas, compras, movimientos, pagos y precios. Los datos de ejemplo nunca salieron del navegador, como estaba previsto — y de paso queda confirmado que `reclamar_negocio()` funcionó |
| ~19:10 | **Cerrado un agujero de la detección de datos de ejemplo.** Ver abajo |
| ~19:30 | **112 tests, 112 en verde.** Probada además la migración de verdad en Chromium: se planta la semilla vieja en IndexedDB, se abre la app nueva y queda en 0 productos, 0 comercios, con negocio nuevo en uuid |
| ~21:00 | **Descubierto que `Pictures\pompi-mayorista` NUNCA fue un repositorio git** (no tiene carpeta `.git`). O sea que todo lo entregado durante el día estaba en una carpeta que no alimentaba el despliegue. Verificado igual archivo por archivo: la carpeta está completa y al día |
| **18:17-18:19** | **El repositorio se vació.** Commits *"Delete db/migrations directory"*, *"Delete docs directory"* y *"Delete scripts directory"*, y después **seis builds fallados seguidos** (exit code 2). Es una limpieza general decidida por Chris, no un accidente |
| ~21:15 | Confirmado en la API de GitHub: `main` quedó con **8 archivos de raíz y sin `src/`**. Sin `src/`, `vite build` no puede compilar. El sitio quedó congelado en `main@b09f4a2`, el último deploy que salió bien (18:18) — y por eso seguía mostrando los datos de ejemplo |
| ~21:30 | **Armado el paquete limpio** para volver a subir el proyecto entero a mano. 72 archivos, **sin `dist`, sin `node_modules`, sin `vercel.json` y sin los `.bat`**. Verificado como proyecto independiente antes de comprimir: typecheck limpio, 301 imports resueltos, **112 tests en verde** y build OK (339 kB) |

> Las dos horas de Netlify salen del panel de deploys; las demás son aproximadas al cuarto de hora.

### Lo que apareció al sacar los datos de ejemplo

Hasta el 16/09 la app se sembraba sola, así que **ningún camino del código se había ejecutado nunca
con cero productos y cero comercios**. Sacar la semilla convirtió un caso inexistente en el caso
normal: es lo primero que ve alguien que recién creó su cuenta. Aparecieron cinco problemas, y dos
de ellos son de los que hacen que alguien cierre la app y no vuelva.

| Pantalla | Qué pasaba sin datos | Cómo quedó |
|---|---|---|
| **Me llegó mercadería**, paso 1 | Pantalla **en blanco y sin salida**: ni un botón para agregar el proveedor, ni una explicación | Cartel con el motivo y botón que lleva a proveedores |
| **Me llegó mercadería**, paso 2 | Lista vacía también cuando **sí hay productos** pero ninguno tiene proveedor asignado — el caso más confuso de todos | Se distinguen los dos motivos y se explica cuál es |
| **Hoy** y **El auto** | *"El auto está cargado. Tenés todo lo que necesitás"* con cero productos. Literalmente falso, y con cara de buena noticia | Primero se pregunta si hay algo, después si falta algo |
| **Me deben** | *"Cobraste todo. Rarísimo y hermoso"* con cero comercios: un elogio por no haber vendido | Se distingue "no tenés comercios" de "están todos al día" |
| **Hoy**, pantalla entera | *"Tu día en 3 pasos"* le pedía vender antes de tener qué vender | Primer día: tres pasos reales, en el orden que el modelo necesita (proveedor → producto → comercio) |

El orden de esos tres pasos no es decorativo: un producto puede llevar su carga inicial de stock, y
para eso el proveedor tiene que existir antes.

### El agujero de la detección, y por qué mirar el `negocioId` no alcanzaba

La primera versión reconocía los datos de ejemplo por su `negocioId` (`negocio-demo`). Eso funciona
mientras estén solos, y **deja de funcionar en cuanto se mezclan con datos reales**: al unir lo que
baja del servidor con lo del aparato, el negocio pasa a ser el del servidor —un uuid— mientras las
filas de ejemplo siguen ahí abajo. La marca de la que dependía la detección desaparece, y los
comercios inventados quedan adentro para siempre, indistinguibles de los reales.

**Cómo quedó:** la prueba es el **formato del id**, no el negocio ni el nombre. Los datos de ejemplo
usan ids escritos a mano (`p1`, `c3`, `v2`, `s-0014`); los reales son uuid. Y no es una convención
que se pueda romper: las columnas `id` de Postgres son de tipo `uuid` y **no pueden** contener `p1`.
Por eso la prueba no puede confundir un dato real con uno de ejemplo ni al revés, aunque estén
mezclados en la misma lista. Está en `src/app/limpieza.ts`, un archivo aparte de `semilla.ts` para
que la app nunca importe los datos de ejemplo.

Probado de las dos formas: con tests (semilla entera, negocio real intacto, y **mezclados**), y
abriendo la app de verdad en Chromium sobre un IndexedDB con la semilla vieja plantada adentro.

---

## La limpieza general del 16/09

**Qué pasó.** Durante todo el día se corrigió el código —la descarga desde Supabase, la app vacía,
las pantallas sin datos— y nada de eso llegaba al sitio. La causa resultó ser de entrega, no de
programación, y fueron dos cosas encadenadas:

1. **`C:\Users\Chris\Pictures\pompi-mayorista` nunca fue un repositorio git.** No tiene carpeta
   `.git`. Es una copia del proyecto, completa y al día, pero desconectada de GitHub. Todo lo que se
   entregó ahí durante el día quedó en una carpeta que no alimenta el despliegue.
2. **El repositorio quedó sin `src/`.** Entre las 18:17 y las 18:19 se borraron los directorios
   `db/migrations`, `docs` y `scripts`, y los seis builds siguientes fallaron con exit code 2. Sin
   `src/` no hay nada que compilar.

**La decisión.** En vez de reparar el repo pieza por pieza, Chris lo vacía entero y vuelve a subir
el proyecto completo. Es más corto y deja el repo en un estado conocido.

**Qué se sube.** El paquete `pompi-mayorista-limpio.zip` (en `Pictures\Claude outputs\`): 72
archivos, sin `dist`, sin `node_modules`, sin `vercel.json` —que era de Vercel y quedó decidido usar
solo GitHub + Netlify— y sin los `.bat`, que son ayudas locales y no van al repo. Verificado como
proyecto independiente antes de comprimir: typecheck limpio, 301 imports resueltos, **112 tests en
verde** y build OK.

### Las dos trampas de subir por la web

Quedan escritas acá porque una de las dos ya costó tres repositorios aplanados.

**1. Arrastrar la CARPETA, nunca el botón "choose your files".** Con el botón, el navegador le manda
a GitHub solo los nombres de archivo, sin la ruta: `App.tsx` en vez de `src/ui/App.tsx`. Todo cae en
la raíz y el repo queda aplanado. Arrastrando la carpeta, el navegador sí manda las rutas. Es la
misma página y el mismo repo; lo único que cambia es el gesto.

**2. La web no respeta `.gitignore`.** Arrastrando la carpeta de trabajo tal cual se suben también
los archivos compilados de `dist/`, que no van al repo porque Netlify compila solo. Por eso el
paquete limpio ya viene sin esa carpeta.

**3. GitHub no descomprime los zip.** Subir el `.zip` deja un archivo `.zip` adentro del repo y nada
más. Hay que descomprimirlo primero y arrastrar la carpeta que sale.

### Cómo verificar que salió bien

No alcanza con que el deploy diga "Published". Lo que hay que mirar, en este orden:

| Qué | Dónde | Qué tiene que dar |
|---|---|---|
| El build | Netlify → Deploys | Verde, y que el commit sea el de la subida nueva |
| El código nuevo llegó | El `.js` que sirve el sitio | Tiene que contener `sugerencias_precio` (la descarga) y `Tu negocio, en blanco` (la app vacía) |
| Supabase conectado | El mismo `.js` | Tiene que contener la URL `…supabase.co` |
| La app | Abrirla | Pide entrar antes de mostrar nada. Si entra directo y hay un punto naranja arriba a la derecha, las variables no se hornearon |

**Nota para el futuro.** Este ciclo —vaciar el repo, descomprimir, arrastrar— funciona pero hay que
repetirlo entero por cada cambio. Con la carpeta convertida en repositorio git de verdad, el mismo
cambio es un `git push` de diez segundos y `.gitignore` se respeta solo. Quedó escrito acá para
cuando convenga darlo vuelta; hoy se eligió el camino manual a propósito, para desbloquear al
cliente rápido.

**Por qué importa más que un detalle de diseño:** abandonó dos o tres sistemas antes porque
*"siempre me tranco con algo"*. El momento de trancarse es exactamente este — una app en blanco, el
primer día, sin saber por dónde empezar.

---

## Verificación del 14/09, 16:00 — sobre el sitio en vivo

No sobre una copia local: sobre `sunny-treacle-dc2d79.netlify.app`.

| Función | Resultado |
|---|---|
| Alta de producto con stock inicial | ✅ "Pipeta antipulgas", $7.400, 18 unidades. Margen calculado bien: $3.300 limpios (45%) |
| Cambio de precio a mano | ✅ $7.400 → $8.300, avisó "Sube 12%" antes de guardar |
| El precio viejo se conserva | ✅ "Antes lo vendías a $7.400. Ese precio queda guardado con la fecha de hoy" |
| Ficha de proveedor | ✅ Muestra deuda y contacto |
| Editar proveedor | ✅ Cargado el teléfono; **el rubro y la deuda quedaron intactos** |
| Alta de comercio desde una venta | ✅ Verificado a las 12:20 |
| Aviso de nombre duplicado | ✅ Verificado a las 12:20 |
| Persistencia al recargar | ✅ Verificado |

Antes de esto, el mismo recorrido se había probado localmente de punta a punta con un navegador
real, incluyendo editar un cliente (sin que se borraran zona ni día de visita) y desactivar un
producto.

---

## Los tres errores que aparecieron, y por qué

### 1. El service worker dejaba la app una versión atrás — 14/09 ~13:10

**El más grave de los tres, y el más difícil de ver.** El deploy salía bien, los archivos nuevos
estaban en el servidor, y la app seguía mostrando lo viejo.

`sw.js` respondía con el caché y refrescaba en segundo plano. Para el JS y el CSS está perfecto
—llevan un hash en el nombre, nunca quedan viejos—, pero `index.html` es el único archivo cuyo
nombre no cambia nunca. Resultado: **cada actualización se veía recién en la segunda carga**.

Por qué importa: el cliente instala la app en el celular, se publica un arreglo, y él sigue viendo
la versión anterior sin enterarse y sin que se pueda hacer nada a distancia.

**Corregido:** el documento pasa a "primero la red, caché de respaldo". Pesa 5 kB, no se nota con
señal, y sin señal responde el caché igual que antes. Además la versión del caché quedó atada al
hash del build, así la copia vieja se borra sola.

**Probado de las dos formas**: con el service worker viejo ya instalado, se publicó una versión
nueva y **una sola recarga alcanzó**; después, en modo avión, la app siguió abriendo.

### 2. Netlify compilando desde un ZIP — `Dynamic require of "node:fs" is not supported`

`vite.config.ts` hacía `require('node:fs')` **adentro** del hook `generateBundle`. Vite compila su
propio archivo de configuración a ESM, donde `require` no existe, así que el build moría en el
último paso con 48 módulos ya transformados. **Corregido**: el import pasó arriba del archivo.

Ese intento dejó un dato útil: `tsc --noEmit` pasó sin errores en Netlify con los `@types/react`
de verdad, lo que confirma que los tipos mínimos escritos a mano no estaban tapando errores.

### 3. Vercel — "Cannot find package 'vite'"

La causa real no era Vercel: era el repositorio aplanado, así que el `package.json` que leía no
era el del proyecto. **Vercel quedó descartado del proyecto** (14/09): se borró `vercel.json` y se
sacaron las menciones de los cuatro documentos donde estaba. Se usan solo Netlify y GitHub, más
Supabase para los datos.

---

## El repositorio de GitHub sigue aplanado

`https://github.com/ChrisPrograma/Pompi-Mayorista` tiene los archivos **sueltos en la raíz**. No
existen `src/`, `db/`, `docs/` ni `scripts/`. **No afecta al sitio en línea.**

**No es un error de nadie, es cómo funciona el navegador:**

| Cómo se suben los archivos | ¿Conserva las carpetas? |
|---|---|
| Botón "choose your files" | **No.** El navegador manda solo el nombre del archivo, nunca la ruta |
| Arrastrar archivos sueltos | **No** |
| **Arrastrar la carpeta entera** | **Sí** |
| `git push` | **Sí** |

Por eso volvió a pasar cada intento. No hay forma de arreglarlo eligiendo archivos.

**La solución está preparada** en `C:\Users\Chris\Pictures\pompi-mayorista\`: el proyecto completo
con su estructura real y el archivo **`SUBIR-A-GITHUB.bat`**. Doble clic, verifica que Git esté
instalado, explica qué va a hacer, espera confirmación, y hace `git push --force`. Eso reemplaza
el repositorio entero y **los archivos sueltos desaparecen en una sola operación**. Los 4 commits
viejos que se pierden son exactamente los intentos aplanados.

---

## Supabase — qué quedó hecho y qué falta

### Hecho (14/09, ~15:20)

Proyecto `pompi`, organización ChrisProg, plan Free, región South America (São Paulo).
Se marcó **Enable automatic RLS** para que cualquier tabla futura nazca cerrada.

| | Cantidad |
|---|---|
| Tablas | 16 |
| Vistas | 8 |
| Funciones | 9 |
| Políticas RLS | 16 |
| Triggers de inmutabilidad | 10 |

Ya están cargados el negocio, la lista de precios "Mayorista" y los parámetros.

### Lo que falta, y es importante entenderlo

**La app todavía no puede usar esta base.** No es un problema de configuración: **falta la pantalla
de ingreso**. Toda la seguridad se apoya en RLS, que decide qué ve cada usuario según quién esté
logueado. Sin login, el servidor no sabe quién pregunta y no devuelve nada — que es exactamente lo
que tiene que pasar.

Entonces quedan dos cosas, en este orden:

1. **Crear el usuario** en Supabase → Authentication → Add user (la contraseña la define Chris).
2. **Programar la pantalla de ingreso** y que la cola de sincronización mande el token de sesión
   además de la clave `anon`. Es trabajo real, no un parámetro.

Después de eso: cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Netlify
(*Site configuration → Environment variables*) y volver a desplegar, porque se leen al compilar.

Aclaración por si surge en la reunión: la clave `anon` **está pensada para ir en el navegador**, no
es un secreto — de hecho viaja dentro del JS que descarga cualquiera que entre al sitio. Lo que
protege los datos son las políticas RLS.

**Para la presentación de mañana no hace falta nada de esto.** La app guarda en el dispositivo y
funciona completa; el backend es el paso siguiente.

---

## Cómo publicar una versión nueva

Netlify Drop no compila nada: recibe la carpeta `dist/` ya construida y la sirve. No necesita
`npm install`, ni `package.json`, ni que el repositorio esté ordenado.

1. Abrir https://app.netlify.com/projects/sunny-treacle-dc2d79/deploys
2. **Arrastrar la carpeta `dist`** (está en `C:\Users\Chris\Pictures\pompi-mayorista\dist`) sobre
   el recuadro de "Production deploys".
3. En unos segundos el sitio queda actualizado, misma dirección.

El arrastre lo tiene que hacer una persona: el navegador no permite que un archivo se cargue en un
formulario sin que alguien lo elija, y es una protección que está bien que exista.

> **Pendiente antes de la presentación:** lo que está en línea es el deploy de las 10:18, que **no
> tiene el recorrido guiado ni la corrección del service worker**. Las dos cosas están en el `dist`
> del disco, listas. Hay que arrastrarlo. Esa primera vez hay que recargar dos veces — es
> justamente el problema del service worker, y es la última vez que pasa.
>
> El artefacto de Claude **sí** está actualizado: si la demo se hace desde ahí, no hace falta nada.

---

## Sitios de Netlify

Queda uno solo. Verificado el 14/09 en la cuenta `chrisprograma1`.

| Sitio | Estado |
|---|---|
| `sunny-treacle-dc2d79` | **El único y el bueno** |
| `splendid-sunburst-77befd` | Eliminado |
| `harmonious-scone-4f952a` | Eliminado |

Queda una mejora chica pero visible: **renombrar el subdominio**.
`sunny-treacle-dc2d79.netlify.app` es un nombre generado al azar y se ve mal si el cliente lo tiene
que tipear o instalar en el celular. Se cambia en *Project configuration → Site details → Change
site name*: quedaría `pompi-mayorista.netlify.app`. **La URL vieja deja de funcionar en el momento
del cambio**, así que conviene hacerlo antes de pasarle el link al cliente, no después.

---

## El recorrido guiado

15 pasos, arrancan con el botón **"Ver cómo funciona, paso a paso"** arriba de la pantalla "Hoy".
Cada paso navega solo a la pantalla que corresponde y resalta el elemento del que habla, con una
tarjeta abajo que no tapa lo que se está mostrando. Se puede salir en cualquier momento.

El contenido vive en `src/ui/recorrido.ts` y es data, no código: **agregar o cambiar un paso es
editar una línea**. Si el cliente pide cambiar cómo se explica algo, se toca ahí y listo.

| # | Pantalla | De qué habla |
|---|---|---|
| 1-4 | Hoy | El resumen del día, la alerta de deuda vieja, los 3 pasos, el botón de vender |
| 5-7 | Vender | A quién le vende, el alta de un comercio nuevo en el momento, qué se lleva |
| 8 | Me deben | La cobranza ordenada por antigüedad |
| 9 | El auto | Qué cargar antes de salir |
| 10 | Me llegó mercadería | La entrada de stock y la deuda con el proveedor |
| 11-12 | Mis productos | El alta de productos y la ganancia por unidad + cambio de precio |
| 13 | Mis clientes | La ficha editable y el archivado |
| 14 | Números | La ganancia real |
| 15 | — | Que funciona sin señal |

**Ojo con el origen:** el recorrido existía solo en `docs/boceto-presentacion.html`, que es la
maqueta de la primera reunión. Esa maqueta **pisa stock, costo y precio** (justo lo que REGLA 0
prohíbe) y no tiene las funciones nuevas. **No usarla para la demo**: quedó solo como referencia
de diseño.

---

## El artefacto de Claude

`https://claude.ai/code/artifact/a841fc45-ed5a-4524-a3be-791de818f2e8` — **versión 5, actualizada
el 15/09 ~01:45**, con el CRUD completo y el recorrido guiado. Es la misma app que está en Netlify, para
el recorrido con el cliente. Es privado hasta que se comparta desde el menú de la página.

Para actualizarlo en el futuro: se republica con los archivos del `dist` nuevo; la dirección no
cambia.
