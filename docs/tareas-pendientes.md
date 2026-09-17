# Lo que sigue

Estado al **miércoles 16/09/2026, 18:00**.

Cada tarea dice **quién** la puede hacer, porque varias no las puedo hacer yo: no manejo
credenciales ni contraseñas, y no tengo forma de ejecutar nada en tu máquina.

---

## Lo que bloquea todo lo demás — 5 minutos, y son tuyos

Las variables ya están cargadas en Netlify ✅. Falta subir el código y crear la cuenta.

### 1. Volver a subir el proyecto al repositorio — **Chris**

El repositorio se está vaciando para volver a subirlo entero (ver *La limpieza general del 16/09* en
la [bitácora](bitacora-despliegue.md)). El paquete a subir es
**`pompi-mayorista-limpio.zip`**, en `Pictures\Claude outputs\`.

1. Descomprimirlo. Sale una carpeta `pompi-mayorista` con 72 archivos.
2. En GitHub: *Add file → Upload files*.
3. **Arrastrar la carpeta al recuadro.** No usar el botón *"choose your files"*.

Las tres trampas, por orden de lo que costaron:

| Trampa | Qué pasa | Qué hacer |
|---|---|---|
| El botón *"choose your files"* | El navegador manda los nombres sin la ruta: `App.tsx` en vez de `src/ui/App.tsx`. **Aplana el repo** — ya pasó tres veces | Arrastrar la carpeta |
| La web ignora `.gitignore` | Se suben también los compilados de `dist/`, que no van al repo | El paquete limpio ya viene sin `dist` |
| GitHub no descomprime zips | Sube el `.zip` como un archivo más y el repo queda igual de vacío | Descomprimir primero |

**Mientras el repo esté vacío los builds fallan, y está bien.** El sitio se queda mostrando el
último deploy bueno y no se cae.

**Cómo saber si funcionó:** abrir la app. Si pide entrar antes de mostrar nada, las variables de
Supabase se hornearon. Si entra directo y arriba a la derecha hay un puntito naranja, no llegaron.

> Lo de limpiar el almacenamiento del navegador **no hace falta**. La app reconoce los datos de
> ejemplo viejos por el formato de sus ids y los borra sola al abrir. Si igual querés verlo desde
> cero, una ventana de incógnito alcanza.

### 2. Registrar la primera cuenta desde la app — **Chris**

Con las variables cargadas, la app abre en la pantalla de ingreso. Solapa **"Crear cuenta"**, mail y
una contraseña de al menos 8 caracteres con una mayúscula y un número.

**Esa primera cuenta se queda con el negocio** (migración 006) y después la puerta se cierra: el
segundo que se registre queda afuera con el motivo explicado en pantalla. Así que conviene
registrarla con el mail que va a usar el cliente, o con el tuyo si primero querés probarla vos.

Guardá la contraseña en tu gestor. Yo no la necesito y no la quiero.

### 3. Cargar un producto y hacer una venta — **los dos**

Vos lo hacés en la app; yo miro las tablas en Supabase y confirmo que las filas llegaron con los
valores correctos. Lo que tiene que aparecer:

| Tabla | Qué esperar |
|---|---|
| `productos` | La fila del producto |
| `precios_venta` | Una fila con `vigente_hasta` en **null** |
| `ventas` + `venta_items` | La venta con su renglón, precio y costo congelados |
| `movimientos_stock` | **Dos**: la entrada de la carga inicial y la salida de la venta |

Y la prueba que importa de verdad, la que antes era imposible: **abrir la app en el celular con la
misma cuenta**. Tiene que aparecer todo sin haber cargado nada ahí.

---

## Lo que está hecho y no hace falta volver a tocar

| Qué | Cuándo |
|---|---|
| CRUD completo de productos, clientes y proveedores | 14/09 |
| Recorrido guiado de 15 pasos | 14/09 |
| Repositorio arreglado y conectado a Netlify (cada `push` publica solo) | 15/09 |
| Sitio renombrado a `pompi-mayorista.netlify.app` | 15/09 |
| Pantalla de entrar / crear cuenta, con sesión que funciona sin señal | 15/09 |
| `reclamar_negocio()` aplicada y verificada en Supabase | 16/09 |
| Cuatro defectos de sincronización encontrados y corregidos | 16/09 |
| **Descarga inicial desde el servidor** — la persistencia cerrada | 16/09 |
| Variables de Supabase cargadas en Netlify | 16/09 |
| **La app arranca vacía**, sin datos de ejemplo por ningún camino | 16/09 |

---

## Después, por orden

### 1. Los dos audios del cliente

7 minutos y 3 minutos, con dudas y necesidades de la reunión. **No puedo escuchar audio.** Si me
los pasás transcritos —aunque sea con la transcripción automática de WhatsApp, con errores y
todo— sale la lista de cambios. Hasta entonces esto bloquea todo lo que el cliente pidió.

### 2. Las tres preguntas que cambian código

Desarrolladas en [`preguntas-cliente-martes.md`](preguntas-cliente-martes.md):

| # | Pregunta | Por qué importa |
|---|---|---|
| 2 | **¿Compra por bulto y vende por unidad?** | La única que toca el modelo de datos: hace falta un factor de conversión en `productos` y cambia el alta |
| 1 | **¿Le cobra distinto a algún cliente?** | Las listas de precios ya están en la base. Si dice que sí, es configuración; si no, no se toca nada |
| 11 | **¿Trabaja con pedidos pendientes?** | Si anota cosas para llevar la próxima vez, hace falta una pantalla nueva |

Conviene confirmar también el **nombre exacto del negocio** (hoy: "Pompi Mascotas") y a partir de
**cuántos días** considera vieja una deuda (hoy: 15 y 30).

### 3. Funciones que todavía faltan

| Falta | Comentario |
|---|---|
| Registrar pagos a proveedores | El saldo se ve, el pago no se carga. La más pedida de esta lista |
| Ajuste de stock por recuento físico | **Imprescindible el día que arranque con datos reales**: el stock inicial nunca cuadra con lo que hay en la casa |
| Devoluciones y roturas | El modelo ya las contempla (un movimiento en sentido contrario), falta la pantalla |
| Venta por bulto | Depende de la pregunta 2 |
| Pedidos pendientes | Depende de la pregunta 11 |

### 4. El dominio propio

Quedó decidido arrancar con el gratuito de Netlify y comprar el propio en paralelo. El gratuito ya
está andando, así que esto no bloquea nada: cuando el dominio esté comprado se agrega en
`Netlify → Domain management` y el certificado lo saca Netlify solo.

### 5. Cargar los datos reales

La app abre vacía y la primera pantalla le dice los tres pasos, en el orden que el modelo necesita:
**proveedores → productos → comercios**. Ese orden importa porque un producto puede llevar su carga
inicial de stock, y para eso el proveedor tiene que existir antes.

No hace falta cargar todo de una: con un proveedor y un producto ya puede vender. Lo ideal es hacer
el recuento físico de la casa cuando tenga un rato tranquilo y cargar el stock inicial ahí.

---

## Lo que NO hay que hacer

- **No editar filas de datos a mano desde el panel de Supabase.** El modelo es append-only: se
  corrige agregando un movimiento de ajuste, no cambiando el que está.
- **No editar una migración que ya se corrió** contra la base de verdad. Se agrega una nueva.
- **No usar `docs/boceto-presentacion.html` como base para programar.** Es la maqueta de la primera
  reunión: pisa stock, costo y precio, que es exactamente lo que REGLA 0 prohíbe. Queda solo como
  referencia de diseño.
- **No volver a subir archivos a GitHub con "choose your files".** Aplana el repositorio siempre.
  Ahora que está conectado a Netlify, lo que corresponde es `git push`.
- **No guardar stock, costo ni precio como columna.** Si en algún momento parece la solución obvia
  a un problema, ese es el momento de releer REGLA 0 en el README.
