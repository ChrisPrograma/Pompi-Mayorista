# Bitácora del proyecto

Registro cronológico de qué se hizo, cuándo, y qué falló. Todo lo que toca plataformas externas
(Netlify, GitHub, Supabase) queda anotado acá con día y hora.

**Última actualización: miércoles 16/09/2026, 00:45.**

---

## Estado en una línea

**La app está en línea en https://pompi-mayorista.netlify.app**, con el CRUD completo de
productos, clientes y proveedores, el recorrido guiado de 15 pasos y la pantalla de entrar /
crear cuenta.

**Lo que falta para que el cliente empiece a cargar datos de verdad: las dos variables de Supabase
en Netlify.** Hasta que estén, la app corre en "modo sin cuenta" y guarda todo en el dispositivo —
funciona completa, pero los datos no se comparten entre teléfonos. El botón de la esquina superior
derecha lo dice con todas las letras en vez de esconderlo.

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

> Las dos horas de Netlify salen del panel de deploys; las demás son aproximadas al cuarto de hora.

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
