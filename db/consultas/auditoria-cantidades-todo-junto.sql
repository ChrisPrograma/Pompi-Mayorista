-- ===========================================================================
-- Auditoría de cantidades — TODOS LOS CHEQUEOS EN UNA SOLA CONSULTA
-- ===========================================================================
--
-- El editor de Supabase muestra solo el resultado de la ÚLTIMA sentencia. Este
-- archivo junta los siete chequeos que tienen que dar vacío en una sola tabla,
-- así se ve todo de un vistazo.
--
-- LO QUE HAY QUE ESPERAR: **cero filas**. "Success. No rows returned" es el
-- resultado bueno.
--
-- Si devuelve algo, la columna `chequeo` dice cuál saltó y `detalle` qué es.
-- NADA se borra: las operaciones mal cargadas se anulan desde la app —o se
-- corrigen, si son ingresos—, que es lo que deja el asiento compensatorio.
--
-- (El stock por producto, que es informativo y no un chequeo, quedó afuera a
-- propósito: está en `auditoria-cantidades.sql`, consulta 6.)
-- ===========================================================================

with
-- 1 ── Cantidades sospechosamente grandes ------------------------------------
-- Una operación YA ANULADA con una cantidad enorme no es un problema abierto:
-- es el bug quedando registrado, con su asiento compensatorio al lado. Se
-- muestra igual —la REGLA 0 dice que nada se borra— pero con otra etiqueta, para
-- no confundirla con algo que hay que ir a arreglar.
grandes as (
  select case when v.anulada_en is null then '1 cantidad enorme'
              else '1 cantidad enorme (YA ANULADA, sin acción)' end as chequeo,
         'venta' as que,
         coalesce(c.nombre, 'sin cliente') || ' · ' || p.nombre as detalle,
         vi.cantidad::numeric as numero, v.id::text as id
    from venta_items vi
    join ventas v    on v.id = vi.venta_id
    join productos p on p.id = vi.producto_id
    left join clientes c on c.id = v.cliente_id
   where vi.cantidad > 500
  union all
  select case when co.anulada_en is null then '1 cantidad enorme'
              else '1 cantidad enorme (YA ANULADA, sin acción)' end,
         'compra',
         coalesce(pr.nombre, 'sin proveedor') || ' · ' || p.nombre,
         ci.cantidad::numeric, co.id::text
    from compra_items ci
    join compras co  on co.id = ci.compra_id
    join productos p on p.id = ci.producto_id
    left join proveedores pr on pr.id = co.proveedor_id
   where ci.cantidad > 500
),

-- 2 y 3 ── Totales que no cierran con sus renglones --------------------------
ventas_mal as (
  select v.id, v.total_cent - sum(vi.cantidad * vi.precio_unitario_cent) as dif
    from ventas v
    join venta_items vi on vi.venta_id = v.id
   group by v.id, v.total_cent
  having v.total_cent <> sum(vi.cantidad * vi.precio_unitario_cent)
),
compras_mal as (
  select co.id, co.total_cent - sum(ci.cantidad * ci.costo_unitario_cent) as dif
    from compras co
    join compra_items ci on ci.compra_id = co.id
   group by co.id, co.total_cent
  having co.total_cent <> sum(ci.cantidad * ci.costo_unitario_cent)
),

-- 5 ── Movimientos duplicados para el mismo hecho ----------------------------
duplicados as (
  select ref_tipo, ref_id, producto_id, tipo, count(*) as cuantos
    from movimientos_stock
   where tipo in ('venta', 'compra')
   group by ref_tipo, ref_id, producto_id, tipo
  having count(*) > 1
),

-- 7 ── Más de un precio vigente ----------------------------------------------
precios_dobles as (
  select producto_id, count(*) as vigentes
    from precios_venta
   where vigente_hasta is null
   group by producto_id, lista_id
  having count(*) > 1
)

select * from grandes

union all
select '2 total de venta no cierra', 'venta',
       'diferencia en pesos', (dif / 100.0), id::text
  from ventas_mal

union all
select '3 total de compra no cierra', 'compra',
       'diferencia en pesos', (dif / 100.0), id::text
  from compras_mal

-- 4 ── El movimiento de stock no coincide con su renglón ---------------------
union all
select '4 stock no coincide', 'venta',
       p.nombre || ' · renglón ' || vi.cantidad || ' vs movimiento ' || m.cantidad,
       m.cantidad::numeric, m.ref_id::text
  from movimientos_stock m
  join venta_items vi on vi.venta_id = m.ref_id and vi.producto_id = m.producto_id
  join productos p on p.id = m.producto_id
 where m.ref_tipo = 'venta' and m.tipo = 'venta' and m.cantidad <> -vi.cantidad

union all
select '4 stock no coincide', 'compra',
       p.nombre || ' · renglón ' || ci.cantidad || ' vs movimiento ' || m.cantidad,
       m.cantidad::numeric, m.ref_id::text
  from movimientos_stock m
  join compra_items ci on ci.compra_id = m.ref_id and ci.producto_id = m.producto_id
  join productos p on p.id = m.producto_id
 where m.ref_tipo = 'compra' and m.tipo = 'compra' and m.cantidad <> ci.cantidad

union all
select '5 movimiento duplicado', d.ref_tipo, p.nombre || ' · ' || d.tipo,
       d.cuantos::numeric, d.ref_id::text
  from duplicados d
  join productos p on p.id = d.producto_id

union all
select '7 dos precios vigentes', 'precio', p.nombre,
       pd.vigentes::numeric, p.id::text
  from precios_dobles pd
  join productos p on p.id = pd.producto_id

-- 8 ── Importes en un rango imposible ----------------------------------------
union all
select '8 importe imposible', 'precio',
       coalesce(p.codigo, 'sin código') || ' · ' || p.nombre,
       (pv.precio_cent / 100.0), p.id::text
  from precios_venta pv
  join productos p on p.id = pv.producto_id
 where pv.vigente_hasta is null and pv.precio_cent > 1000000000

union all
select '8 importe imposible', 'costo',
       coalesce(p.codigo, 'sin código') || ' · ' || p.nombre,
       (ci.costo_unitario_cent / 100.0), p.id::text
  from compra_items ci
  join productos p on p.id = ci.producto_id
 where ci.costo_unitario_cent > 1000000000

order by chequeo, numero desc;
