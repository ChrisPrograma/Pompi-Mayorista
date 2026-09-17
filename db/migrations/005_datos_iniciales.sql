-- 005_datos_iniciales.sql
-- Lo mínimo para que el sistema arranque: el negocio, su lista de precios por
-- defecto y la membresía del único usuario.
--
-- Se aplica UNA vez, después de crear el usuario en Supabase Auth.
-- Reemplazá los dos valores de abajo antes de ejecutarlo.

begin;

do $$
declare
  v_negocio uuid := gen_random_uuid();
  v_lista   uuid := gen_random_uuid();
  -- CAMBIAR: el uuid del usuario creado en Supabase Auth.
  v_user    uuid := '00000000-0000-0000-0000-000000000000';
  -- CAMBIAR: el nombre real del negocio (preguntar el nombre exacto en la reunión).
  v_nombre  text := 'Pompi Mascotas';
begin
  insert into negocios (id, nombre, moneda, zona_horaria)
  values (v_negocio, v_nombre, 'ARS', 'America/Argentina/Buenos_Aires');

  insert into usuarios_negocio (negocio_id, user_id, rol)
  values (v_negocio, v_user, 'dueno');

  -- Una sola lista por ahora. Si en la reunión dice que le cobra distinto a
  -- algún cliente, se agregan más listas acá y NO hace falta ninguna migración.
  insert into listas_precio (id, negocio_id, nombre, es_default)
  values (v_lista, v_negocio, 'Mayorista', true);

  raise notice 'negocio_id = %', v_negocio;
  raise notice 'lista_id   = %', v_lista;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Parámetros de la app.
-- Están acá y no hardcodeados porque los números tienen que ser los del cliente
-- (preguntas 18 y 20 de la lista), no los que supusimos nosotros.
-- ---------------------------------------------------------------------------
begin;

create table if not exists parametros (
  negocio_id          uuid primary key references negocios(id) on delete cascade,
  -- A partir de cuántos días una deuda se marca como atrasada / muy atrasada.
  dias_atrasado       smallint not null default 15,
  dias_muy_atrasado   smallint not null default 30,
  -- Redondeo comercial de los precios sugeridos, en centavos. 10000 = $100.
  redondeo_cent       bigint   not null default 10000,
  -- Markup por defecto para productos nuevos, sin margen histórico del cual partir.
  markup_default      numeric(4,2) not null default 1.70,
  actualizado_en      timestamptz not null default now()
);

alter table parametros enable row level security;

create policy parametros_del_negocio on parametros
  for all
  using      (negocio_id in (select negocios_del_usuario()))
  with check (negocio_id in (select negocios_del_usuario()));

commit;
