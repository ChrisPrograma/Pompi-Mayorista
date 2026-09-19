-- 008_compra_sin_proveedor.sql
--
-- "El proveedor dice opcional pero no deja guardar."
--
-- QUÉ ERA EN REALIDAD. `productos.proveedor_id` ya era opcional desde el día uno
-- y nunca bloqueó nada: un producto sin proveedor se guarda perfecto. Lo que
-- fallaba era otra cosa, y solo cuando además se cargaban unidades iniciales:
--
--   unidades + costo  →  la app registra una COMPRA  →  `compras.proveedor_id`
--   es NOT NULL  →  no hay a quién ponerle la compra  →  error.
--
-- O sea que el campo que molestaba no era el del producto sino el de la compra,
-- dos tablas más allá. Por eso el formulario dejaba escribir todo y recién
-- fallaba al guardar.
--
-- LA DECISIÓN. Se permite una compra sin proveedor, PERO solo al contado.
--
-- El motivo es la deuda. Una compra "en cuenta" es plata que se le debe a
-- alguien: sin proveedor sería una deuda con nadie, un número que aparece en
-- "vos les debés" y no se puede pagar ni cancelar nunca. En cambio una compra al
-- contado ya está saldada, y no le debe nada a nadie — que es exactamente el
-- caso de "estas diez unidades ya las tengo en casa".
--
-- El CHECK deja eso escrito en la base, no en la buena voluntad del código.

begin;

alter table compras alter column proveedor_id drop not null;

alter table compras drop constraint if exists compra_en_cuenta_necesita_proveedor;
alter table compras add constraint compra_en_cuenta_necesita_proveedor
  check (condicion_pago = 'contado' or proveedor_id is not null);

comment on column compras.proveedor_id is
  'Opcional SOLO en compras al contado (stock inicial que ya estaba en la casa). '
  'Una compra en cuenta siempre tiene proveedor: la deuda es con alguien.';

-- `registrar_compra` se vuelve a declarar sin cambios de firma: el parámetro
-- `p_proveedor_id` ya aceptaba null y simplemente lo insertaba. Lo único que
-- había que correr era la restricción de la tabla. Se deja constancia acá para
-- que quede claro que la función NO necesitó tocarse.

commit;
