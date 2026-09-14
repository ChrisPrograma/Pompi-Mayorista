# Decisiones tomadas

Registro de lo que dejó de ser pregunta. Cada entrada dice qué se decidió, qué se simplificó por
eso, y qué haría falta si algún día cambia.

---

## Resueltas antes de la reunión (13/09/2026)

### No vende alimento balanceado — sin lotes ni vencimientos

**Decisión:** el alcance excluye productos con vencimiento o venta por peso.

**Qué se simplificó:** el stock sigue siendo una cantidad por producto y ubicación, no una cantidad
por lote. Eso mantiene `movimientos_stock` con una sola dimensión y evita toda la lógica de
imputación FIFO por lote al vender.

**Si algún día vende alimento:** hay que agregar una tabla `lotes` (producto, vencimiento, costo de
ese lote) y una columna `lote_id` en `movimientos_stock`. **No es catastrófico** gracias al libro
mayor: los movimientos viejos quedan con `lote_id` nulo y los nuevos lo llevan. Es la ventaja
concreta de no haber guardado el stock como columna.

### Las facturas las hace aparte — fuera de alcance

**Decisión:** el sistema no emite comprobantes fiscales. No hay integración con ARCA/AFIP.

**Qué se simplificó:** no hay numeración de comprobantes, ni puntos de venta, ni CAE, ni
contingencia por caída del servicio fiscal. La venta es un registro interno.

**Cómo cotizarlo:** si más adelante lo pide, es un proyecto aparte con su propio plazo. Conviene
decirlo así desde ahora y no dejar la puerta entreabierta.

### Trabaja solo — un solo usuario

**Decisión:** una sola persona usa el sistema.

**Qué se simplificó:** no hay roles, ni pantallas de administración de usuarios, ni auditoría de
"quién hizo qué". La app no pregunta nunca quién está operando.

**Qué se dejó igual, a propósito:** las tablas conservan `negocio_id` y `creado_por`, y las
políticas de seguridad por fila quedan activas. No cuesta nada mantenerlas y evitan una migración
riesgosa el día que sume a alguien o que vos vendas el mismo sistema a otro cliente. La
simplificación es de interfaz, no de modelo.

---

## Todavía abiertas — para el martes

| # | Pregunta | Estado hoy en el código |
|---|---|---|
| 1 | ¿A todos les cobra lo mismo? | `listas_precio` ya existe y hay una lista por defecto. Si dice que sí hace precios distintos, se crean más listas y **no hay migración**. |
| 2 | ¿Vende por unidad o por bulto? | `productos.unidad` existe como texto libre. Si hay conversión bulto→unidad, hace falta agregar `unidad_compra` y `factor`, y es una migración real. |
| 6 | ¿Cobra alguna vez en dólares? | `negocios.moneda` existe, fija en ARS. Multimoneda seguiría siendo un refactor grande: los importes tendrían que llevar moneda y cotización. |

Las otras 27 preguntas no bloquean el desarrollo: afinan la interfaz y la propuesta comercial.
