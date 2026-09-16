# Lo que sigue

Estado al **martes 15/09/2026, 01:45**, antes de la reunión con el cliente.

Ordenado por lo que bloquea a lo que no. Cada tarea dice **quién** la puede hacer, porque varias
no las puedo hacer yo.

---

## Antes de la reunión — 2 minutos

| # | Qué | Quién |
|---|---|---|
| 1 | **Arrastrar `dist` a Netlify.** Lo que está en línea es de ayer 10:18: no tiene el recorrido guiado ni el arreglo del service worker. La carpeta está en `Pictures\pompi-mayorista\dist` | Chris |

Si la demo se hace desde el artefacto de Claude, esto no bloquea: el artefacto ya está al día.
Igual conviene, para que las dos puntas muestren lo mismo.

> Al arrastrarlo, la primera carga hay que recargarla dos veces. Es el problema del service worker
> que se corrige justamente ahí, y es la última vez que pasa.

---

## Durante la reunión — las preguntas abiertas

Están desarrolladas en [`preguntas-cliente-martes.md`](preguntas-cliente-martes.md). Las tres que
cambian código:

| # | Pregunta | Por qué importa |
|---|---|---|
| 2 | **¿Compra por bulto y vende por unidad?** | Es la única que toca el modelo de datos. Si la respuesta es sí, hace falta un factor de conversión en `productos` y cambia el alta |
| 1 | **¿Le cobra distinto a algún cliente?** | Las listas de precios ya están en la base. Si dice que sí, es configuración; si dice que no, no se toca nada |
| 11 | **¿Trabaja con pedidos pendientes?** | Si anota cosas para llevar la próxima vez, hace falta una pantalla nueva |

Además conviene confirmar: el **nombre exacto del negocio** (hoy está cargado como "Pompi
Mascotas") y a partir de **cuántos días** considera que una deuda está vieja (hoy: 15 y 30).

---

## Después de la reunión, por orden

### 1. Lo que pida el cliente
Va primero. Todo lo de abajo puede esperar a que se sepa qué quiere cambiar.

### 2. Conectar la base de datos de verdad

La base está creada y con el esquema aplicado, pero **la app no se conecta todavía**. No es un
parámetro que falte: **falta la pantalla de ingreso**. Toda la seguridad se apoya en RLS, que
decide qué ve cada usuario según quién esté logueado; sin login el servidor no devuelve nada.

| Paso | Quién |
|---|---|
| Crear el usuario en Supabase → Authentication → Add user | Chris (define la contraseña) |
| Correr `005_datos_iniciales.sql` con ese id de usuario | Yo |
| Programar la pantalla de ingreso y que la cola mande el token de sesión | Yo |
| Cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Netlify y redesplegar | Chris |
| Probar que una venta hecha en la PC aparezca en el celular | Yo |

Recién cuando esto esté, la app deja de ser "una app por dispositivo".

### 3. Funciones que todavía faltan

| Falta | Comentario |
|---|---|
| Registrar pagos a proveedores | El saldo se ve, el pago no se carga. Es la más pedida de esta lista |
| Ajuste de stock por recuento físico | **Imprescindible el día que arranque con datos reales**: el stock inicial nunca cuadra con lo que hay en la casa |
| Devoluciones y roturas | El modelo ya las contempla (un movimiento en sentido contrario), falta la pantalla |
| Venta por bulto | Depende de la pregunta 2 |
| Pedidos pendientes | Depende de la pregunta 11 |

### 4. Arreglar el repositorio de GitHub

Sigue aplanado y **no afecta al sitio**. La solución está lista: doble clic en
`SUBIR-A-GITHUB.bat`, dentro de `Pictures\pompi-mayorista`. Si tira algún error, me lo pasás.

Recién con el repo ordenado tiene sentido conectarlo a Netlify para que cada `git push` publique
solo. Hasta entonces, arrastrar `dist` alcanza.

### 5. Renombrar el sitio

`sunny-treacle-dc2d79.netlify.app` es un nombre al azar y se ve mal si el cliente lo tiene que
tipear o instalar en el celular. Se cambia en *Project configuration → Site details → Change site
name*: quedaría `pompi-mayorista.netlify.app`.

**La URL vieja deja de funcionar en el acto**, así que hay que hacerlo **antes** de pasarle el link
al cliente, no después. Por eso está último: conviene saber primero si el proyecto sigue.

### 6. Reemplazar los datos de ejemplo

Hoy la app abre con productos y comercios inventados del rubro. Antes de que la use de verdad hay
que cargar los reales, después de un recuento físico. Con el alta de productos y de clientes ya
programada, esto lo puede hacer él mismo — o se importa de una planilla si la tiene.

---

## Lo que NO hay que hacer

- **No usar `docs/boceto-presentacion.html` como base para programar.** Es la maqueta de la primera
  reunión: pisa stock, costo y precio, que es exactamente lo que REGLA 0 prohíbe. Queda solo como
  referencia de diseño.
- **No volver a subir archivos a GitHub con "choose your files".** Aplana el repositorio siempre;
  no es un error que se pueda evitar teniendo cuidado.
- **No guardar stock, costo ni precio como columna.** Si en algún momento parece la solución obvia
  a un problema, ese es el momento de releer REGLA 0 en el README.
