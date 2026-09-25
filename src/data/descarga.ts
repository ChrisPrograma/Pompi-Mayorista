/**
 * Descarga inicial: traer del servidor lo que ya está guardado.
 *
 * ESTE ARCHIVO ES LA MITAD QUE FALTABA.
 *
 * Hasta acá la app solo escribía: todo lo que él cargaba subía bien a Supabase y
 * nunca volvía a bajar. Eso alcanza mientras use siempre el mismo teléfono y el
 * navegador nunca limpie los datos del sitio. El día que eso no pase —cambia de
 * equipo, entra desde la computadora, el navegador libera espacio— la app no
 * encuentra nada local y arranca de cero, con los datos reales intactos en
 * Supabase pero invisibles. Persistencia a medias es peor que ninguna, porque se
 * siente segura.
 *
 * DOS DECISIONES QUE GOBIERNAN TODO LO DE ABAJO:
 *
 * 1. **El servidor manda, salvo en lo que todavía no llegó al servidor.** Lo que
 *    está en la cola de salida es más nuevo que lo que el servidor conoce, por
 *    definición: todavía no se lo mandamos. Eso no se pisa nunca.
 *
 * 2. **Bajar no borra.** Una fila que existe en el dispositivo y no en el
 *    servidor se queda. Puede ser una venta esperando señal; borrarla porque
 *    "el servidor no la tiene" sería perder plata.
 */

import { PARAMETROS_DEFAULT, type EstadoApp, type Parametros } from '../app/estado.ts';
import type {
  Cliente, Compra, CompraItem, MovimientoStock, PagoCliente, PrecioVenta,
  Producto, Proveedor, SugerenciaPrecio, Uuid, Venta, VentaItem,
} from '../domain/types.ts';
import { traer } from './servidor.ts';

type Fila = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Conversión de una fila de Postgres a un objeto del dominio
// ---------------------------------------------------------------------------

/** Un `null` de la base es "no hay dato", que acá se escribe `undefined`. */
const txt = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v : undefined;

const nro = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Mete la clave solo si tiene valor, para no llenar el objeto de `undefined`. */
const si = <T>(clave: string, valor: T | undefined): Record<string, T> =>
  valor === undefined ? {} : { [clave]: valor };

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normaliza una fecha del servidor al mismo formato que genera el dispositivo.
 *
 * NO ES COSMÉTICO. Postgres devuelve `2026-09-16T01:40:00+00:00`; el dispositivo
 * genera `2026-09-16T01:40:00.000Z`. Toda la app ordena fechas comparando los
 * textos (`localeCompare`), porque con ISO en UTC eso alcanza y es rápido. Pero
 * mezclar las dos formas rompe esa comparación: en la posición 19 hay un `+` en
 * una y un `.` en la otra, y `+` viene antes. Dos filas del mismo segundo se
 * ordenan al revés — y si el servidor llegara a responder con un huso distinto
 * de UTC (`-03:00`), el orden queda mal por horas enteras.
 *
 * Dónde se notaría: `costoDe` toma el costo de la ÚLTIMA compra ordenando por
 * fecha. Un orden mal ahí es una ganancia mal calculada, en silencio.
 *
 * Las fechas sin hora (`fecha_acreditacion` es un `date`) se dejan como están:
 * pasarlas por `toISOString` las correría un día según el huso.
 */
