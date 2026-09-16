-- ============================================================================
-- Pompi Mayorista — esquema completo (migraciones 001 a 004, en un solo archivo)
--
-- Cómo aplicarlo:  Supabase → SQL Editor → New query → pegar todo → Run.
-- Se corre UNA vez, sobre una base vacía.
--
-- NO incluye 005_datos_iniciales.sql, a propósito: ese necesita el uuid del
-- usuario de Supabase Auth y el nombre real del negocio, así que se corre
-- aparte y con esos dos valores reemplazados.
--
-- No editar este archivo: editar los de db/migrations/ y regenerarlo.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- 001_esquema.sql
-- ─────────────────────────────────────────────────────────────────────────

-- 001_esquema.sql
-- Gestión Pompi Mascotas — esquema base
--
-- REGLA 0: nada se pisa, todo se apila.
-- Stock, costo y precio de venta NO son columnas mutables.
--   stock  = suma de movimientos_stock
--   costo  = costo_unitario de la última compra (inmutable en compra_items)
--   precio = fila vigente en precios_venta
--
-- Todos los importes son ENTEROS DE CENTAVOS (bigint). Nunca numeric con decimales, nunca float.

begin;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Negocio (preparado para multi-cliente desde el día uno; hoy hay uno solo)
-- ---------------------------------------------------------------------------
create table negocios (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  moneda       char(3) not null default 'ARS',
  zona_horaria text not null default 'America/Argentina/Buenos_Aires',
  creado_en    timestamptz not null default now()
);

