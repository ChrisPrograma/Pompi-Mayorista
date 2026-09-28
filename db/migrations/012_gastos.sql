-- ===========================================================================
-- 012 · Gastos operativos
-- ===========================================================================
--
-- Lo que faltaba para que la app pueda decir cuánta plata queda de verdad.
--
-- Hasta acá el sistema registraba lo que ENTRA (ventas, cobros) y lo que sale
-- en mercadería (compras), pero no lo que se gasta en hacer funcionar el
-- negocio: el flete, la nafta, las bolsas, el viático. Para un mayorista que
-- reparte en la calle eso no es un detalle — es la diferencia entre la ganancia
-- que la app muestra y la plata que de verdad le queda en el bolsillo.
--
-- UN GASTO ES UN HECHO, NO UN DATO
--
-- Rige la REGLA 0 igual que para todo lo demás: la fila no se edita ni se
-- borra. Si se cargó mal, se ANULA (`anulada_en`) y se vuelve a cargar. Así el
-- informe de un mes cerrado no cambia porque alguien corrigió algo en octubre.
--
-- POR QUÉ LOS ids VIENEN DEL APARATO
--
-- Porque el 25/09 esto costó caro. `registrar_compra` creaba los renglones y
-- los movimientos con `gen_random_uuid()`, mientras el aparato ya los había
-- creado con los suyos para poder mostrar el stock sin señal. Al bajar, la
-- unión por id veía dos filas distintas y las conservaba las dos: **cada
-- movimiento contaba doble** en el aparato que lo había creado.
--
-- Un gasto es una sola fila y comparte `p_id` con el aparato, así que el
-- problema no se puede dar. Queda escrito igual para que nadie agregue después
-- una fila hija generada acá adentro sin darse cuenta de lo que implica.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------
create table if not exists gastos (
  id          uuid primary key,
  negocio_id  uuid not null references negocios(id) on delete cascade,

  -- Importe en centavos ENTEROS, como toda la plata del sistema. Nunca float.
  monto_cent  bigint not null check (monto_cent > 0),

  /*
   * Las cinco categorías salen de cómo trabaja él, no de un plan de cuentas.
   * Son pocas a propósito: una lista larga hace que termine eligiendo siempre
   * "otros", y entonces el desglose no dice nada.
   *
   * Es un `check` y no una tabla aparte porque no cambian solas: agregar una
   * categoría es una decisión de producto y merece una migración que se vea.
   */
  categoria   text not null check (categoria in (
    'flete',         -- fletes y envíos
    'combustible',   -- nafta, peajes, el vehículo
    'empaque',       -- bolsas, cajas, cinta
    'insumos',       -- servicios e insumos del negocio
    'otros'          -- mantenimiento y lo que no entra arriba
  )),

  -- "Nafta YPF viaje a Corrientes". Opcional: obligarlo a escribir algo en cada
  -- carga rápida es la forma más segura de que deje de cargar gastos.
  nota        text,

  medio       text not null check (medio in ('efectivo','transferencia','cheque','otro')),
  fecha       timestamptz not null default now(),

  /*
   * Cuándo se anuló, o NULL si sigue valiendo. La fila NO se borra: un gasto
   * anulado sigue estando, tachado, y deja de contar en la caja y en la
   * ganancia neta.
   */
  anulada_en  timestamptz,

  creado_por  uuid,
  creado_en   timestamptz not null default now()
);

comment on table gastos is
  'Gastos operativos del negocio: fletes, combustible, empaque, insumos. '
  'Append-only: se anulan con anulada_en, nunca se editan ni se borran.';

-- Los informes preguntan siempre "los gastos de este período", así que el
-- índice va por negocio y fecha.
create index if not exists gastos_por_fecha on gastos (negocio_id, fecha desc);

-- Índice parcial de los anulados: son pocos y se consultan aparte.
create index if not exists gastos_anulados on gastos (negocio_id) where anulada_en is not null;


-- ---------------------------------------------------------------------------
-- 2. Seguridad por fila — el mismo patrón que el resto
-- ---------------------------------------------------------------------------
alter table gastos enable row level security;

drop policy if exists gastos_del_negocio on gastos;
create policy gastos_del_negocio on gastos
  for all
  using      (negocio_id in (select negocios_del_usuario()))
  with check (negocio_id in (select negocios_del_usuario()));


-- ---------------------------------------------------------------------------
-- 3. Registrar un gasto
-- ---------------------------------------------------------------------------
-- `security invoker` como el resto del sistema: corre con el usuario que llama
-- y RLS decide. `set search_path` fijo, que es lo que pide el linter de Supabase
-- para cualquier función con privilegios.
create or replace function registrar_gasto(
  p_id         uuid,
  p_negocio_id uuid,
  p_monto_cent bigint,
  p_categoria  text,
  p_medio      text default 'efectivo',
  p_nota       text default null,
  p_fecha      timestamptz default now()
) returns gastos
language plpgsql security invoker
set search_path to 'public' as $$
declare v_gasto gastos;
begin
  /*
   * Idempotencia. La app sube desde una cola que reintenta cuando vuelve la
   * señal, así que esta función se puede llamar dos veces con el mismo id. La
   * segunda tiene que devolver el gasto que ya está, no cargar otro: un gasto
   * duplicado se descuenta dos veces de la caja y el error es invisible hasta
   * que alguien suma los tickets a mano.
   */
  select * into v_gasto from gastos where id = p_id;
  if found then
    return v_gasto;
  end if;

  insert into gastos (id, negocio_id, monto_cent, categoria, medio, nota, fecha, creado_por)
  values (p_id, p_negocio_id, p_monto_cent, p_categoria, p_medio,
          nullif(btrim(coalesce(p_nota, '')), ''), p_fecha, auth.uid())
  returning * into v_gasto;

  return v_gasto;
end $$;

comment on function registrar_gasto(uuid, uuid, bigint, text, text, text, timestamptz) is
  'Registra un gasto operativo. Idempotente: llamarla dos veces con el mismo id '
  'devuelve el gasto ya cargado y no lo duplica.';


-- ---------------------------------------------------------------------------
-- 4. Anular un gasto
-- ---------------------------------------------------------------------------
-- No hay nada que compensar: un gasto no mueve stock ni deuda, solo plata. Con
-- marcar la cabecera alcanza, y la fila queda entera para poder mirarla.
create or replace function anular_gasto(
  p_id    uuid,
  p_fecha timestamptz default now()
) returns gastos
language plpgsql security invoker
set search_path to 'public' as $$
declare v_gasto gastos;
begin
  select * into v_gasto from gastos where id = p_id;

  if not found then
    raise exception 'Ese gasto no existe';
  end if;

  -- Idempotencia, igual que arriba: anular dos veces no cambia la fecha de
  -- anulación, que es la que ordena el bloque de anulados.
  if v_gasto.anulada_en is not null then
    return v_gasto;
  end if;

  update gastos set anulada_en = p_fecha where id = p_id
  returning * into v_gasto;

  return v_gasto;
end $$;

comment on function anular_gasto(uuid, timestamptz) is
  'Anula un gasto: deja de contar en la caja y en la ganancia neta. La fila no '
  'se borra. Idempotente.';


-- ---------------------------------------------------------------------------
-- 5. Para verificar que quedó bien
-- ---------------------------------------------------------------------------
-- select count(*) from gastos;                                  -- 0
-- select policyname from pg_policies where tablename = 'gastos';  -- gastos_del_negocio
-- select proname from pg_proc where proname in ('registrar_gasto','anular_gasto');
