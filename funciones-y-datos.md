# Funciones de la app y cómo se actualiza la base

Estado al 14/09/2026. Este documento tiene dos partes: **qué hace la app hoy** (para la
presentación) y **qué escribe en la base cada acción** (para el desarrollo).

---

## PARTE 1 — Funciones habilitadas

### Pantalla "Hoy"

Lo primero que ve al abrir.

- Cuánto **cobró hoy** (ventas de contado del día + pagos recibidos del día).
- Cuánta plata tiene **en la calle** (lo que le deben todos, sumado).
- **Alerta de la deuda más vieja** que pasó el umbral, con nombre, monto y días.
- **Aviso de faltante en el auto**, calculado contra lo que suele vender en la ruta.
- **Aviso de precios para revisar**, si entró mercadería más cara y todavía no decidió.
- **"Tu día en 3 pasos"**: vender, cobrar, dejar el auto cargado. Se van tildando solos.
- **La ruta del día**: los comercios que visita ese día de la semana. El "ya pasaste" no se
  marca a mano — sale de si hubo una venta a ese comercio hoy.
- **Las ventas del día**, con hora, monto y si quedó cobrada o a cuenta.

### Vender — tres pasos

1. **A quién.** Lista de comercios con la deuda a la vista. Si uno debe hace 40 días, lo ve
   antes de venderle. Desde acá también se da de alta un comercio nuevo.
2. **Qué se lleva.** Solo aparece lo que está arriba del auto, con el precio y las unidades
   disponibles. Más y menos, el total se arma solo.
3. **Cómo paga.** Efectivo, transferencia o "me lo debe". Al cerrar, una pantalla de
   confirmación con el total y el saldo actualizado del comercio.

### Me deben

- Total en la calle arriba.
- Lista **de más vieja a más nueva**, que es el orden en el que hay que salir a cobrar, con
  semáforo por antigüedad.
- **Registrar un cobro**: total, la mitad, o un monto escrito a mano. Cobro parcial soportado.
- Lista aparte de los comercios que están al día.

### Me llegó mercadería — tres pasos

1. **Quién te trajo.** Proveedores, con lo que se le debe a cada uno.
2. **Qué te trajo.** Solo los productos de ese proveedor. Cantidad y **costo unitario editable**;
   si el costo subió, se marca en la misma línea con el costo anterior.
3. **Cómo se lo pagás.** Contado o en cuenta corriente.

Al cerrar, si algún costo subió, propone el **precio nuevo** para mantener el margen. **Nunca
cambia un precio solo**: hay que confirmarlo.

### Mis cosas

- **Mis productos**: precio, costo, ganancia por unidad y porcentaje. La ficha muestra el
  historial de precios anteriores con fecha.
- **Lo que llevo en el auto**: faltante calculado, botón para cargar todo lo que falta, y
  ajuste producto por producto.
- **Mis proveedores**: cuánto se le debe a cada uno y el total.
- **Mis clientes**: listado con zona, día de visita y deuda. **Alta de comercios nuevos.**

### Números

- **Ganancia del mes**: ventas menos el costo real de lo vendido.
- Ventas de los **últimos 7 días**.
- **Lo que más se vende**, en unidades.
- **El producto que más deja** por unidad.

### Transversales

- **Funciona sin señal.** Todo se guarda en el dispositivo y se sube cuando hay red. Un
  indicador muestra cuántas operaciones quedan sin subir; nunca se oculta ese estado.
- **Instalable** desde el navegador del celular, con ícono propio y pantalla completa.
- Se adapta a celular y a computadora.

### Lo que todavía NO está

Conviene tenerlo claro para no prometerlo en la reunión:

| Falta | Comentario |
|---|---|
| Alta de productos | Depende de la pregunta de unidad vs. bulto |
| Alta de proveedores | Simple, pero sin pantalla todavía |
| Registrar pagos a proveedores | El saldo se ve, el pago no se carga |
| Editar un cliente o producto ya cargado | Solo alta |
| Devoluciones y roturas | El modelo las contempla, la pantalla no |
| Ajuste de stock por recuento físico | Necesario para el arranque real |
| Pedidos pendientes | A confirmar en la reunión (pregunta 11) |
| Backend real | Hoy guarda en el dispositivo; el servidor está escrito, sin conectar |

---

## PARTE 2 — Qué escribe cada acción en la base

**La regla que gobierna todo:** ninguna acción modifica una fila existente. Cada acción
**agrega filas**. Stock, saldos, costos y ganancia **no se guardan**: se calculan sumando esas
filas cada vez que se muestran.

La única excepción es cerrar la vigencia de un precio, y hasta esa deja la fila anterior intacta
con su precio original.

### Alta de un cliente nuevo

| | |
|---|---|
| **Escribe** | 1 fila en `clientes` (id, nombre, zona, día de visita, activo) |
| **No toca** | Nada más |
| **Función del servidor** | `INSERT` directo en `clientes` |
| **Se puede deshacer** | Se marca `activo = false`; nunca se borra, porque puede tener ventas |

El id se genera **en el celular** (UUID v7). Si el alta se reenvía por un reintento, el servidor
la rechaza por clave repetida: no se duplica el comercio.

### Venta

