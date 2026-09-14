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
