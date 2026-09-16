-- 003_funciones.sql
-- Las operaciones que NO son un insert simple viven acá, del lado del servidor,
-- porque necesitan una transacción. Todo lo demás el cliente lo inserta directo
-- desde la cola de salida.
--
-- Todas las funciones son IDEMPOTENTES por el id que manda el dispositivo:
-- reintentar la misma operación diez veces produce el mismo resultado que una.

begin;

-- ---------------------------------------------------------------------------
-- Cambiar el precio de venta.
-- Cierra la fila vigente y abre la nueva, en una sola transacción.
-- Nunca hace UPDATE del precio.
-- ---------------------------------------------------------------------------
create or replace function cambiar_precio(
  p_id           uuid,          -- id de la fila nueva, generado en el dispositivo
  p_producto_id  uuid,
  p_lista_id     uuid,
  p_precio_cent  bigint,
  p_origen       text default 'manual',
  p_motivo       text default null
) returns precios_venta
language plpgsql security invoker as $$
declare
  v_fila  precios_venta;
  v_ahora timestamptz := now();
begin
  -- Idempotencia: si ya se aplicó este cambio, devolver el resultado anterior.
  select * into v_fila from precios_venta where id = p_id;
  if found then
    return v_fila;
  end if;

  if p_precio_cent <= 0 then
    raise exception 'El precio tiene que ser mayor a cero';
  end if;

  -- Cerrar el vigente. Si no hay ninguno (producto nuevo), no pasa nada.
  update precios_venta
     set vigente_hasta = v_ahora
   where producto_id = p_producto_id
     and lista_id    = p_lista_id
     and vigente_hasta is null;

  insert into precios_venta
    (id, producto_id, lista_id, precio_cent, vigente_desde, origen, motivo, creado_por)
  values
    (p_id, p_producto_id, p_lista_id, p_precio_cent, v_ahora, p_origen, p_motivo, auth.uid())
  returning * into v_fila;

  return v_fila;
end $$;

