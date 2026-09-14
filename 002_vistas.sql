-- 002_vistas.sql
-- Todo lo que en un sistema mal hecho sería una columna mutable, acá es una vista.
-- Ninguna de estas vistas guarda nada: se pueden borrar y recrear sin perder un dato.

begin;

-- ---------------------------------------------------------------------------
-- Stock actual por producto y ubicación (casa / auto)
-- ---------------------------------------------------------------------------
create or replace view v_stock as
select
  m.negocio_id,
  m.producto_id,
  m.ubicacion,
  sum(m.cantidad)::integer as cantidad
from movimientos_stock m
group by m.negocio_id, m.producto_id, m.ubicacion;

-- Vista ancha, que es como la consume la app: una fila por producto.
create or replace view v_stock_producto as
select
  p.negocio_id,
  p.id as producto_id,
  coalesce(sum(m.cantidad) filter (where m.ubicacion = 'deposito'), 0)::integer as en_deposito,
  coalesce(sum(m.cantidad) filter (where m.ubicacion = 'vehiculo'), 0)::integer as en_vehiculo,
  coalesce(sum(m.cantidad), 0)::integer as total
from productos p
left join movimientos_stock m on m.producto_id = p.id
group by p.negocio_id, p.id;

-- ---------------------------------------------------------------------------
-- Precio vigente por producto y lista
-- ---------------------------------------------------------------------------
create or replace view v_precio_vigente as
select
  pv.producto_id,
  pv.lista_id,
  pv.precio_cent,
  pv.vigente_desde,
  pv.origen
from precios_venta pv
where pv.vigente_hasta is null;

-- ---------------------------------------------------------------------------
-- Costos: tres respuestas distintas a "cuánto me cuesta", según para qué
-- ---------------------------------------------------------------------------

-- 1. Último costo = precio de reposición. Es el que se usa para FIJAR EL PRECIO DE VENTA.
create or replace view v_costo_ultimo as
select distinct on (ci.producto_id)
  ci.producto_id,
  ci.costo_unitario_cent,
  c.fecha,
  c.proveedor_id
from compra_items ci
join compras c on c.id = ci.compra_id
order by ci.producto_id, c.fecha desc, ci.id desc;

-- 2. Costo promedio ponderado = para VALUAR EL STOCK que tiene en la casa.
create or replace view v_costo_promedio as
select
  ci.producto_id,
  (sum(ci.cantidad * ci.costo_unitario_cent) / nullif(sum(ci.cantidad), 0))::bigint
    as costo_promedio_cent
from compra_items ci
group by ci.producto_id;

-- 3. El costo para calcular GANANCIA de una venta no está acá: está congelado
--    en venta_items.costo_unitario_cent. Por eso los informes viejos no cambian.

-- ---------------------------------------------------------------------------
-- Cuenta corriente de clientes
-- ---------------------------------------------------------------------------
create or replace view v_saldo_cliente as
with a_cuenta as (
  select cliente_id, negocio_id,
         sum(total_cent - cobrado_cent) as deuda_cent,
         min(fecha) filter (where total_cent > cobrado_cent) as deuda_mas_vieja
  from ventas
  where total_cent > cobrado_cent
  group by cliente_id, negocio_id
),
pagado as (
  select cliente_id, sum(monto_cent) as pagado_cent
  from pagos_cliente
  group by cliente_id
)
select
  c.negocio_id,
  c.id as cliente_id,
  greatest(coalesce(a.deuda_cent, 0) - coalesce(p.pagado_cent, 0), 0)::bigint as saldo_cent,
  a.deuda_mas_vieja,
  case
    when coalesce(a.deuda_cent, 0) - coalesce(p.pagado_cent, 0) <= 0 then null
    else (current_date - a.deuda_mas_vieja::date)
  end as dias_atraso
from clientes c
left join a_cuenta a on a.cliente_id = c.id
left join pagado   p on p.cliente_id = c.id;

-- ---------------------------------------------------------------------------
-- Cuenta corriente de proveedores (la otra punta)
-- ---------------------------------------------------------------------------
create or replace view v_saldo_proveedor as
with comprado as (
  select proveedor_id, negocio_id, sum(total_cent) as total_cent
  from compras where condicion_pago = 'cuenta'
  group by proveedor_id, negocio_id
),
pagado as (
  select proveedor_id, sum(monto_cent) as pagado_cent
  from pagos_proveedor group by proveedor_id
)
select
  pr.negocio_id,
  pr.id as proveedor_id,
  greatest(coalesce(c.total_cent, 0) - coalesce(p.pagado_cent, 0), 0)::bigint as saldo_cent
from proveedores pr
left join comprado c on c.proveedor_id = pr.id
left join pagado   p on p.proveedor_id = pr.id;

-- ---------------------------------------------------------------------------
-- Ganancia por venta — usa el costo congelado, nunca el costo de hoy
-- ---------------------------------------------------------------------------
create or replace view v_ganancia_venta as
select
  v.negocio_id,
  v.id as venta_id,
  v.fecha,
  sum(vi.cantidad * vi.precio_unitario_cent)::bigint as venta_cent,
  sum(vi.cantidad * vi.costo_unitario_cent)::bigint  as costo_cent,
  sum(vi.cantidad * (vi.precio_unitario_cent - vi.costo_unitario_cent))::bigint as ganancia_cent
from ventas v
join venta_items vi on vi.venta_id = v.id
group by v.negocio_id, v.id, v.fecha;

commit;
