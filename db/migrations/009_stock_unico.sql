-- ===========================================================================
-- 009 · Un solo stock
-- ===========================================================================
--
-- El cliente pidió sacar el paso de "cargar el auto". Vendía desde la vereda y
-- tenía que anotar dos veces la misma mercadería: una al entrarla a la casa y
-- otra al subirla al vehículo. Sus palabras: "es como doble laburo".
--
-- QUÉ NO HAY QUE BUSCAR ACÁ
--
-- No existe ninguna columna `stock_vehiculo` ni `carga_auto` que haya que sumar
-- a un stock principal. El stock nunca fue un número guardado: es la suma de
-- `movimientos_stock.cantidad`, y cada movimiento dice en qué `ubicacion`
-- ocurrió ('deposito' o 'vehiculo'). El "stock del auto" era, literalmente, el
-- subtotal de los movimientos con ubicacion = 'vehiculo'. No hay nada que
-- migrar de una columna a otra porque no hay dos columnas.
--
-- QUÉ SE HACE EN SU LUGAR, Y POR QUÉ ASÍ
--
--   1. `registrar_venta` pasa a descontar de 'deposito'. De ahora en más todo
--      —lo que entra y lo que sale— vive en un solo lugar.
--
--   2. Lo que hoy esté contado en 'vehiculo' se devuelve al depósito con un
--      asiento de traslado, igual que si lo hubiera bajado del auto a mano.
--
-- El punto 2 es un INSERT, no un UPDATE ni un DELETE. Es la REGLA 0 del
-- proyecto: nada se pisa, todo se apila. Y no es una formalidad — los
-- movimientos de stock tienen un trigger de inmutabilidad que hace imposible
-- modificarlos o borrarlos. Un error se corrige con un asiento nuevo que lo
-- compensa, que es exactamente lo que hace esta migración.
--
-- NO SE DROPEA NADA. La columna `ubicacion`, su check, `sugerido_en_vehiculo`,
-- las vistas que separan depósito de vehículo y la función `mover_stock()`
-- quedan donde están. Dos razones: las filas viejas siguen diciendo la verdad
-- sobre lo que pasó en su momento, y si el cliente cambia de idea en tres
-- meses, volver es prender la pantalla de nuevo y no reconstruir un historial
-- que ya no existiría.
--
-- Después de esta migración la app muestra un solo número por producto: el
-- total, que es la suma de las dos ubicaciones y que no cambia con este
-- traslado. Nadie pierde ni gana una unidad acá.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. La venta sale del depósito
-- ---------------------------------------------------------------------------
-- Idéntica a la de 003 salvo por la ubicación del movimiento. Va completa
-- porque `create or replace` reemplaza el cuerpo entero: no se puede parchear
-- una línea de una función.
create or replace function registrar_venta(
  p_id          uuid,
  p_negocio_id  uuid,
  p_cliente_id  uuid,
  p_items       jsonb,
  p_forma_pago  text,
  p_cobrado_cent bigint default null,
  p_fecha       timestamptz default now(),
  p_lista_id    uuid default null,
  p_nota        text default null
) returns ventas
language plpgsql security invoker as $$
declare
  v_venta    ventas;
  v_item     jsonb;
  v_lista    uuid;
  v_precio   bigint;
  v_costo    bigint;
  v_total    bigint := 0;
  v_cobrado  bigint;