-- ---------------------------------------------------------------------------
-- Registrar una venta completa: cabecera, líneas y movimientos de stock.
-- El precio y el costo se congelan acá dentro, tomados de las vistas vigentes.
--
-- p_items: jsonb [{ "producto_id": uuid, "cantidad": int }]
-- El cliente NO manda el precio: lo resuelve el servidor, así no hay forma de
-- que una app desactualizada escriba un precio que no existe.
-- Excepción: si el dispositivo vendió sin conexión con un precio que después
-- cambió, manda "precio_cent" explícito y se respeta ese, porque es el precio
-- con el que efectivamente vendió. Eso es correcto, no un error a corregir.
-- ---------------------------------------------------------------------------
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

    -- Sale del vehículo, que es de donde vende.
    -- Se permite que el stock quede negativo: si el sistema le impide registrar
    -- una venta que ya hizo en la calle, deja de usar el sistema.
    insert into movimientos_stock
      (id, negocio_id, producto_id, ubicacion, cantidad, tipo, ref_tipo, ref_id, fecha, creado_por)
    values
      (gen_random_uuid(), p_negocio_id, (v_item->>'producto_id')::uuid, 'vehiculo',
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
-- Registrar una compra: entra mercadería al depósito y, si algún costo subió,
-- deja una sugerencia de precio PENDIENTE. Nunca cambia el precio sola.
--
-- p_items: jsonb [{ "producto_id": uuid, "cantidad": int, "costo_unitario_cent": bigint }]
-- ---------------------------------------------------------------------------
create or replace function registrar_compra(
  p_id             uuid,
  p_negocio_id     uuid,
  p_proveedor_id   uuid,
  p_items          jsonb,
  p_condicion_pago text,
  p_fecha          timestamptz default now(),
  p_nota           text default null
) returns compras
language plpgsql security invoker as $$
declare
  v_compra   compras;
  v_item     jsonb;
  v_total    bigint := 0;
  v_prod     uuid;
  v_costo_n  bigint;
  v_costo_a  bigint;
  v_lista    uuid;
  v_precio   bigint;
  v_sug      bigint;
begin
  select * into v_compra from compras where id = p_id;
  if found then
    return v_compra;                              -- idempotencia
  end if;

  v_lista := (select id from listas_precio where negocio_id = p_negocio_id and es_default limit 1);

  insert into compras (id, negocio_id, proveedor_id, fecha, condicion_pago,
                       total_cent, nota, creado_por)
  values (p_id, p_negocio_id, p_proveedor_id, p_fecha, p_condicion_pago, 0, p_nota, auth.uid())
  returning * into v_compra;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_prod    := (v_item->>'producto_id')::uuid;
    v_costo_n := (v_item->>'costo_unitario_cent')::bigint;

    -- Costo anterior ANTES de insertar esta compra.
    select costo_unitario_cent into v_costo_a from v_costo_ultimo where producto_id = v_prod;

    insert into compra_items (id, compra_id, producto_id, cantidad, costo_unitario_cent)
    values (gen_random_uuid(), p_id, v_prod,
            (v_item->>'cantidad')::integer, v_costo_n);

    insert into movimientos_stock
      (id, negocio_id, producto_id, ubicacion, cantidad, tipo, ref_tipo, ref_id, fecha, creado_por)
    values
      (gen_random_uuid(), p_negocio_id, v_prod, 'deposito',
       (v_item->>'cantidad')::integer, 'compra', 'compra', p_id, p_fecha, auth.uid());

    v_total := v_total + v_costo_n * (v_item->>'cantidad')::integer;

    -- ¿Subió el costo? Entonces dejamos una sugerencia, no un cambio.
    if v_lista is not null and v_costo_a is not null and v_costo_n > v_costo_a then
      select precio_cent into v_precio from v_precio_vigente
       where producto_id = v_prod and lista_id = v_lista;

      if v_precio is not null then
        -- Mantener el margen sobre venta, redondeado a $100 (10000 centavos).
        v_sug := round((v_precio::numeric * v_costo_n / v_costo_a) / 10000) * 10000;

        insert into sugerencias_precio
          (id, negocio_id, producto_id, lista_id, costo_anterior_cent, costo_nuevo_cent,
           precio_vigente_cent, precio_sugerido_cent, base_calculo, origen_compra_id)
        values
          (gen_random_uuid(), p_negocio_id, v_prod, v_lista, v_costo_a, v_costo_n,
           v_precio, v_sug, 'margen', p_id)
        on conflict (producto_id, lista_id) where estado = 'pendiente'
        do update set costo_nuevo_cent     = excluded.costo_nuevo_cent,
                      precio_sugerido_cent = excluded.precio_sugerido_cent,
                      origen_compra_id     = excluded.origen_compra_id,
                      creada_en            = now();
      end if;
    end if;
  end loop;

  update compras set total_cent = v_total where id = p_id returning * into v_compra;
  return v_compra;
end $$;

-- ---------------------------------------------------------------------------
-- Aplicar una sugerencia de precio. Requiere confirmación explícita del usuario:
-- esta función solo se llama desde el botón "Sí, actualizá mis precios".
-- ---------------------------------------------------------------------------
create or replace function aplicar_sugerencia(
  p_sugerencia_id uuid,
  p_precio_id     uuid,                    -- id de la fila nueva de precios_venta
  p_precio_cent   bigint default null      -- si el usuario editó el número sugerido
) returns precios_venta
language plpgsql security invoker as $$
declare
  v_sug  sugerencias_precio;
  v_fila precios_venta;
begin
  select * into v_sug from sugerencias_precio where id = p_sugerencia_id;
  if not found then
    raise exception 'La sugerencia no existe';
  end if;
  if v_sug.estado <> 'pendiente' then
    return (select * from precios_venta where id = p_precio_id);   -- idempotencia
  end if;

  v_fila := cambiar_precio(
    p_precio_id, v_sug.producto_id, v_sug.lista_id,
    coalesce(p_precio_cent, v_sug.precio_sugerido_cent),
    'sugerido', 'aumento de costo'
  );

  update sugerencias_precio
     set estado = 'aplicada', resuelta_en = now()
   where id = p_sugerencia_id;

  return v_fila;
end $$;

-- ---------------------------------------------------------------------------
-- Trasladar stock de la casa al auto (cargar el auto) o al revés.
-- Dos movimientos, una transacción.
-- ---------------------------------------------------------------------------
create or replace function trasladar_stock(
  p_id          uuid,
  p_negocio_id  uuid,
  p_producto_id uuid,
  p_cantidad    integer,                   -- > 0: casa -> auto ; < 0: auto -> casa
  p_fecha       timestamptz default now()
) returns void
language plpgsql security invoker as $$
declare
  v_origen  text;
  v_destino text;
begin
  if exists (select 1 from movimientos_stock where id = p_id) then
    return;                                                        -- idempotencia
  end if;
  if p_cantidad = 0 then
    return;
  end if;

  if p_cantidad > 0 then v_origen := 'deposito'; v_destino := 'vehiculo';
  else                   v_origen := 'vehiculo'; v_destino := 'deposito';
  end if;

  insert into movimientos_stock
    (id, negocio_id, producto_id, ubicacion, cantidad, tipo, fecha, creado_por)
  values
    (p_id, p_negocio_id, p_producto_id, v_origen, -abs(p_cantidad), 'traslado', p_fecha, auth.uid()),
    (gen_random_uuid(), p_negocio_id, p_producto_id, v_destino, abs(p_cantidad), 'traslado', p_fecha, auth.uid());
end $$;

commit;