create table usuarios_negocio (
  negocio_id uuid not null references negocios(id) on delete cascade,
  user_id    uuid not null,                   -- auth.users.id de Supabase
  rol        text not null default 'dueno' check (rol in ('dueno','vendedor')),
  creado_en  timestamptz not null default now(),
  primary key (negocio_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
create table proveedores (
  id          uuid primary key,
  negocio_id  uuid not null references negocios(id) on delete cascade,
  nombre      text not null,
  rubro       text,
  contacto    text,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table clientes (
  id          uuid primary key,
  negocio_id  uuid not null references negocios(id) on delete cascade,
  nombre      text not null,
  zona        text,
  dia_visita  smallint check (dia_visita between 0 and 6),  -- 0 = domingo
  contacto    text,
  -- Plazo de pago acordado con este cliente; NULL usa el default del negocio.
  -- El umbral de "deuda vieja" lo define el cliente en la reunión (pregunta 18).
  plazo_dias  smallint,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table productos (
  id            uuid primary key,
  negocio_id    uuid not null references negocios(id) on delete cascade,
  nombre        text not null,
  variante      text,
  categoria     text,
  proveedor_id  uuid references proveedores(id),
  -- Unidad de venta. Si el cliente compra por bulto y vende suelto (pregunta 2),
  -- acá entra un factor de conversión en una migración posterior.
  unidad        text not null default 'unidad',
  -- Cuánto conviene llevar en el auto para una ruta típica. Es una PREFERENCIA,
  -- no stock: dice cuánto querría tener arriba, no cuánto hay. Lo que hay sale
  -- de sumar movimientos_stock, como siempre.
  sugerido_en_vehiculo  integer check (sugerido_en_vehiculo >= 0),
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
  -- SIN columnas de stock, costo ni precio. A propósito.
);

create index on productos (negocio_id) where activo;
create index on clientes   (negocio_id) where activo;

-- ---------------------------------------------------------------------------
-- Listas de precios
-- Existe desde el día uno aunque hoy haya una sola: agregarla después obliga a
-- migrar datos vivos (ver pregunta 1 de docs/preguntas-cliente-martes.md).
-- ---------------------------------------------------------------------------
create table listas_precio (
  id          uuid primary key,
  negocio_id  uuid not null references negocios(id) on delete cascade,
  nombre      text not null,
  es_default  boolean not null default false,
  creado_en   timestamptz not null default now()
);

create unique index una_lista_default_por_negocio
  on listas_precio (negocio_id) where es_default;

-- ---------------------------------------------------------------------------
-- Precios de venta — append-only con vigencia
-- ---------------------------------------------------------------------------
create table precios_venta (
  id             uuid primary key,
  producto_id    uuid not null references productos(id) on delete cascade,
  lista_id       uuid not null references listas_precio(id),
  precio_cent    bigint not null check (precio_cent > 0),
  vigente_desde  timestamptz not null default now(),
  vigente_hasta  timestamptz,                  -- NULL = precio actual
  origen         text not null default 'manual'
                 check (origen in ('manual','sugerido','importado')),
  motivo         text,
  creado_por     uuid,
  creado_en      timestamptz not null default now(),
  check (vigente_hasta is null or vigente_hasta > vigente_desde)
);

-- ESTA es la garantía estructural de que no se superponen precios.
create unique index un_precio_vigente_por_producto_y_lista
  on precios_venta (producto_id, lista_id) where vigente_hasta is null;

create index on precios_venta (producto_id, vigente_desde desc);

-- ---------------------------------------------------------------------------
-- Compras — de acá sale el costo, y es inmutable
-- ---------------------------------------------------------------------------
create table compras (
  id              uuid primary key,
  negocio_id      uuid not null references negocios(id) on delete cascade,
  proveedor_id    uuid not null references proveedores(id),
  fecha           timestamptz not null default now(),
  condicion_pago  text not null check (condicion_pago in ('contado','cuenta')),
  total_cent      bigint not null check (total_cent >= 0),
  nota            text,
  creado_por      uuid,
  creado_en       timestamptz not null default now()
);

create table compra_items (
  id             uuid primary key,
  compra_id      uuid not null references compras(id) on delete cascade,
  producto_id    uuid not null references productos(id),
  cantidad       integer not null check (cantidad > 0),
  costo_unitario_cent bigint not null check (costo_unitario_cent >= 0)
);

create index on compra_items (producto_id);
create index on compras (negocio_id, fecha desc);

-- ---------------------------------------------------------------------------
-- Ventas — con precio Y costo congelados en el momento
-- ---------------------------------------------------------------------------
create table ventas (
  id           uuid primary key,              -- uuid v7 generado en el dispositivo
  negocio_id   uuid not null references negocios(id) on delete cascade,
  cliente_id   uuid not null references clientes(id),
  fecha        timestamptz not null default now(),
  total_cent   bigint not null check (total_cent >= 0),
  forma_pago   text not null
               check (forma_pago in ('efectivo','transferencia','cuenta','mixto')),
  cobrado_cent bigint not null default 0 check (cobrado_cent >= 0),
  nota         text,
  creado_por   uuid,
  creado_en    timestamptz not null default now(),
  check (cobrado_cent <= total_cent)
);

create table venta_items (
  id                  uuid primary key,
  venta_id            uuid not null references ventas(id) on delete cascade,
  producto_id         uuid not null references productos(id),
  cantidad            integer not null check (cantidad > 0),
  precio_unitario_cent bigint not null check (precio_unitario_cent >= 0),
  -- Costo vigente al momento de vender. Desnormalización deliberada:
  -- es lo que hace que la ganancia de una venta vieja no se mueva nunca más.
  costo_unitario_cent  bigint not null check (costo_unitario_cent >= 0)
);

create index on ventas (negocio_id, fecha desc);
create index on ventas (cliente_id, fecha desc);
create index on venta_items (producto_id);

-- ---------------------------------------------------------------------------
-- Movimientos de stock — el libro mayor
-- ---------------------------------------------------------------------------
create table movimientos_stock (
  id           uuid primary key,              -- uuid v7 generado en el dispositivo
  negocio_id   uuid not null references negocios(id) on delete cascade,
  producto_id  uuid not null references productos(id),
  ubicacion    text not null check (ubicacion in ('deposito','vehiculo')),
  cantidad     integer not null check (cantidad <> 0),   -- + entra, - sale
  tipo         text not null check (tipo in
                 ('compra','venta','traslado','ajuste','devolucion','rotura')),
  ref_tipo     text check (ref_tipo in ('compra','venta','ajuste')),
  ref_id       uuid,
  fecha        timestamptz not null default now(),
  nota         text,
  creado_por   uuid,
  creado_en    timestamptz not null default now()
);

create index on movimientos_stock (negocio_id, producto_id, ubicacion);
create index on movimientos_stock (ref_tipo, ref_id);
create index on movimientos_stock (negocio_id, fecha desc);

-- ---------------------------------------------------------------------------
-- Cuentas corrientes — las dos puntas
-- ---------------------------------------------------------------------------
create table pagos_cliente (
  id          uuid primary key,
  negocio_id  uuid not null references negocios(id) on delete cascade,
  cliente_id  uuid not null references clientes(id),
  monto_cent  bigint not null check (monto_cent > 0),
  fecha       timestamptz not null default now(),
  medio       text not null check (medio in ('efectivo','transferencia','cheque','otro')),
  -- Para cheques: cuándo se cobra de verdad (pregunta 16).
  fecha_acreditacion date,
  nota        text,
  creado_por  uuid,
  creado_en   timestamptz not null default now()
);

create table pagos_proveedor (
  id            uuid primary key,
  negocio_id    uuid not null references negocios(id) on delete cascade,
  proveedor_id  uuid not null references proveedores(id),
  monto_cent    bigint not null check (monto_cent > 0),
  fecha         timestamptz not null default now(),
  medio         text not null check (medio in ('efectivo','transferencia','cheque','otro')),
  nota          text,
  creado_por    uuid,
  creado_en     timestamptz not null default now()
);

create index on pagos_cliente   (cliente_id, fecha desc);
create index on pagos_proveedor (proveedor_id, fecha desc);

-- ---------------------------------------------------------------------------
-- Sugerencias de precio — la sugerencia es una fila, no un cálculo al vuelo
-- ---------------------------------------------------------------------------
create table sugerencias_precio (
  id                   uuid primary key,
  negocio_id           uuid not null references negocios(id) on delete cascade,
  producto_id          uuid not null references productos(id) on delete cascade,
  lista_id             uuid not null references listas_precio(id),
  costo_anterior_cent  bigint not null,
  costo_nuevo_cent     bigint not null,
  precio_vigente_cent  bigint not null,
  precio_sugerido_cent bigint not null,
  base_calculo         text not null default 'margen'
                       check (base_calculo in ('margen','markup','manual')),
  estado               text not null default 'pendiente'
                       check (estado in ('pendiente','aplicada','descartada')),
  origen_compra_id     uuid references compras(id),
  creada_en            timestamptz not null default now(),
  resuelta_en          timestamptz,
  check (estado = 'pendiente' or resuelta_en is not null)
);

-- Una sola sugerencia pendiente por producto y lista: si llega otra compra más
-- cara antes de que resuelva la anterior, se reemplaza, no se acumulan.
create unique index una_sugerencia_pendiente
  on sugerencias_precio (producto_id, lista_id) where estado = 'pendiente';

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- 002_vistas.sql
-- ─────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────
-- 003_funciones.sql
-- ─────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────
-- 004_rls.sql
-- ─────────────────────────────────────────────────────────────────────────

-- 004_rls.sql
-- Seguridad a nivel de fila. Cada usuario solo ve los datos de su negocio.
-- Esto está desde el día uno aunque hoy haya un solo cliente: activarlo después,
-- con datos adentro, es una migración riesgosa y fácil de hacer mal.

begin;

-- Helper: ¿a qué negocios pertenece el usuario actual?
create or replace function negocios_del_usuario()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select negocio_id from usuarios_negocio where user_id = auth.uid();
$$;

alter table negocios           enable row level security;
alter table usuarios_negocio   enable row level security;
alter table proveedores        enable row level security;
alter table clientes           enable row level security;
alter table productos          enable row level security;
alter table listas_precio      enable row level security;
alter table precios_venta      enable row level security;
alter table compras            enable row level security;
alter table compra_items       enable row level security;
alter table ventas             enable row level security;
alter table venta_items        enable row level security;
alter table movimientos_stock  enable row level security;
alter table pagos_cliente      enable row level security;
alter table pagos_proveedor    enable row level security;
alter table sugerencias_precio enable row level security;

-- Tablas con negocio_id directo: una política para todo.
do $$
declare t text;
begin
  foreach t in array array[
    'proveedores','clientes','productos','listas_precio','compras','ventas',
    'movimientos_stock','pagos_cliente','pagos_proveedor','sugerencias_precio'
  ] loop
    execute format($f$
      create policy %1$s_del_negocio on %1$I
        for all
        using      (negocio_id in (select negocios_del_usuario()))
        with check (negocio_id in (select negocios_del_usuario()));
    $f$, t);
  end loop;
end $$;

-- Tablas hijas: heredan el permiso del padre.
create policy precios_del_negocio on precios_venta
  for all
  using (exists (
    select 1 from productos p
     where p.id = precios_venta.producto_id
       and p.negocio_id in (select negocios_del_usuario())))
  with check (exists (
    select 1 from productos p
     where p.id = precios_venta.producto_id
       and p.negocio_id in (select negocios_del_usuario())));

create policy compra_items_del_negocio on compra_items
  for all
  using (exists (
    select 1 from compras c
     where c.id = compra_items.compra_id
       and c.negocio_id in (select negocios_del_usuario())))
  with check (exists (
    select 1 from compras c
     where c.id = compra_items.compra_id
       and c.negocio_id in (select negocios_del_usuario())));

create policy venta_items_del_negocio on venta_items
  for all
  using (exists (
    select 1 from ventas v
     where v.id = venta_items.venta_id
       and v.negocio_id in (select negocios_del_usuario())))
  with check (exists (
    select 1 from ventas v
     where v.id = venta_items.venta_id
       and v.negocio_id in (select negocios_del_usuario())));

create policy negocios_propios on negocios
  for select using (id in (select negocios_del_usuario()));

create policy membresia_propia on usuarios_negocio
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Inmutabilidad del libro mayor.
-- No se borra ni se modifica un movimiento: se corrige con un movimiento nuevo
-- de tipo 'ajuste'. Esto lo garantiza la base, no la buena voluntad del código.
-- ---------------------------------------------------------------------------
create or replace function bloquear_modificacion()
returns trigger language plpgsql as $$
begin
  raise exception
    'Los movimientos no se modifican ni se borran. Registrá un ajuste en su lugar.';
end $$;

create trigger movimientos_inmutables
  before update or delete on movimientos_stock
  for each row execute function bloquear_modificacion();

create trigger compra_items_inmutables
  before update or delete on compra_items
  for each row execute function bloquear_modificacion();

create trigger venta_items_inmutables
  before update or delete on venta_items
  for each row execute function bloquear_modificacion();

-- precios_venta sí admite UPDATE, pero solo para cerrar la vigencia.
-- Cualquier otro cambio queda bloqueado.
create or replace function solo_cerrar_vigencia()
returns trigger language plpgsql as $$
begin
  if new.precio_cent    is distinct from old.precio_cent
  or new.producto_id    is distinct from old.producto_id
  or new.lista_id       is distinct from old.lista_id
  or new.vigente_desde  is distinct from old.vigente_desde then
    raise exception
      'Un precio no se edita. Cerrá el vigente e insertá uno nuevo (usá cambiar_precio).';
  end if;
  if old.vigente_hasta is not null then
    raise exception 'Ese precio ya estaba cerrado.';
  end if;
  return new;
end $$;

create trigger precios_solo_cierre
  before update on precios_venta
  for each row execute function solo_cerrar_vigencia();

create trigger precios_no_borrar
  before delete on precios_venta
  for each row execute function bloquear_modificacion();

commit;