export const iso = (v: unknown): string => {
  const s = typeof v === 'string' ? v : '';
  if (!s || SOLO_FECHA.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
};

const aProducto = (f: Fila): Producto => ({
  id: String(f.id),
  negocioId: String(f.negocio_id),
  nombre: String(f.nombre),
  unidad: txt(f.unidad) ?? 'unidad',
  activo: f.activo !== false,
  ...si('codigo', txt(f.codigo)),
  ...si('variante', txt(f.variante)),
  ...si('descripcion', txt(f.descripcion)),
  ...si('categoria', txt(f.categoria)),
  ...si('proveedorId', txt(f.proveedor_id)),
  ...si('sugeridoEnVehiculo', nro(f.sugerido_en_vehiculo)),
});

const aCliente = (f: Fila): Cliente => ({
  id: String(f.id),
  negocioId: String(f.negocio_id),
  nombre: String(f.nombre),
  activo: f.activo !== false,
  ...si('zona', txt(f.zona)),
  ...si('rubro', txt(f.rubro)),
  ...si('contacto', txt(f.contacto)),
  ...si('diaVisita', nro(f.dia_visita)),
  ...si('plazoDias', nro(f.plazo_dias)),
});

const aProveedor = (f: Fila): Proveedor => ({
  id: String(f.id),
  negocioId: String(f.negocio_id),
  nombre: String(f.nombre),
  activo: f.activo !== false,
  ...si('zona', txt(f.zona)),
  ...si('rubro', txt(f.rubro)),
  ...si('contacto', txt(f.contacto)),
});

const aPrecio = (f: Fila): PrecioVenta => ({
  id: String(f.id),
  productoId: String(f.producto_id),
  listaId: String(f.lista_id),
  precioCent: Number(f.precio_cent),
  vigenteDesde: iso(f.vigente_desde),
  // `null` acá no es "falta el dato": es "este es el precio de hoy". Se conserva.
  vigenteHasta: f.vigente_hasta ? iso(f.vigente_hasta) : null,
  origen: (txt(f.origen) ?? 'manual') as PrecioVenta['origen'],
  ...si('motivo', txt(f.motivo)),
});

const aMovimiento = (f: Fila): MovimientoStock => ({
  id: String(f.id),
  negocioId: String(f.negocio_id),
  productoId: String(f.producto_id),
  ubicacion: String(f.ubicacion) as MovimientoStock['ubicacion'],
  cantidad: Number(f.cantidad),
  tipo: String(f.tipo) as MovimientoStock['tipo'],
  fecha: iso(f.fecha),
  ...si('refTipo', txt(f.ref_tipo) as MovimientoStock['refTipo']),
  ...si('refId', txt(f.ref_id)),
  ...si('nota', txt(f.nota)),
});

const aCompraItem = (f: Fila): CompraItem => ({
  id: String(f.id),
  compraId: String(f.compra_id),
  productoId: String(f.producto_id),
  cantidad: Number(f.cantidad),
  costoUnitarioCent: Number(f.costo_unitario_cent),
});

const aCompra = (f: Fila): Compra => ({
  id: String(f.id),
  negocioId: String(f.negocio_id),
  /*
   * Condicional y no `String(f.proveedor_id)`. Desde la migración 008 una compra
   * al contado puede no tener proveedor —es el caso de la carga inicial, "estas
   * diez ya las tenía en casa"—, y ahí la columna viene en null. `String(null)`
   * devuelve el texto "null", que después no coincide con ningún proveedor y
   * hace que la compra se vea huérfana en vez de sin proveedor.
   */
  ...(f.proveedor_id ? { proveedorId: String(f.proveedor_id) } : {}),
  fecha: iso(f.fecha),
  condicionPago: String(f.condicion_pago) as Compra['condicionPago'],
  totalCent: Number(f.total_cent),
  ...(f.anulada_en ? { anuladaEn: iso(f.anulada_en) } : {}),
  items: ((f.compra_items as Fila[] | undefined) ?? []).map(aCompraItem),
});

const aVentaItem = (f: Fila): VentaItem => ({
  id: String(f.id),
  ventaId: String(f.venta_id),
  productoId: String(f.producto_id),
  cantidad: Number(f.cantidad),
  precioUnitarioCent: Number(f.precio_unitario_cent),
  costoUnitarioCent: Number(f.costo_unitario_cent),
});

const aVenta = (f: Fila): Venta => ({
  id: String(f.id),
  negocioId: String(f.negocio_id),
  clienteId: String(f.cliente_id),
  fecha: iso(f.fecha),
  totalCent: Number(f.total_cent),
  cobradoCent: Number(f.cobrado_cent ?? 0),
  formaPago: String(f.forma_pago) as Venta['formaPago'],
  ...(f.anulada_en ? { anuladaEn: iso(f.anulada_en) } : {}),
  items: ((f.venta_items as Fila[] | undefined) ?? []).map(aVentaItem),
});

const aPago = (f: Fila): PagoCliente => ({
  id: String(f.id),
  negocioId: String(f.negocio_id),
  clienteId: String(f.cliente_id),
  montoCent: Number(f.monto_cent),
  fecha: iso(f.fecha),
  medio: String(f.medio) as PagoCliente['medio'],
  ...si('fechaAcreditacion', txt(f.fecha_acreditacion)),
});

const aSugerencia = (f: Fila): SugerenciaPrecio => ({
  id: String(f.id),
  productoId: String(f.producto_id),
  listaId: String(f.lista_id),
  costoAnteriorCent: Number(f.costo_anterior_cent),
  costoNuevoCent: Number(f.costo_nuevo_cent),
  precioVigenteCent: Number(f.precio_vigente_cent),
  precioSugeridoCent: Number(f.precio_sugerido_cent),
  baseCalculo: (txt(f.base_calculo) ?? 'margen') as SugerenciaPrecio['baseCalculo'],
  estado: (txt(f.estado) ?? 'pendiente') as SugerenciaPrecio['estado'],
  creadaEn: iso(f.creada_en),
  ...si('resueltaEn', f.resuelta_en ? iso(f.resuelta_en) : undefined),
});

const aParametros = (f: Fila | undefined): Parametros | undefined => {
  if (!f) return undefined;
  return {
    diasAtrasado: nro(f.dias_atrasado) ?? PARAMETROS_DEFAULT.diasAtrasado,
    diasMuyAtrasado: nro(f.dias_muy_atrasado) ?? PARAMETROS_DEFAULT.diasMuyAtrasado,
    redondeoCent: nro(f.redondeo_cent) ?? PARAMETROS_DEFAULT.redondeoCent,
    // `numeric` viaja como texto en JSON, no como número.
    markupDefault: Number(f.markup_default) || PARAMETROS_DEFAULT.markupDefault,
  };
};

// ---------------------------------------------------------------------------
// Armar el estado con lo que vino
// ---------------------------------------------------------------------------

/** Lo que devuelven las doce consultas, sin convertir. Separado para poder testear. */
export interface FilasServidor {
  negocios: Fila[];
  listas: Fila[];
  parametros: Fila[];
  productos: Fila[];
  clientes: Fila[];
  proveedores: Fila[];
  precios: Fila[];
  movimientos: Fila[];
  compras: Fila[];
  ventas: Fila[];
  pagos: Fila[];
  sugerencias: Fila[];
}

/**
 * Convierte las filas crudas en un estado de la app.
 *
 * Devuelve `null` cuando el usuario no tiene negocio: no es un error de red, es
 * una cuenta creada que todavía no reclamó el negocio (o que no pudo, porque el
 * sistema ya tiene dueño). RLS hace que vea cero filas en todo, y mostrarle una
 * app vacía como si esos fueran sus datos sería mentirle.
 */
export const armarEstado = (f: FilasServidor): EstadoApp | null => {
  const negocio = f.negocios[0];
  const lista = f.listas.find((l) => l.es_default === true) ?? f.listas[0];
  if (!negocio || !lista) return null;

  return {
    negocioId: String(negocio.id),
    listaId: String(lista.id),
    productos: f.productos.map(aProducto),
    clientes: f.clientes.map(aCliente),
    proveedores: f.proveedores.map(aProveedor),
    precios: f.precios.map(aPrecio),
    movimientos: f.movimientos.map(aMovimiento),
    compras: f.compras.map(aCompra),
    ventas: f.ventas.map(aVenta),
    pagos: f.pagos.map(aPago),
    sugerencias: f.sugerencias.map(aSugerencia),
    parametros: aParametros(f.parametros[0]) ?? PARAMETROS_DEFAULT,
  };
};

// ---------------------------------------------------------------------------
// Unir lo que bajó con lo que ya había en el dispositivo
// ---------------------------------------------------------------------------

/**
 * Regla general: gana el servidor, salvo que la fila esté en la cola de salida.
 *
 * Si está en la cola, la versión del dispositivo es más nueva por definición
 * —todavía no se la mandamos— y pisarla con la del servidor le borraría en la
 * pantalla una edición que él ya dio por hecha. Las filas que existen solo en el
 * dispositivo se quedan siempre: pueden ser una venta esperando señal.
 */
const unirFilas = <T extends { id: Uuid }>(
  locales: T[],
  remotas: T[],
  enCola: Set<string>,
): T[] => {
  const porId = new Map(locales.map((x) => [x.id, x]));
  for (const r of remotas) if (!enCola.has(r.id)) porId.set(r.id, r);
  return [...porId.values()];
};

/**
 * Los movimientos de stock necesitan su propia regla, y es LA regla que faltaba.
 *
 * EL BUG QUE ESTO ARREGLA — el capital que no coincidía entre aparatos.
 *
 * Un movimiento de stock nace DOS VECES, con dos ids distintos. El aparato lo
 * arma al registrar la operación, con su `ctx.nuevoId()`, para poder mostrar el
 * stock al instante y sin señal. Y el servidor lo vuelve a armar cuando recibe
 * la operación:
 *
 *     insert into movimientos_stock values (gen_random_uuid(), ...)
 *
 * El `p_items` que sube lleva producto, cantidad y costo — no lleva ids, así que
 * el servidor no tiene con qué construirlos y los inventa. Después, al bajar,
 * `unirFilas` une POR ID: dos ids distintos son dos filas distintas, y la regla
 * "bajar no borra" las conserva las dos. **Cada movimiento quedaba contado dos
 * veces en el aparato que lo creó.**
 *
 * El error era acumulativo por aparato y proporcional a cuánto se cargó en él:
 * el celular de Pablo marcaba 1765 unidades, su computadora 1268 y el servidor
 * 907. Un aparato que solo baja daba bien; uno que carga, nunca.
 *
 * Y era invisible del lado de la deuda: la CABECERA de la compra y de la venta
 * sí comparte el id —viaja como `p_id`— así que "Me deben" daba idéntico en
 * todos los aparatos mientras el capital daba distinto en cada uno. Esa
 * combinación es la huella del bug.
 *
 * POR QUÉ SE ARREGLA ACÁ Y NO EN EL SERVIDOR
 *
 * La otra salida era una migración que hiciera que el servidor acepte los ids
 * del aparato. Arregla los movimientos nuevos y **no arregla los que ya están
 * duplicados adentro de los aparatos**: esos habría que ir a limpiarlos con un
 * "vaciar y volver a bajar", que es destructivo y hay que pedírselo al usuario.
 *
 * Esta regla los limpia SOLA en la próxima descarga, sin tocar el servidor, sin
 * migración y sin que nadie tenga que borrar nada.
 *
 * LA REGLA
 *
 * Un movimiento nunca se crea suelto: siempre sale de una operación —una compra,
 * una venta, una anulación— y lleva su `refId`, que SÍ es el mismo de los dos
 * lados. Entonces: **si el servidor manda movimientos para una operación, los
 * del servidor son los únicos que valen para esa operación.** Los locales de esa
 * misma operación eran la copia provisoria y se van.
 *
 * Se agrupa por `refId` + `tipo` y no solo por `refId` porque una compra anulada
 * tiene dos grupos con el mismo `refId`: la entrada (`compra`) y su ajuste
 * compensatorio (`ajuste`). Son dos hechos distintos y pueden llegar en momentos
 * distintos.
 *
 * Lo que NO se toca, y es lo que hace que esto no pierda nada:
 *
 *  - Una operación que todavía está en la cola de salida: lo local es más nuevo
 *    por definición, el servidor todavía no la vio.
 *  - Una operación que el servidor no conoce: puede ser una venta esperando
 *    señal. Se conserva, igual que antes.
 *  - Un movimiento sin `refId`: no depende de ninguna operación, se une por id
 *    como el resto.
 */
const grupoDe = (m: MovimientoStock): string => `${m.refId}|${m.tipo}`;

const unirMovimientos = (
  locales: MovimientoStock[],
  remotas: MovimientoStock[],
  enCola: Set<string>,
): MovimientoStock[] => {
  /** Para qué operaciones el servidor ya mandó sus movimientos. */
  const queTraeElServidor = new Set(remotas.map(grupoDe));

  const conservados = locales.filter((m) => {
    if (!m.refId) return true;                       // no depende de una operación
    if (enCola.has(m.refId)) return true;            // todavía no subió: manda lo local
    return !queTraeElServidor.has(grupoDe(m));       // el servidor no lo conoce
  });

  const porId = new Map(conservados.map((m) => [m.id, m]));
  // La misma protección de siempre: no se pisa lo que está esperando subir.
  for (const r of remotas) {
    if (r.refId && enCola.has(r.refId)) continue;
    porId.set(r.id, r);
  }
  return [...porId.values()];
};

/**
 * Los precios necesitan una regla de más.
 *
 * Cambiar un precio son dos cosas: abrir la fila nueva y CERRAR la anterior. La
 * fila nueva viaja en la cola con su id, así que la regla de arriba la protege.
 * La anterior no: su cierre lo hace el servidor cuando recibe la operación, así
 * que hasta que eso pase el servidor la sigue mandando abierta. Pisando la local
 * con la remota quedarían dos precios vigentes del mismo producto y la app no
 * sabría cuál cobrar.
 *
 * Entonces: un precio que el dispositivo ya cerró no se vuelve a abrir.
 */
const unirPrecios = (
  locales: PrecioVenta[],
  remotas: PrecioVenta[],
  enCola: Set<string>,
): PrecioVenta[] => {
  const cerradosAca = new Set(
    locales.filter((p) => p.vigenteHasta !== null).map((p) => p.id),
  );
  return unirFilas(
    locales,
    remotas.filter((p) => !(p.vigenteHasta === null && cerradosAca.has(p.id))),
    enCola,
  );
};

/**
 * Las sugerencias necesitan dos reglas de más.
 *
 * La primera es la misma idea que con los precios: una sugerencia que él ya
 * aceptó o descartó no vuelve a aparecer como pendiente solo porque el servidor
 * todavía no se enteró.
 *
 * La segunda es más fina y es la que evita un duplicado visible. Las sugerencias
 * nacen en los dos lados: el dispositivo arma la suya al entrar mercadería, y
 * `registrar_compra` arma la suya con `gen_random_uuid()` cuando esa compra
 * llega al servidor. Son la misma sugerencia con dos ids distintos. Al bajar,
 * sin esta regla, él vería dos veces el mismo cartel de "subió el costo de X".
 * La base ya garantiza una sola pendiente por producto y lista; acá se respeta
 * lo mismo, quedándose con la del servidor.
 */
const unirSugerencias = (
  locales: SugerenciaPrecio[],
  remotas: SugerenciaPrecio[],
  enCola: Set<string>,
): SugerenciaPrecio[] => {
  const resueltasAca = new Set(
    locales.filter((s) => s.estado !== 'pendiente').map((s) => s.id),
  );
  const unidas = unirFilas(
    locales,
    remotas.filter((s) => !(s.estado === 'pendiente' && resueltasAca.has(s.id))),
    enCola,
  );

  const par = (s: SugerenciaPrecio) => `${s.productoId}|${s.listaId}`;
  const idsRemotos = new Set(remotas.map((s) => s.id));
  const cubiertosPorElServidor = new Set(
    remotas.filter((s) => s.estado === 'pendiente').map(par),
  );

  return unidas.filter((s) =>
    idsRemotos.has(s.id)
    || s.estado !== 'pendiente'
    || !cubiertosPorElServidor.has(par(s)));
};

/** Junta el estado que bajó con el que había en el dispositivo. */
export const unir = (
  local: EstadoApp | null,
  remoto: EstadoApp,
  enCola: Set<string>,
): EstadoApp => {
  if (!local) return remoto;
  return {
    // El negocio y la lista los define el servidor: son de la cuenta, no del aparato.
    negocioId: remoto.negocioId,
    listaId: remoto.listaId,
    productos: unirFilas(local.productos, remoto.productos, enCola),
    clientes: unirFilas(local.clientes, remoto.clientes, enCola),
    proveedores: unirFilas(local.proveedores, remoto.proveedores, enCola),
    precios: unirPrecios(local.precios, remoto.precios, enCola),
    movimientos: unirMovimientos(local.movimientos, remoto.movimientos, enCola),
    compras: unirFilas(local.compras, remoto.compras, enCola),
    ventas: unirFilas(local.ventas, remoto.ventas, enCola),
    pagos: unirFilas(local.pagos, remoto.pagos, enCola),
    sugerencias: unirSugerencias(local.sugerencias, remoto.sugerencias, enCola),
    parametros: remoto.parametros,
  };
};

// ---------------------------------------------------------------------------
// La descarga
// ---------------------------------------------------------------------------

export type Descarga =
  | { ok: true; estado: EstadoApp }
  | { ok: false; motivo: 'sin-negocio' | 'sin-senal'; detalle: string };

/**
 * Trae todo lo que el servidor tiene para esta cuenta.
 *
 * NO une: eso lo hace `unir`, y lo hace el que llama, después. La razón es una
 * carrera real: bajar todo tarda uno o dos segundos y en ese rato él puede haber
 * cargado una venta. Si la unión se hiciera acá, con la foto del estado de
 * ANTES de la descarga, esa venta desaparecería de la pantalla. Uniendo después,
 * contra el estado que haya en ese momento, no hay ventana en la que se pierda
 * nada.
 *
 * Las compras y las ventas se piden con sus renglones adentro (`compra_items`,
 * `venta_items`): son dos consultas menos y, sobre todo, la venta y sus
 * renglones llegan juntos, sin un momento intermedio en que exista una venta sin
 * detalle.
 */
export const descargarEstado = async (): Promise<Descarga> => {
  let filas: FilasServidor;
  try {
    const [
      negocios, listas, parametros, productos, clientes, proveedores,
      precios, movimientos, compras, ventas, pagos, sugerencias,
    ] = await Promise.all([
      traer<Fila>('negocios', 'id,nombre'),
      traer<Fila>('listas_precio', 'id,nombre,es_default'),
      // `parametros` es la única tabla opcional: la crea la segunda mitad de
      // `005_datos_iniciales.sql` y puede no tener fila todavía. Si no está, se
      // usan los valores por defecto. Que falte no puede tumbar toda la descarga
      // y hacerle creer que se quedó sin señal.
      traer<Fila>('parametros').catch(() => [] as Fila[]),
      traer<Fila>('productos'),
      traer<Fila>('clientes'),
      traer<Fila>('proveedores'),
      traer<Fila>('precios_venta'),
      traer<Fila>('movimientos_stock'),
      traer<Fila>('compras', '*,compra_items(*)'),
      traer<Fila>('ventas', '*,venta_items(*)'),
      traer<Fila>('pagos_cliente'),
      traer<Fila>('sugerencias_precio'),
    ]);
    filas = {
      negocios, listas, parametros, productos, clientes, proveedores,
      precios, movimientos, compras, ventas, pagos, sugerencias,
    };
  } catch (e) {
    return {
      ok: false,
      motivo: 'sin-senal',
      detalle: e instanceof Error ? e.message : 'No se pudo hablar con el servidor',
    };
  }

  const remoto = armarEstado(filas);
  if (!remoto) {
    return {
      ok: false,
      motivo: 'sin-negocio',
      detalle: 'Tu cuenta todavía no está asociada a ningún negocio.',
    };
  }

  return { ok: true, estado: remoto };
};
