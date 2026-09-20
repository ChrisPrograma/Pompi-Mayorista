-- ===========================================================================
-- 011 · Anular una venta
-- ===========================================================================
--
-- La contracara de la 010. Misma mecánica, más consecuencias: una venta toca el
-- stock, la caja del día y la cuenta corriente del comercio, mientras que una
-- compra tocaba stock y deuda con el proveedor.
--
-- QUÉ SIGNIFICA "ANULAR" ACÁ
--
-- Lo mismo que en la 010, y por el mismo motivo: `venta_items` y
-- `movimientos_stock` tienen triggers de inmutabilidad. La base **impide**
-- modificarlos o borrarlos. Un error se corrige apilando un asiento que lo
-- compensa, no borrando el anterior.
--
--   1. Un movimiento de stock por renglón, en POSITIVO: la mercadería vuelve.
--      Es el espejo exacto de la 010, donde iban en negativo.
--   2. `anulada_en` en la cabecera, que no tiene trigger. La fila sigue entera:
--      su fecha, su comercio, su total, su cobrado y sus renglones.
--
-- QUÉ ARRASTRA, Y DÓNDE SE VE
--
--   - **Stock**: vuelve lo que había salido.
--   - **"Cobré hoy"**: ese indicador suma el `cobrado_cent` de las ventas del
--     día. Una venta anulada deja de sumar, así que la caja del día baja sola.
--   - **"Me deben"**: la deuda de un comercio es `total − cobrado` de sus ventas
--     menos sus pagos. Una venta anulada sale de esa cuenta, así que la deuda
--     vuelve a lo que era. Vale para una venta a cuenta y también para un pago
--     parcial, donde había las dos cosas.
--   - **La ganancia del mes**: deja de contar. La venta no existió.
--
-- LO QUE NO TOCA, A PROPÓSITO
--
-- Los pagos que ese comercio haya hecho (`pagos_cliente`) NO se borran: son
-- plata que entró de verdad y tiene su propio asiento. Si el comercio había
-- pagado esa venta por separado y después se anula, ese pago queda a cuenta de
-- lo que deba, que es lo correcto.
--
-- Y el costo congelado en cada renglón de la venta se queda donde está. Es
-- histórico: dice a cuánto le había costado esa mercadería en ese momento.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. La marca
-- ---------------------------------------------------------------------------
alter table ventas add column if not exists anulada_en timestamptz;

comment on column ventas.anulada_en is
  'Cuándo se anuló esta venta, o NULL si sigue valiendo. La fila NO se borra: '
  'los renglones y los movimientos de stock son inmutables y la anulación se '
  'asienta con movimientos de ajuste que devuelven la mercadería.';

create index if not exists ventas_anuladas on ventas (negocio_id) where anulada_en is not null;

-- ---------------------------------------------------------------------------
-- 2. La función
-- ---------------------------------------------------------------------------
create or replace function anular_venta(
  p_id     uuid,
  p_fecha  timestamptz default now()
) returns ventas
language plpgsql security invoker as $$
declare
  v_venta ventas;
  v_item  venta_items;
begin
  select * into v_venta from ventas where id = p_id;

  if not found then
    raise exception 'Esa venta no existe';
  end if;

  -- Idempotencia, igual que en `anular_compra`. La cola de la app reintenta
  -- sola cuando vuelve la señal, así que esta función se puede llamar dos veces
  -- con el mismo id. La segunda no puede devolver la mercadería otra vez: eso
  -- inflaría el stock y el error sería invisible hasta contar las cajas.
  if v_venta.anulada_en is not null then
    return v_venta;
  end if;

  for v_item in select * from venta_items where venta_id = p_id loop
    insert into movimientos_stock
      (id, negocio_id, producto_id, ubicacion, cantidad, tipo, ref_tipo, ref_id, fecha, nota, creado_por)
    values
      (gen_random_uuid(), v_venta.negocio_id, v_item.producto_id, 'deposito',
       v_item.cantidad, 'ajuste', 'venta', p_id, p_fecha,
       'Anulación de la venta', auth.uid());
  end loop;

  update ventas set anulada_en = p_fecha where id = p_id
  returning * into v_venta;

  return v_venta;
end $$;

comment on function anular_venta(uuid, timestamptz) is
  'Anula una venta: devuelve la mercadería al stock con movimientos de ajuste y '
  'marca la venta. La venta deja de contar en la caja del día, en la deuda del '
  'comercio y en la ganancia. Idempotente.';

commit;

-- ---------------------------------------------------------------------------
-- Para confirmar que quedó, en una consulta nueva:
--
--   select count(*) as columna
--     from information_schema.columns
--    where table_name = 'ventas' and column_name = 'anulada_en';
--
--   select count(*) as funcion
--     from pg_proc where proname = 'anular_venta';
--
-- Las dos tienen que devolver 1.
-- ---------------------------------------------------------------------------
