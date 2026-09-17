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