begin
  select * into v_venta from ventas where id = p_id;
  if found then
    return v_venta;                               -- idempotencia
  end if;

  v_lista := coalesce(
    p_lista_id,
    (select id from listas_precio where negocio_id = p_negocio_id and es_default limit 1)
  );
  if v_lista is null then
    raise exception 'El negocio no tiene lista de precios por defecto';
  end if;

  -- Cabecera provisoria; el total se completa al final.
  insert into ventas (id, negocio_id, cliente_id, fecha, total_cent,
                      forma_pago, cobrado_cent, nota, creado_por)
  values (p_id, p_negocio_id, p_cliente_id, p_fecha, 0, p_forma_pago, 0, p_nota, auth.uid())
  returning * into v_venta;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_precio := coalesce(
      (v_item->>'precio_cent')::bigint,
      (select precio_cent from v_precio_vigente
        where producto_id = (v_item->>'producto_id')::uuid and lista_id = v_lista)
    );
    if v_precio is null then
      raise exception 'El producto % no tiene precio vigente', v_item->>'producto_id';
    end if;

    -- Costo congelado: el último costo conocido al momento de vender.
    v_costo := coalesce(
      (select costo_unitario_cent from v_costo_ultimo
        where producto_id = (v_item->>'producto_id')::uuid),
      0
    );

    insert into venta_items
      (id, venta_id, producto_id, cantidad, precio_unitario_cent, costo_unitario_cent)
    values
      (gen_random_uuid(), p_id, (v_item->>'producto_id')::uuid,
       (v_item->>'cantidad')::integer, v_precio, v_costo);

    -- Sale del depósito: desde la 009 hay un solo stock y es este.
    -- Se sigue permitiendo que quede negativo: si el sistema le impide
    -- registrar una venta que ya hizo en la calle, deja de usar el sistema.
    insert into movimientos_stock
      (id, negocio_id, producto_id, ubicacion, cantidad, tipo, ref_tipo, ref_id, fecha, creado_por)
    values
      (gen_random_uuid(), p_negocio_id, (v_item->>'producto_id')::uuid, 'deposito',
       -(v_item->>'cantidad')::integer, 'venta', 'venta', p_id, p_fecha, auth.uid());

    v_total := v_total + v_precio * (v_item->>'cantidad')::integer;
  end loop;

  v_cobrado := case
    when p_cobrado_cent is not null then least(p_cobrado_cent, v_total)
    when p_forma_pago = 'cuenta'    then 0
    else v_total
  end;

  update ventas
     set total_cent = v_total, cobrado_cent = v_cobrado
   where id = p_id
  returning * into v_venta;

  return v_venta;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Bajar del auto lo que haya quedado arriba
-- ---------------------------------------------------------------------------
-- Dos asientos por producto: uno que saca del vehículo y otro que entra al
-- depósito, la misma cantidad. El total por producto no se mueve.
--
-- `where saldo <> 0` cubre los dos casos: las unidades que quedaron arriba del
-- auto (saldo positivo) y también un vehículo en negativo, que es lo que deja
-- una venta registrada sin haber cargado nada. Los dos terminan en cero.
--
-- Es idempotente por construcción: después de correrla no queda ningún
-- producto con saldo distinto de cero en 'vehiculo', así que una segunda
-- corrida no inserta nada.
with saldos as (
  select negocio_id,
         producto_id,
         sum(cantidad) as saldo
    from movimientos_stock
   where ubicacion = 'vehiculo'
   group by negocio_id, producto_id
  having sum(cantidad) <> 0
)
insert into movimientos_stock
  (id, negocio_id, producto_id, ubicacion, cantidad, tipo, fecha, nota)
select gen_random_uuid(), s.negocio_id, s.producto_id, u.ubicacion, u.cantidad,
       'traslado', now(),
       'Cierre del stock del vehículo: se unifica en un solo stock (migración 009)'
  from saldos s
 cross join lateral (
   values ('vehiculo', (-s.saldo)::integer),
          ('deposito', ( s.saldo)::integer)
 ) as u(ubicacion, cantidad);

-- ---------------------------------------------------------------------------
-- Para confirmar que quedó, en una consulta nueva:
--
--   select count(*) as todavia_en_el_auto
--     from (select producto_id
--             from movimientos_stock
--            where ubicacion = 'vehiculo'
--            group by negocio_id, producto_id
--           having sum(cantidad) <> 0) x;
--
-- Tiene que devolver 0.
-- ---------------------------------------------------------------------------