| | |
|---|---|
| **Escribe** | 1 fila en `ventas` · 1 fila por producto en `venta_items` · 1 movimiento de stock por producto |
| **Congela** | En cada línea: `precio_unitario_cent` **y** `costo_unitario_cent` del momento |
| **Stock** | Un movimiento negativo en la ubicación `vehiculo`. El depósito no se toca |
| **Deuda** | Si es "me lo debe", `cobrado_cent = 0`. El saldo del cliente sale de restar pagos a ventas impagas |
| **Función** | `registrar_venta(...)` — una transacción |

Congelar el costo es lo que hace que la ganancia de una venta vieja **no se mueva nunca más**
aunque el proveedor aumente mañana.

Se permite que el stock quede **negativo**. Si el sistema le impidiera registrar una venta que ya
hizo en la calle, dejaría de usar el sistema. La diferencia se muestra para revisar.

### Cobro a un cliente

| | |
|---|---|
| **Escribe** | 1 fila en `pagos_cliente` (monto, fecha, medio) |
| **No toca** | La venta original queda **exactamente igual** |
| **Saldo** | Se recalcula: ventas a cuenta − pagos, imputando de la deuda más vieja a la más nueva |
| **Función** | `INSERT` directo en `pagos_cliente` |

Por eso un cobro parcial deja viva la deuda vieja y el contador de días sigue corriendo desde la
fecha correcta.

### Entrada de mercadería

| | |
|---|---|
| **Escribe** | 1 fila en `compras` · 1 fila por producto en `compra_items` · 1 movimiento positivo en `deposito` por producto |
| **Además** | 1 fila en `sugerencias_precio` (estado `pendiente`) por cada producto cuyo costo subió |
| **Costo** | `compra_items.costo_unitario_cent` es **inmutable**. El "costo de hoy" es el de la última compra |
| **Deuda con el proveedor** | Si es en cuenta, el saldo sale de sumar compras a cuenta y restar pagos |
| **Función** | `registrar_compra(...)` — una transacción |

**La compra no cambia ningún precio de venta.** Solo deja la sugerencia esperando.

### Actualización de precios

Son dos operaciones dentro de una misma transacción:

1. `UPDATE precios_venta SET vigente_hasta = ahora WHERE producto_id = X AND vigente_hasta IS NULL`
2. `INSERT` de una fila nueva con el precio nuevo y `vigente_hasta = NULL`

| | |
|---|---|
| **Escribe** | 1 fila nueva en `precios_venta` + cierra la vigencia de la anterior |
| **Además** | La sugerencia pasa a `aplicada` (o `descartada` si la rechaza) |
| **Garantía** | Un índice único parcial impide que existan dos precios vigentes del mismo producto |
| **Protección** | Un trigger bloquea cualquier `UPDATE` que intente cambiar el precio de una fila existente |
| **Función** | `cambiar_precio(...)` / `aplicar_sugerencia(...)` |

El precio viejo **no se borra nunca**: queda con la fecha en que dejó de regir. Por eso se puede
responder "¿a cuánto le vendía en junio?".

### Carga del auto

| | |
|---|---|
| **Escribe** | 2 movimientos de stock: uno negativo en `deposito`, uno positivo en `vehiculo` |
| **Total** | No cambia: la mercadería se mueve, no se crea |
| **Función** | `trasladar_stock(...)` |

---

## Cómo llega todo esto al servidor

1. La acción se guarda **primero en el dispositivo** (IndexedDB) y la pantalla se actualiza al
   instante. Para él, ya está hecho.
2. La operación entra en una **cola de salida** con el id generado en el celular.
3. Cuando hay red, la cola las sube **en orden de creación**.
4. Si falla por red, reintenta con espera creciente (2 s, 4 s, 8 s… hasta 5 minutos).
5. Si falla por un dato inválido, **no reintenta para siempre**: la marca para que él la vea. Una
   operación que él dio por hecha nunca se descarta en silencio.

**Por qué esto es simple y seguro:** como nada se modifica, todas las escrituras son `INSERT`.
Dos inserts no entran en conflicto — se aplican en cualquier orden y el resultado es el mismo. Si
uno llega dos veces, la clave primaria lo rechaza. No hay conflictos que resolver.

Nunca se envía un estado ("el stock es 47"), siempre un delta ("restá 3 del vehículo"). Un estado
pisaría lo que hizo otro dispositivo; un delta no.

---

## Lo que nunca se guarda, y por qué

| Dato | Cómo se obtiene |
|---|---|
| Stock en casa y en el auto | `SUM(movimientos_stock.cantidad)` agrupado por ubicación |
| Cuánto le debe un cliente | Ventas a cuenta − pagos, imputados del más viejo al más nuevo |
| Cuánto le debe a un proveedor | Compras en cuenta − pagos al proveedor |
| Costo de un producto | Última compra (para fijar precio) o promedio ponderado (para valuar) |
| Ganancia de una venta | Precio menos costo, ambos **congelados en la línea de esa venta** |
| Precio vigente | La fila de `precios_venta` con `vigente_hasta = NULL` |

Si alguno de estos fuera una columna guardada, tarde o temprano quedaría desfasado de los
movimientos. Calculados, es imposible.
