-- ===========================================================================
-- Diagnóstico del pretal fosforescente (1349) — SOLO LECTURA
-- ===========================================================================
--
-- La auditoría devolvió UNA fila: un ingreso de 2600 unidades de "1.5 pretal
-- fosforescente color", sin proveedor. Pero el stock de ese producto es −15, no
-- +2600. Las dos cosas solo pueden ser ciertas a la vez si esa compra YA está
-- anulada y su asiento compensatorio ya descontó las 2600.
--
-- Estas tres consultas lo confirman o lo desmienten. Ninguna modifica nada.
--
-- IMPORTANTE: no corras ningún `update` sobre `compra_items`. La base lo
-- rechaza (trigger `compra_items_inmutables`), y aunque no lo rechazara dejaría
-- el renglón diciendo una cosa y el movimiento de stock otra. Lo que corrige un
-- ingreso mal cargado es "Corregir ingreso" en la app.
-- ===========================================================================


-- A ── ¿Esa compra está anulada? ---------------------------------------------
-- `anulada_en` con fecha = sí, ya se compensó. NULL = sigue viva, y ahí sí hay
-- que corregirla desde la app.
select co.id,
       co.fecha,
       co.anulada_en,
       case when co.anulada_en is null then '⚠️ SIGUE VIVA — corregir desde la app'
            else '✅ ya anulada, el asiento compensatorio está hecho' end as estado,
       ci.cantidad,
       (ci.costo_unitario_cent / 100.0) as costo_unitario,
       (co.total_cent / 100.0)          as total_de_la_compra
  from compra_items ci
  join compras co on co.id = ci.compra_id
  join productos p on p.id = ci.producto_id
 where p.codigo = '1349';


-- B ── Los movimientos de ese producto, uno por uno --------------------------
-- Acá se ve la película entera: la entrada de 2600, el ajuste de −2600 que la
-- compensa, y las ventas reales. La suma de la última columna es el stock.
select m.creado_en,
       m.tipo,
       m.cantidad,
       sum(m.cantidad) over (order by m.creado_en, m.id) as stock_despues,
       m.ref_tipo,
       m.ref_id
  from movimientos_stock m
  join productos p on p.id = m.producto_id
 where p.codigo = '1349'
 order by m.creado_en, m.id;


-- C ── Lo mismo, pero para TODOS los productos con stock negativo -------------
-- Para separar los que son "vendí algo que nunca cargué" (lo normal cuando se
-- empieza a usar la app con mercadería ya en casa) de los que tienen alguna
-- operación rara atrás.
select p.codigo,
       p.nombre,
       sum(m.cantidad)                                        as stock,
       count(*) filter (where m.tipo = 'compra')              as entradas,
       count(*) filter (where m.tipo = 'venta')               as ventas,
       count(*) filter (where m.tipo = 'ajuste')              as ajustes,
       sum(m.cantidad) filter (where m.tipo = 'compra')       as unidades_entradas,
       -sum(m.cantidad) filter (where m.tipo = 'venta')       as unidades_vendidas
  from movimientos_stock m
  join productos p on p.id = m.producto_id
 where p.activo
 group by p.id, p.codigo, p.nombre
having sum(m.cantidad) < 0
 order by sum(m.cantidad);
