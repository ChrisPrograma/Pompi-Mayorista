-- ===========================================================================
-- 010 · Anular un ingreso de mercadería
-- ===========================================================================
--
-- Anotó una entrada que no fue: se equivocó de proveedor, puso 100 donde iban
-- 10, o cargó dos veces la misma. Hasta ahora no había forma de deshacerlo.
--
-- QUÉ SIGNIFICA "ANULAR" ACÁ
--
-- No es borrar. Los renglones de la compra (`compra_items`) y los movimientos
-- de stock tienen triggers de inmutabilidad: la base **impide** modificarlos o
-- borrarlos, y eso no es un obstáculo a sortear, es la REGLA 0 del proyecto
-- funcionando. Un error se corrige apilando un asiento que lo compensa, igual
-- que en cualquier libro contable de papel.
--
-- Anular una compra son dos cosas:
--
--   1. Un movimiento de stock por cada renglón, con la cantidad en negativo y
--      tipo 'ajuste'. La entrada sigue ahí y el ajuste también; lo que cambia
--      es la suma, que es lo que la app muestra como stock.
--
--   2. Una marca en la cabecera de la compra: `anulada_en`. La cabecera NO
--      tiene trigger de inmutabilidad —solo los renglones y los movimientos—,
--      así que se puede marcar. Y marcarla no destruye nada: la fila sigue
--      entera, con su fecha, su proveedor, su total y sus renglones. Lo único
--      que se agrega es CUÁNDO se anuló.
--
-- QUÉ ARRASTRA
--
--   - La deuda con el proveedor es la suma de sus compras en cuenta. Una compra
--     anulada deja de sumar, así que la deuda vuelve sola a lo que era.
--   - El costo de un producto es el de su última compra. Si la compra anulada
--     era la última, el costo vuelve al de la anterior. Eso cambia la ganancia
--     que muestra la app, y tiene que cambiar: el costo que estaba mostrando
--     salía de una compra que no existió.
--   - Las ventas ya hechas NO se tocan. Su costo quedó congelado en el renglón
--     de la venta, que es justamente para esto.
--
-- LO QUE NO HACE, Y CONVIENE SABERLO
--
-- Una compra al contado no descuenta plata de ninguna caja, porque la app
-- todavía no lleva la caja de los egresos (pagos a proveedores está pendiente).
-- Anularla devuelve el stock y saca el costo, pero no hay ningún número de
-- plata que revertir: nunca se había anotado ninguno.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. La marca
-- ---------------------------------------------------------------------------
-- Nace NULL en todas las filas que ya existen: ninguna compra vieja queda
-- anulada por accidente.
alter table compras add column if not exists anulada_en timestamptz;

comment on column compras.anulada_en is
  'Cuándo se anuló este ingreso, o NULL si sigue válido. La fila NO se borra: '
  'los renglones y los movimientos de stock son inmutables y la anulación se '
  'asienta con movimientos de ajuste que compensan la entrada.';

-- Las consultas que filtran por esto son "las compras que siguen valiendo", y
-- son casi todas las compras: un índice parcial sobre las anuladas es chico y
-- no estorba.
create index if not exists compras_anuladas on compras (negocio_id) where anulada_en is not null;

-- ---------------------------------------------------------------------------
-- 2. La función
-- ---------------------------------------------------------------------------
-- `security invoker` como el resto: corre con el usuario que llama, así las
-- políticas de RLS deciden si puede tocar esa compra. Una compra de otro
-- negocio simplemente no aparece.
create or replace function anular_compra(
  p_id     uuid,
  p_fecha  timestamptz default now()
) returns compras
language plpgsql security invoker as $$
declare
  v_compra compras;
  v_item   compra_items;
begin
  select * into v_compra from compras where id = p_id;

  if not found then
    raise exception 'Ese ingreso no existe';
  end if;

  -- Idempotencia. La app sube sus operaciones desde una cola que reintenta
  -- cuando vuelve la señal, así que esta función se puede llamar dos veces con
  -- el mismo id. La segunda no tiene que duplicar los ajustes de stock: eso
  -- descontaría la mercadería dos veces y el error sería invisible hasta que
  -- alguien contara las cajas.
  if v_compra.anulada_en is not null then
    return v_compra;
  end if;

  for v_item in select * from compra_items where compra_id = p_id loop
    insert into movimientos_stock
      (id, negocio_id, producto_id, ubicacion, cantidad, tipo, ref_tipo, ref_id, fecha, nota, creado_por)
    values
      (gen_random_uuid(), v_compra.negocio_id, v_item.producto_id, 'deposito',
       -v_item.cantidad, 'ajuste', 'compra', p_id, p_fecha,
       'Anulación del ingreso', auth.uid());
  end loop;

  update compras set anulada_en = p_fecha where id = p_id
  returning * into v_compra;

  return v_compra;
end $$;

comment on function anular_compra(uuid, timestamptz) is
  'Anula un ingreso de mercadería: asienta los movimientos de ajuste que '
  'compensan la entrada y marca la compra. Idempotente: llamarla dos veces '
  'con el mismo id no descuenta el stock dos veces.';

commit;

-- ---------------------------------------------------------------------------
-- Para confirmar que quedó, en una consulta nueva:
--
--   select count(*) as columna
--     from information_schema.columns
--    where table_name = 'compras' and column_name = 'anulada_en';
--
--   select count(*) as funcion
--     from pg_proc where proname = 'anular_compra';
--
-- Las dos tienen que devolver 1.
-- ---------------------------------------------------------------------------
