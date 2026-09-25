-- ===========================================================================
-- Auditoría de cantidades e importes — SOLO LECTURA
-- ===========================================================================
--
-- Para correr en Supabase → SQL Editor después del bug de las cantidades
-- (cargaba 6 y quedaban 60). Son ocho consultas y **ninguna modifica nada**:
-- todas empiezan con `select`. Se pueden correr de a una o todas juntas.
--
-- Qué contestan, en orden:
--   1. ¿Quedaron filas con cantidades absurdas, de cuando el campo fallaba?
--   2 y 3. ¿El total de cada venta y de cada compra coincide con sus renglones?
--   4. ¿El movimiento de stock coincide con el renglón que lo generó?
--   5. ¿Hay movimientos duplicados para el mismo hecho?
--   6. ¿El stock de cada producto es el que dice la suma del libro mayor?
--   7. ¿Algún producto tiene más de un precio vigente?
--   8. ¿Algún precio o costo quedó en un rango imposible?
--
-- LO QUE HAY QUE ESPERAR: las consultas 1 a 5, 7 y 8 tienen que devolver CERO
-- filas. La 6 es informativa y muestra el stock de cada producto.
--
-- Si la 1 devuelve filas, son ventas cargadas con la cantidad multiplicada. NO
-- se borran: se anulan desde la app —o se corrigen, en el caso de un ingreso—,
-- que es lo que deja el asiento compensatorio y el rastro. La REGLA 0 vale
-- también para limpiar los errores del programador.
-- ===========================================================================


-- 1 ── Cantidades sospechosamente grandes -----------------------------------
-- El umbral son 500 unidades de un mismo producto en una sola operación. Si él
-- vende de a más, subilo; lo que importa es que salten las de 10× y 100×.
--
-- MIRÁ LA COLUMNA `anulada_en` ANTES DE ALARMARTE: si tiene fecha, esa
-- operación ya fue anulada y su asiento compensatorio ya está hecho. Aparece
-- igual porque nada se borra, pero no hay nada que arreglar.
select 'venta' as que, v.fecha, v.anulada_en, c.nombre as con_quien, p.nombre as producto,
       vi.cantidad, (vi.precio_unitario_cent / 100.0) as precio, v.id
  from venta_items vi
  join ventas v    on v.id = vi.venta_id
  join productos p on p.id = vi.producto_id
  left join clientes c on c.id = v.cliente_id
 where vi.cantidad > 500
union all
select 'compra', co.fecha, co.anulada_en, pr.nombre, p.nombre,
       ci.cantidad, (ci.costo_unitario_cent / 100.0), co.id
  from compra_items ci
  join compras co  on co.id = ci.compra_id
  join productos p on p.id = ci.producto_id
  left join proveedores pr on pr.id = co.proveedor_id
 where ci.cantidad > 500
 order by fecha desc;


-- 2 ── Ventas cuyo total NO es la suma de sus renglones ----------------------
-- Si esto devuelve algo, el total se calculó con otras cantidades que las que
-- quedaron guardadas: es exactamente la forma en que el bug dejaría rastro.
select v.id, v.fecha, v.total_cent,
       sum(vi.cantidad * vi.precio_unitario_cent) as suma_de_renglones,
       v.total_cent - sum(vi.cantidad * vi.precio_unitario_cent) as diferencia
  from ventas v
  join venta_items vi on vi.venta_id = v.id
 group by v.id, v.fecha, v.total_cent
having v.total_cent <> sum(vi.cantidad * vi.precio_unitario_cent)
 order by v.fecha desc;


-- 3 ── Compras cuyo total NO es la suma de sus renglones ---------------------
select co.id, co.fecha, co.total_cent,
       sum(ci.cantidad * ci.costo_unitario_cent) as suma_de_renglones,
       co.total_cent - sum(ci.cantidad * ci.costo_unitario_cent) as diferencia
  from compras co
  join compra_items ci on ci.compra_id = co.id
 group by co.id, co.fecha, co.total_cent
having co.total_cent <> sum(ci.cantidad * ci.costo_unitario_cent)
 order by co.fecha desc;


-- 4 ── El movimiento de stock no coincide con su renglón ---------------------
-- Una venta descuenta exactamente lo que dice el renglón, y una compra suma
-- exactamente lo que entró. Si acá sale algo, el stock está mintiendo.
select 'venta' as que, m.ref_id, p.nombre as producto,
       vi.cantidad as dice_el_renglon, m.cantidad as dice_el_movimiento
  from movimientos_stock m
  join venta_items vi on vi.venta_id = m.ref_id and vi.producto_id = m.producto_id
  join productos p on p.id = m.producto_id
 where m.ref_tipo = 'venta' and m.tipo = 'venta'
   and m.cantidad <> -vi.cantidad
union all
select 'compra', m.ref_id, p.nombre,
       ci.cantidad, m.cantidad
  from movimientos_stock m
  join compra_items ci on ci.compra_id = m.ref_id and ci.producto_id = m.producto_id
  join productos p on p.id = m.producto_id
 where m.ref_tipo = 'compra' and m.tipo = 'compra'
   and m.cantidad <> ci.cantidad;


-- 5 ── Movimientos duplicados para el mismo hecho ----------------------------
-- Dos movimientos del mismo tipo, del mismo producto y de la misma operación
-- significan que algo se registró dos veces. (Los `ajuste` NO entran: una
-- anulación crea justamente un segundo movimiento, y eso es lo correcto.)
select ref_tipo, ref_id, producto_id, tipo, count(*) as cuantos,
       sum(cantidad) as suma
  from movimientos_stock
 where tipo in ('venta', 'compra')
 group by ref_tipo, ref_id, producto_id, tipo
having count(*) > 1;


-- 6 ── El stock de cada producto, como suma del libro mayor ------------------
-- Informativa: es el número que muestra la app. Sirve para comparar contra lo
-- que hay en la casa. Un negativo NO es un error de la base: significa que se
-- vendió algo que no figura como recibido.
select p.codigo, p.nombre,
       coalesce(sum(m.cantidad), 0) as stock,
       count(m.id) as movimientos
  from productos p
  left join movimientos_stock m on m.producto_id = p.id
 where p.activo
 group by p.id, p.codigo, p.nombre
 order by p.codigo nulls last;


-- 7 ── Productos con más de un precio vigente --------------------------------
-- Tiene que ser imposible: hay un trigger que solo deja CERRAR una vigencia.
-- Si aparece algo acá, hay que mirar el trigger antes que cualquier otra cosa.
select producto_id, lista_id, count(*) as vigentes
  from precios_venta
 where vigente_hasta is null
 group by producto_id, lista_id
having count(*) > 1;


-- 8 ── Importes en un rango imposible ----------------------------------------
-- Todos los importes son centavos ENTEROS. Un precio de venta de más de diez
-- millones de pesos, o un costo mayor que mil veces el precio, es una carga con
-- un cero de más.
select 'precio' as que, p.codigo, p.nombre, (pv.precio_cent / 100.0) as importe
  from precios_venta pv
  join productos p on p.id = pv.producto_id
 where pv.vigente_hasta is null and pv.precio_cent > 1000000000
union all
select 'costo', p.codigo, p.nombre, (ci.costo_unitario_cent / 100.0)
  from compra_items ci
  join productos p on p.id = ci.producto_id
 where ci.costo_unitario_cent > 1000000000;
