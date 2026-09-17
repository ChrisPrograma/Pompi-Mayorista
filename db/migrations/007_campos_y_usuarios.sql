-- 007_campos_y_usuarios.sql
--
-- Dos cosas, las dos pedidas por el cliente el 17/09/2026:
--
-- 1. Campos que faltaban en el catálogo (código de producto, descripción, rubro
--    del comercio, ubicación del proveedor).
-- 2. Que el sistema deje de tener UN dueño y pase a tener varios usuarios
--    autorizados, que el dueño da de alta desde la app.
--
-- Todo es ADITIVO. No se toca ninguna columna ni función existente de forma que
-- rompa lo que ya está cargado: las columnas nuevas nacen NULL y las filas que
-- ya existen siguen siendo válidas.

begin;

-- ---------------------------------------------------------------------------
-- 1. Campos nuevos del catálogo
-- ---------------------------------------------------------------------------

-- El código con el que él identifica cada producto en su planilla (101, 102,
-- 105…). Es TEXTO y no un número a propósito: en la planilla hay códigos que
-- podrían empezar con cero, y "0110" y "110" son dos productos distintos para
-- quien los lee. Un integer se comería ese cero sin avisar.
alter table productos add column if not exists codigo text
  check (codigo is null or codigo ~ '^[0-9]{1,10}$');

-- Descripción larga. Distinta de `variante`, que es el calificador corto
-- ("Talle 2 · surtido") y se sigue usando para detectar duplicados.
alter table productos add column if not exists descripcion text;

-- Un código no se puede repetir dentro del mismo negocio: si se repitiera, la
-- planilla y la app dejarían de poder cruzarse, que es justamente para lo que
-- existe el código. Los productos sin código no molestan (el índice los ignora).
create unique index if not exists un_codigo_por_negocio
  on productos (negocio_id, codigo) where codigo is not null;

create index if not exists productos_por_codigo on productos (negocio_id, codigo);

-- Rubro del comercio: veterinaria, pet shop, forrajería. Sirve para ordenar y,
-- más adelante, para ver qué se vende en cada tipo de negocio.
alter table clientes add column if not exists rubro text;

-- Ubicación del proveedor. Los clientes ya tenían `zona`; los proveedores no.
-- Se llama igual en las dos tablas para que "ordenar por ubicación" sea una
-- sola idea y no dos.
alter table proveedores add column if not exists zona text;

-- ---------------------------------------------------------------------------
-- 2. Varios usuarios, no un dueño único
--
-- POR QUÉ NO SE ABRE Y LISTO. La tentación es sacar el cierre de
-- `reclamar_negocio()` y que entre cualquiera que se registre. Eso convierte la
-- dirección del sitio en la llave del negocio: quien la encuentre ve la deuda
-- de todos los comercios y puede cargar ventas. No es una preocupación teórica
-- —la app está en una URL pública y sin captcha—, así que la puerta sigue
-- cerrada y lo que se agrega es una lista de invitados.
--
-- El dueño escribe el mail de quien quiere que entre; cuando esa persona se
-- registra con ese mail, la función la deja pasar sola. Nadie más.
-- ---------------------------------------------------------------------------

create table if not exists usuarios_autorizados (
  negocio_id uuid not null references negocios(id) on delete cascade,
  -- Siempre en minúsculas: los mails no distinguen mayúsculas y comparar
  -- "Juan@..." con "juan@..." sería un rechazo incomprensible para el usuario.
  email      text not null check (position('@' in email) > 1),
  rol        text not null default 'vendedor' check (rol in ('dueno','vendedor')),
  invitado_por uuid,
  creado_en  timestamptz not null default now(),
  -- Cuándo esa persona efectivamente entró. NULL = invitación sin usar todavía.
  usado_en   timestamptz,
  primary key (negocio_id, email)
);

alter table usuarios_autorizados enable row level security;

-- Solo los miembros del negocio ven la lista; solo el dueño la modifica.
drop policy if exists autorizados_lectura on usuarios_autorizados;
create policy autorizados_lectura on usuarios_autorizados
  for select using (negocio_id in (select negocios_del_usuario()));

drop policy if exists autorizados_escritura on usuarios_autorizados;
create policy autorizados_escritura on usuarios_autorizados
  for all
  using (exists (
    select 1 from usuarios_negocio un
     where un.negocio_id = usuarios_autorizados.negocio_id
       and un.user_id = auth.uid() and un.rol = 'dueno'))
  with check (exists (
    select 1 from usuarios_negocio un
     where un.negocio_id = usuarios_autorizados.negocio_id
       and un.user_id = auth.uid() and un.rol = 'dueno'));

