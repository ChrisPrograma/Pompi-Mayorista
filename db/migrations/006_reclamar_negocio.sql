-- 006_reclamar_negocio.sql
--
-- El problema que resuelve:
--
-- El registro está abierto — cualquiera que llegue a la URL puede crearse una
-- cuenta. Eso por sí solo no es grave: RLS hace que un usuario sin negocio no
-- vea absolutamente nada. Pero le deja una app vacía y confusa, y deja la puerta
-- abierta a que el segundo que se registre se quede con el negocio del primero.
--
-- La regla, entonces: **el primero que se registra se queda con el negocio, y
-- después la puerta se cierra.** Es el patrón de "primer arranque": la app se
-- entrega sin usuario, el dueño la abre, crea su cuenta y queda asociado. Nadie
-- más puede reclamarlo, ni siquiera sabiendo la URL y la clave anon.
--
-- Por qué en una función y no en la app: si esto lo decidiera el cliente
-- (el navegador), cualquiera podría saltear la validación llamando a la API
-- directo. Acá lo decide Postgres y no hay forma de esquivarlo.

begin;

create or replace function reclamar_negocio()
returns uuid
language plpgsql
-- SECURITY DEFINER: corre con permisos del dueño de la función, porque tiene que
-- poder escribir en usuarios_negocio, que es justamente la tabla que decide los
-- permisos. Sin esto sería un problema del huevo y la gallina: el usuario no
-- puede escribir ahí porque todavía no pertenece a ningún negocio.
security definer
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
  v_negocio uuid;
begin
  if v_usuario is null then
    raise exception 'Hay que estar logueado para reclamar el negocio';
  end if;

  -- Idempotente: si ya es miembro, devolver su negocio sin tocar nada.
  -- Reintentar el alta diez veces tiene que dar el mismo resultado que una.
  select negocio_id into v_negocio
    from usuarios_negocio where user_id = v_usuario limit 1;
  if found then
    return v_negocio;
  end if;

  -- La puerta. Si ya hay alguien, se cierra.
  if exists (select 1 from usuarios_negocio) then
    raise exception 'Este sistema ya tiene dueño. Pedile acceso a quien lo administra.'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_negocio from negocios order by creado_en limit 1;
  if v_negocio is null then
    raise exception 'No hay ningún negocio creado todavía';
  end if;

  insert into usuarios_negocio (negocio_id, user_id, rol)
  values (v_negocio, v_usuario, 'dueno');

  return v_negocio;
end $$;

-- Solo usuarios logueados. `anon` no puede llamarla ni para probar.
revoke all on function reclamar_negocio() from public, anon;
grant execute on function reclamar_negocio() to authenticated;

commit;