-- ---------------------------------------------------------------------------
-- `reclamar_negocio()` — ahora con tres caminos en vez de dos
-- ---------------------------------------------------------------------------
create or replace function reclamar_negocio() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usuario uuid := auth.uid();
  v_email   text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_negocio uuid;
  v_rol     text;
begin
  if v_usuario is null then
    raise exception 'Hay que estar logueado para reclamar el negocio.';
  end if;

  -- 1. Ya es miembro: no hay nada que hacer. Es lo que hace que llamar a esta
  --    función en cada ingreso sea gratis y sin efectos.
  select negocio_id into v_negocio from usuarios_negocio where user_id = v_usuario limit 1;
  if found then return v_negocio; end if;

  -- 2. Nadie reclamó todavía: el primero se queda con el negocio, como dueño.
  if not exists (select 1 from usuarios_negocio) then
    select id into v_negocio from negocios order by creado_en limit 1;
    insert into usuarios_negocio (negocio_id, user_id, rol) values (v_negocio, v_usuario, 'dueno');
    return v_negocio;
  end if;

  -- 3. El negocio ya tiene dueño: solo entra quien esté en la lista de
  --    invitados, y con el rol que el dueño le puso.
  select negocio_id, rol into v_negocio, v_rol
    from usuarios_autorizados
   where email = v_email
   limit 1;

  if not found then
    raise exception 'Este sistema ya tiene dueno y tu mail no esta autorizado.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into usuarios_negocio (negocio_id, user_id, rol)
  values (v_negocio, v_usuario, v_rol)
  on conflict do nothing;

  update usuarios_autorizados
     set usado_en = now()
   where negocio_id = v_negocio and email = v_email and usado_en is null;

  return v_negocio;
end $$;

revoke all on function reclamar_negocio() from public, anon;
grant execute on function reclamar_negocio() to authenticated;

-- ---------------------------------------------------------------------------
-- Alta y baja de invitados, para llamar desde la app
-- ---------------------------------------------------------------------------
create or replace function autorizar_usuario(p_email text, p_rol text default 'vendedor')
returns void language plpgsql security definer set search_path = public as $$
declare v_negocio uuid;
begin
  select negocio_id into v_negocio
    from usuarios_negocio
   where user_id = auth.uid() and rol = 'dueno'
   limit 1;

  if not found then
    raise exception 'Solo el dueno puede autorizar usuarios.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_rol not in ('dueno','vendedor') then
    raise exception 'Rol invalido: %', p_rol;
  end if;

  insert into usuarios_autorizados (negocio_id, email, rol, invitado_por)
  values (v_negocio, lower(trim(p_email)), p_rol, auth.uid())
  on conflict (negocio_id, email) do update set rol = excluded.rol;
end $$;

revoke all on function autorizar_usuario(text, text) from public, anon;
grant execute on function autorizar_usuario(text, text) to authenticated;

/*
 * Quitar una autorización.
 *
 * OJO CON LO QUE ESTO HACE Y LO QUE NO: saca a la persona de la lista de
 * invitados y, si ya había entrado, también de `usuarios_negocio`, así que deja
 * de ver el negocio en la próxima llamada. Lo que NO hace es borrar nada de lo
 * que esa persona cargó: sus ventas, sus cobros y sus movimientos siguen siendo
 * hechos que pasaron. Es la misma REGLA 0 de siempre.
 */
create or replace function quitar_autorizacion(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_negocio uuid; v_email text := lower(trim(p_email));
begin
  select negocio_id into v_negocio
    from usuarios_negocio
   where user_id = auth.uid() and rol = 'dueno'
   limit 1;

  if not found then
    raise exception 'Solo el dueno puede quitar usuarios.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from usuarios_autorizados where negocio_id = v_negocio and email = v_email;

  delete from usuarios_negocio un
   using auth.users u
   where un.negocio_id = v_negocio
     and un.user_id = u.id
     and lower(u.email) = v_email
     and un.rol <> 'dueno';   -- a un dueño no se lo saca por accidente
end $$;

revoke all on function quitar_autorizacion(text) from public, anon;
grant execute on function quitar_autorizacion(text) to authenticated;

commit;
