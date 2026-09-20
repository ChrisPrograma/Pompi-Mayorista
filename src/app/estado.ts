/**
 * El estado de la app es un LOG, no un conjunto de campos editables.
 *
 * Cada acción del usuario produce filas NUEVAS (una venta, movimientos de stock,
 * un pago, un precio). Nada se modifica. Por eso este archivo no tiene una sola
 * asignación sobre un registro existente, y por eso se puede testear entero sin
 * base de datos ni navegador.
 *
 * El único "update" de todo el sistema es cerrar la vigencia de un precio, y
 * hasta eso devuelve una copia: `cerrarYAbrir` en precios.ts.
 */

import { porCantidad, type Cent } from '../domain/money.ts';
import { cerrarYAbrir, precioVigente, sugerirPrecio } from '../domain/precios.ts';
import { movimientosDeVenta } from '../domain/stock.ts';
import type {
  Cliente,
  Compra,
  CompraItem,
  MovimientoStock,
  PagoCliente,
  PrecioVenta,
  Producto,
  Proveedor,
  SugerenciaPrecio,
  Uuid,
  Venta,
  VentaItem,
} from '../domain/types.ts';

/** Todo lo que la app tiene cargado. Colecciones de solo-agregar. */
export interface EstadoApp {
  negocioId: Uuid;
  listaId: Uuid;
  productos: Producto[];
  clientes: Cliente[];
  proveedores: Proveedor[];
  precios: PrecioVenta[];
  movimientos: MovimientoStock[];
  compras: Compra[];
  ventas: Venta[];
  pagos: PagoCliente[];
  sugerencias: SugerenciaPrecio[];
  parametros: Parametros;
}

export interface Parametros {
  diasAtrasado: number;
  diasMuyAtrasado: number;
  redondeoCent: Cent;
  markupDefault: number;
}

export const PARAMETROS_DEFAULT: Parametros = {
  diasAtrasado: 15,
  diasMuyAtrasado: 30,
  redondeoCent: 10_000,
  markupDefault: 1.7,
};

/**
 * Un negocio sin nada cargado. Es como arranca la app.
 *
 * No hay datos de ejemplo: los comercios inventados no se distinguen de los
 * reales y, si nunca subieron al servidor, no hay forma de sacarlos desde el
 * otro lado. Vale más una app vacía que le dice qué hacer primero, que una
 * llena de cosas que no son suyas.
 */
export const estadoVacio = (negocioId: Uuid, listaId: Uuid): EstadoApp => ({
  negocioId,
  listaId,
  productos: [], clientes: [], proveedores: [], precios: [],
  movimientos: [], compras: [], ventas: [], pagos: [], sugerencias: [],
  parametros: PARAMETROS_DEFAULT,
});

/** Contexto que las acciones necesitan del mundo exterior. Inyectado para poder testear. */
export interface Ctx {
  nuevoId: () => Uuid;
  ahora: () => string;
}

/** Lo que una acción produce: filas nuevas para agregar, nunca campos para pisar. */
export interface Resultado {
  /**
   * Catálogo. Acá SÍ se reemplaza la fila entera por id, y está bien.
   *
   * REGLA 0 gobierna el libro mayor — movimientos, precios, ventas, compras,
   * pagos — donde cada fila es un hecho que pasó y no se puede desdecir.
   * `productos`, `clientes` y `proveedores` son otra cosa: describen algo que
   * existe hoy. Corregir "Huellitas" mal escrito, o cargar el teléfono que
   * faltaba, no borra ningún hecho, porque el nombre nunca fue un hecho.
   *
   * Lo que sí está prohibido acá es lo de siempre: ninguno de estos objetos
   * tiene stock, costo ni precio. Ver `types.ts`.
   */
  productos?: Producto[];
  proveedores?: Proveedor[];
  clientes?: Cliente[];
  ventas?: Venta[];
  compras?: Compra[];
  movimientos?: MovimientoStock[];
  pagos?: PagoCliente[];
  precios?: PrecioVenta[];
  /** Única excepción: precios cuya vigencia se cierra. Son copias, no mutaciones. */
  preciosCerrados?: PrecioVenta[];
  sugerencias?: SugerenciaPrecio[];
  sugerenciasResueltas?: SugerenciaPrecio[];
}

// ---------------------------------------------------------------------------
// Consultas auxiliares sobre el estado
// ---------------------------------------------------------------------------

export const precioDe = (e: EstadoApp, productoId: Uuid): Cent | null =>
  precioVigente(e.precios.filter((p) => p.productoId === productoId && p.listaId === e.listaId))
    ?.precioCent ?? null;

export const historialPrecios = (e: EstadoApp, productoId: Uuid): PrecioVenta[] =>
  e.precios
    .filter((p) => p.productoId === productoId && p.listaId === e.listaId)
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));

export const costoDe = (e: EstadoApp, productoId: Uuid): Cent | null => {
  const items = e.compras
    // Una compra anulada no le costó nada: si era la última, el costo tiene que
    // volver al de la anterior. Mostrar el costo de una entrada que no existió
    // falsea la ganancia de todos los productos que entraron en ella.
    .filter((c) => !c.anuladaEn)
    .flatMap((c) => c.items.map((i) => ({ ...i, fecha: c.fecha })))
    .filter((i) => i.productoId === productoId)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return items.length ? items[items.length - 1].costoUnitarioCent : null;
};

// ---------------------------------------------------------------------------
// Ayudantes para editar el catálogo
//
// Las tres funciones existen para una sola distinción, que es la que hace que
// editar no sea peligroso: **no mandar un campo** y **mandarlo vacío** son cosas
// distintas. Sin esto, una pantalla que muestra tres campos y se guarda borraría
// los otros cinco que no muestra.
// ---------------------------------------------------------------------------

/** Saca las claves en `undefined`, para que borrar un dato lo borre de verdad. */
const limpiar = <T extends object>(objeto: T): T => {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(objeto)) {
    if (valor !== undefined) salida[clave] = valor;
  }
  return salida as T;
};

/** Para un alta: el campo entra solo si tiene contenido. */
const opcional = (clave: string, valor?: string): Record<string, string> => {
  const v = valor?.trim();
  return v ? { [clave]: v } : {};
};

/** Para una edición. Sin enviar: no toca. Vacío: borra. Con texto: reemplaza. */
const texto = (clave: string, valor?: string): Record<string, string | undefined> => {
  if (valor === undefined) return {};
  const v = valor.trim();
  return { [clave]: v || undefined };
};

/** Igual que `texto`, pero `null` es la forma de decir "sacale este número". */
const numero = (clave: string, valor?: number | null): Record<string, number | undefined> => {
  if (valor === undefined) return {};
  return { [clave]: valor === null ? undefined : valor };
};

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/**
 * Alta de un comercio.
 *
 * Lo mínimo indispensable: el nombre. Todo lo demás es opcional, porque el alta
 * pasa parado en la vereda con el cliente esperando. Los datos que falten se
 * completan después, desde la ficha.
 */
export const altaCliente = (
  e: EstadoApp,
  args: { nombre: string; zona?: string; rubro?: string; contacto?: string; diaVisita?: number },
  ctx: Ctx,
): Resultado => {
  const nombre = args.nombre.trim();
  if (!nombre) throw new Error('El comercio necesita un nombre');

  return {
    clientes: [{
      id: ctx.nuevoId(),
      negocioId: e.negocioId,
      nombre,
      ...opcional('zona', args.zona),
      ...opcional('rubro', args.rubro),
      ...opcional('contacto', args.contacto),
      ...(args.diaVisita !== undefined ? { diaVisita: args.diaVisita } : {}),
      activo: true,
    }],
  };
};

/**
 * Editar un comercio.
 *
 * Solo se tocan los campos que vienen en `args`: mandar `{ contacto }` no borra
 * la zona. Eso importa porque la ficha se completa de a pedazos, cuando hay
 * tiempo, y una pantalla que "guarda todo" borraría lo que no estaba cargado.
 *
 * Un campo enviado vacío SÍ se borra — es la forma de sacar un dato equivocado.
 */
export const editarCliente = (
  e: EstadoApp,
  args: {
    id: Uuid;
    nombre?: string;
    zona?: string;
    rubro?: string;
    contacto?: string;
    diaVisita?: number | null;
    plazoDias?: number | null;
  },
): Resultado => {
  const actual = e.clientes.find((c) => c.id === args.id);
  if (!actual) throw new Error('Ese comercio no existe');

  if (args.nombre !== undefined && !args.nombre.trim()) {
    throw new Error('El comercio necesita un nombre');
  }

  return { clientes: [limpiar({
    ...actual,
    ...(args.nombre !== undefined ? { nombre: args.nombre.trim() } : {}),
    ...texto('zona', args.zona),
    ...texto('rubro', args.rubro),
    ...texto('contacto', args.contacto),
    ...numero('diaVisita', args.diaVisita),
    ...numero('plazoDias', args.plazoDias),
  })] };
};

/**
 * "Eliminar" un comercio: lo saca de circulación, no lo borra.
 *
 * Borrarlo de verdad dejaría ventas apuntando a un comercio inexistente y la
 * deuda de la calle dejaría de cerrar. Desactivado no aparece más en Vender ni
 * en la ruta, pero su historial sigue en pie. Se puede volver a activar.
 */
export const activarCliente = (e: EstadoApp, id: Uuid, activo: boolean): Resultado => {
  const actual = e.clientes.find((c) => c.id === id);
  if (!actual) throw new Error('Ese comercio no existe');
  return { clientes: [{ ...actual, activo }] };
};

/** ¿Ya existe un comercio con ese nombre? Para avisar antes de duplicar. */
export const clienteParecido = (e: EstadoApp, nombre: string): Cliente | null => {
  const n = nombre.trim().toLowerCase();
  if (!n) return null;
  return e.clientes.find((c) => c.activo && c.nombre.trim().toLowerCase() === n) ?? null;
};

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

/**
 * El código que él usa en su planilla.
 *
 * De 1 a 10 dígitos, y se guarda como TEXTO: si fuera un número, un código con
 * cero adelante ("0110") se guardaría como 110 y dejaría de coincidir con la
 * planilla — que es exactamente para lo que existe el código.
 */
const CODIGO = /^[0-9]{1,10}$/;

export const codigoValido = (c: string): boolean => CODIGO.test(c.trim());

/** ¿Ya hay otro producto con ese código? El código no se puede repetir. */
export const productoConCodigo = (
  e: EstadoApp, codigo: string, exceptoId?: Uuid,
): Producto | null => {
  const c = codigo.trim();
  if (!c) return null;
  return e.productos.find((p) => p.codigo === c && p.id !== exceptoId) ?? null;
};

/**
 * Alta de un producto.
 *
 * El producto y su precio son dos filas distintas desde el minuto cero: el
 * precio nace en `precios_venta` con vigencia abierta, igual que cualquier
 * precio posterior. No hay un "primer precio" que viva en otro lado y después
 * se mude — esa mudanza es justamente donde se pierde el historial.
 *
 * `cargaInicial` es opcional y sirve para el arranque real: si ya tiene el
 * producto en la casa, se registra como una compra con su costo. Sin eso el
 * producto existe y se puede vender, pero la ganancia va a aparecer inflada
 * hasta la primera entrada de mercadería, porque el costo todavía no existe.
 */
export const altaProducto = (
  e: EstadoApp,
  args: {
    nombre: string;
    precioCent: Cent;
    codigo?: string;
    variante?: string;
    descripcion?: string;
    categoria?: string;
    proveedorId?: Uuid;
    unidad?: string;
    sugeridoEnVehiculo?: number;
    cargaInicial?: { cantidad: number; costoUnitarioCent: Cent; proveedorId?: Uuid };
  },
  ctx: Ctx,
): Resultado => {
  const nombre = args.nombre.trim();
  if (!nombre) throw new Error('El producto necesita un nombre');
  if (args.precioCent <= 0) throw new Error('El producto necesita un precio de venta');

  const codigo = args.codigo?.trim();
  if (codigo) {
    if (!codigoValido(codigo)) throw new Error('El código son de 1 a 10 dígitos, sin letras');
    if (productoConCodigo(e, codigo)) throw new Error(`Ya tenés un producto con el código ${codigo}`);
  }

  const productoId = ctx.nuevoId();
  const fecha = ctx.ahora();

  const producto: Producto = {
    id: productoId,
    negocioId: e.negocioId,
    nombre,
    unidad: args.unidad?.trim() || 'unidad',
    activo: true,
    ...opcional('codigo', codigo),
    ...opcional('variante', args.variante),
    ...opcional('descripcion', args.descripcion),
    ...opcional('categoria', args.categoria),
    ...(args.proveedorId ? { proveedorId: args.proveedorId } : {}),
    ...(args.sugeridoEnVehiculo !== undefined
      ? { sugeridoEnVehiculo: args.sugeridoEnVehiculo }
      : {}),
  };

  const precio: PrecioVenta = {
    id: ctx.nuevoId(),
    productoId,
    listaId: e.listaId,
    precioCent: args.precioCent,
    vigenteDesde: fecha,
    vigenteHasta: null,
    origen: 'manual',
    motivo: 'precio inicial',
  };

  const carga = args.cargaInicial;
  if (!carga || carga.cantidad <= 0) {
    return { productos: [producto], precios: [precio] };
  }

  /*
   * El proveedor es opcional también acá, y ese era el bug.
   *
   * Antes esto tiraba "hace falta decir de qué proveedor es". La pantalla decía
   * "opcional" al lado del proveedor, dejaba escribir todo, y recién al guardar
   * fallaba — sin mostrar nada, porque la excepción no la agarraba nadie. El
   * formulario quedaba abierto como si no hubieras tocado el botón.
   *
   * Que sea opcional es lo correcto: "estas diez unidades ya las tengo en casa"
   * no se le compró a nadie hoy. Se registra como compra al contado sin
   * proveedor, que es justo lo que la base permite desde la migración 008.
   */
  const proveedorId = carga.proveedorId ?? args.proveedorId;

  const compraId = ctx.nuevoId();
  const item: CompraItem = {
    id: ctx.nuevoId(),
    compraId,
    productoId,
    cantidad: carga.cantidad,
    costoUnitarioCent: carga.costoUnitarioCent,
  };

  return {
    productos: [producto],
    precios: [precio],
    compras: [{
      id: compraId,
      negocioId: e.negocioId,
      ...(proveedorId ? { proveedorId } : {}),
      fecha,
      // Contado: el stock que ya tenía en la casa no es una deuda nueva con el
      // proveedor. Si lo marcáramos en cuenta, le aparecería una deuda inventada.
      condicionPago: 'contado',
      totalCent: porCantidad(carga.costoUnitarioCent, carga.cantidad),
      items: [item],
    }],
    movimientos: [{
      id: ctx.nuevoId(),
      negocioId: e.negocioId,
      productoId,
      ubicacion: 'deposito',
      cantidad: carga.cantidad,
      tipo: 'compra',
      refTipo: 'compra',
      refId: compraId,
      fecha,
      nota: 'carga inicial',
    }],
  };
};

/** Editar un producto. Misma regla que `editarCliente`: solo lo que venga. */
export const editarProducto = (
  e: EstadoApp,
  args: {
    id: Uuid;
    nombre?: string;
    codigo?: string;
    variante?: string;
    descripcion?: string;
    categoria?: string;
    proveedorId?: Uuid | null;
    unidad?: string;
    sugeridoEnVehiculo?: number | null;
  },
): Resultado => {
  const actual = e.productos.find((p) => p.id === args.id);
  if (!actual) throw new Error('Ese producto no existe');

  const codigo = args.codigo?.trim();
  if (codigo) {
    if (!codigoValido(codigo)) throw new Error('El código son de 1 a 10 dígitos, sin letras');
    const otro = productoConCodigo(e, codigo, args.id);
    if (otro) throw new Error(`Ese código ya lo usa "${otro.nombre}"`);
  }

  if (args.nombre !== undefined && !args.nombre.trim()) {
    throw new Error('El producto necesita un nombre');
  }
  if (args.unidad !== undefined && !args.unidad.trim()) {
    throw new Error('El producto necesita una unidad');
  }

  return { productos: [limpiar({
    ...actual,
    ...(args.nombre !== undefined ? { nombre: args.nombre.trim() } : {}),
    ...(args.unidad !== undefined ? { unidad: args.unidad.trim() } : {}),
    ...texto('codigo', args.codigo),
    ...texto('variante', args.variante),
    ...texto('descripcion', args.descripcion),
    ...texto('categoria', args.categoria),
    ...(args.proveedorId !== undefined ? { proveedorId: args.proveedorId ?? undefined } : {}),
    ...numero('sugeridoEnVehiculo', args.sugeridoEnVehiculo),
  })] };
};

/**
 * "Eliminar" un producto: desactivarlo.
 *
 * Igual que con los comercios, borrarlo rompería las ventas viejas que lo
 * nombran. Además el stock que quede sigue existiendo en la casa o en el auto:
 * el sistema no puede hacer desaparecer mercadería real. Desactivado deja de
 * ofrecerse para vender y para cargar en el auto.
 */
export const activarProducto = (e: EstadoApp, id: Uuid, activo: boolean): Resultado => {
  const actual = e.productos.find((p) => p.id === id);
  if (!actual) throw new Error('Ese producto no existe');
  return { productos: [{ ...actual, activo }] };
};

/** ¿Ya existe un producto con ese nombre y variante? Para avisar antes de duplicar. */
export const productoParecido = (
  e: EstadoApp,
  nombre: string,
  variante?: string,
): Producto | null => {
  const n = nombre.trim().toLowerCase();
  if (!n) return null;
  const v = (variante ?? '').trim().toLowerCase();
  return e.productos.find((p) =>
    p.activo
    && p.nombre.trim().toLowerCase() === n
    && (p.variante ?? '').trim().toLowerCase() === v,
  ) ?? null;
};

// ---------------------------------------------------------------------------
// Precios
// ---------------------------------------------------------------------------

/**
 * Cambiar un precio a mano.
 *
 * Hasta acá el precio solo se movía aceptando una sugerencia después de una
 * compra más cara. Pero los precios también cambian por otras razones —
 * la competencia, una promoción, un error de carga — y sin esta acción la única
 * salida era esperar a que subiera un costo.
 *
 * Hace exactamente lo mismo que `aplicarSugerencias`: **cierra la vigencia de la
 * fila anterior y abre una nueva**. El precio viejo queda con la fecha en que
 * dejó de regir. No hay ningún camino en el sistema que pise un precio.
 */
export const cambiarPrecio = (
  e: EstadoApp,
  args: { productoId: Uuid; precioCent: Cent; motivo?: string },
  ctx: Ctx,
): Resultado => {
  if (args.precioCent <= 0) throw new Error('El precio tiene que ser mayor a cero');

  const vigente = precioVigente(
    e.precios.filter((p) => p.productoId === args.productoId && p.listaId === e.listaId),
  );

  if (vigente?.precioCent === args.precioCent) return {};

  const cambio = cerrarYAbrir({
    vigente,
    nuevoId: ctx.nuevoId(),
    productoId: args.productoId,
    listaId: e.listaId,
    precioCent: args.precioCent,
    ahora: ctx.ahora(),
    origen: 'manual',
    ...(args.motivo?.trim() ? { motivo: args.motivo.trim() } : {}),
  });

  return {
    precios: [cambio.nueva],
    ...(cambio.cerrada ? { preciosCerrados: [cambio.cerrada] } : {}),
  };
};

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export const altaProveedor = (
  e: EstadoApp,
  args: { nombre: string; zona?: string; rubro?: string; contacto?: string },
  ctx: Ctx,
): Resultado => {
  const nombre = args.nombre.trim();
  if (!nombre) throw new Error('El proveedor necesita un nombre');
  return { proveedores: [{
    id: ctx.nuevoId(),
    negocioId: e.negocioId,
    nombre,
    ...opcional('zona', args.zona),
    ...opcional('rubro', args.rubro),
    ...opcional('contacto', args.contacto),
    activo: true,
  }] };
};

export const editarProveedor = (
  e: EstadoApp,
  args: { id: Uuid; nombre?: string; zona?: string; rubro?: string; contacto?: string },
): Resultado => {
  const actual = e.proveedores.find((p) => p.id === args.id);
  if (!actual) throw new Error('Ese proveedor no existe');
  if (args.nombre !== undefined && !args.nombre.trim()) {
    throw new Error('El proveedor necesita un nombre');
  }
  return { proveedores: [limpiar({
    ...actual,
    ...(args.nombre !== undefined ? { nombre: args.nombre.trim() } : {}),
    ...texto('zona', args.zona),
    ...texto('rubro', args.rubro),
    ...texto('contacto', args.contacto),
  })] };
};

export const activarProveedor = (e: EstadoApp, id: Uuid, activo: boolean): Resultado => {
  const actual = e.proveedores.find((p) => p.id === id);
  if (!actual) throw new Error('Ese proveedor no existe');
  return { proveedores: [{ ...actual, activo }] };
};

/**
 * Vender: una venta, sus líneas con precio y costo congelados, y la salida de stock.
 *
 * CUÁNTO SE COBRÓ
 *
 * Lo que decide si es deuda no es la forma de pago: es `cobradoCent`. La deuda
 * de un comercio es la suma de `total - cobrado` de sus ventas menos sus pagos,
 * así que un pago parcial no necesita ninguna tabla nueva ni ningún campo
 * nuevo — es una venta con `cobradoCent` en el medio. Por eso las tres opciones
 * que ve él ("me paga el total", "me paga una parte", "me lo debe todo") no
 * cambiaron una sola columna de la base.
 *
 * `cobradoCent` se recorta contra el total a propósito: si por un error de tipeo
 * entra un número más grande que la venta, se cobra la venta y nada más. Un
 * cobrado mayor que el total daría una deuda negativa, o sea que el sistema le
 * estaría diciendo que él le debe plata al comercio.
 */
export const vender = (
  e: EstadoApp,
  args: {
    clienteId: Uuid;
    items: { productoId: Uuid; cantidad: number }[];
    formaPago: Venta['formaPago'];
    /** Cuánto entregó. Si no viene: todo, salvo que la venta sea a cuenta. */
    cobradoCent?: Cent;
  },
  ctx: Ctx,
): Resultado => {
  if (!args.items.length) throw new Error('No hay productos en la venta');

  const ventaId = ctx.nuevoId();
  const fecha = ctx.ahora();

  const lineas: VentaItem[] = args.items.map((it) => {
    const precio = precioDe(e, it.productoId);
    if (precio === null) throw new Error(`El producto ${it.productoId} no tiene precio vigente`);
    return {
      id: ctx.nuevoId(),
      ventaId,
      productoId: it.productoId,
      cantidad: it.cantidad,
      precioUnitarioCent: precio,
      // Congelado. Si nunca se compró, el costo es 0 y la ganancia se ve inflada:
      // es preferible a inventar un número, y la pantalla lo marca.
      costoUnitarioCent: costoDe(e, it.productoId) ?? 0,
    };
  });

  const totalCent = lineas.reduce((a, l) => a + porCantidad(l.precioUnitarioCent, l.cantidad), 0);

  const cobradoCent =
    args.cobradoCent !== undefined
      ? Math.max(0, Math.min(args.cobradoCent, totalCent))
      : args.formaPago === 'cuenta' ? 0 : totalCent;

  const venta: Venta = {
    id: ventaId,
    negocioId: e.negocioId,
    clienteId: args.clienteId,
    fecha,
    totalCent,
    cobradoCent,
    formaPago: args.formaPago,
    items: lineas,
  };

  return {
    ventas: [venta],
    movimientos: movimientosDeVenta(
      { negocioId: e.negocioId, ventaId, fecha, items: args.items },
      ctx.nuevoId,
    ),
  };
};

/**
 * Anular una venta.
 *
 * La contracara de `anularCompra`, con la misma mecánica y más consecuencias:
 * una venta toca el stock, la caja del día y la cuenta corriente del comercio.
 *
 * NO BORRA NADA, por el mismo motivo de siempre: los renglones y los movimientos
 * son inmutables. Son dos cosas:
 *
 *   1. Un movimiento por renglón, en POSITIVO. La mercadería vuelve al stock.
 *      Espejo exacto de la anulación de compra, donde iban en negativo.
 *   2. La cabecera marcada. Desde ahí la venta deja de sumar en "Cobré hoy", en
 *      "Me deben" y en la ganancia del mes.
 *
 * LO QUE NO TOCA
 *
 * Los pagos que el comercio haya hecho por separado (`pagos`) NO se borran: son
 * plata que entró de verdad y tienen su propio asiento. Si había pagado esta
 * venta y después se anula, ese pago queda a cuenta de lo que deba, que es lo
 * correcto — la plata está en la caja, no se puede hacer de cuenta que no.
 *
 * Y el costo congelado en cada renglón se queda donde está: es histórico, dice
 * a cuánto le había costado esa mercadería en ese momento.
 */
export const anularVenta = (e: EstadoApp, ventaId: Uuid, ctx: Ctx): Resultado => {
  const venta = e.ventas.find((v) => v.id === ventaId);
  if (!venta) throw new Error('Esa venta no existe');
  if (venta.anuladaEn) throw new Error('Esa venta ya estaba anulada');

  const fecha = ctx.ahora();

  const movimientos: MovimientoStock[] = venta.items.map((it) => ({
    id: ctx.nuevoId(),
    negocioId: e.negocioId,
    productoId: it.productoId,
    ubicacion: 'deposito',
    cantidad: it.cantidad,
    tipo: 'ajuste',
    refTipo: 'venta',
    refId: ventaId,
    fecha,
    nota: 'Anulación de la venta',
  }));

  return { ventas: [{ ...venta, anuladaEn: fecha }], movimientos };
};

/**
 * Entrar mercadería. Sube el stock del depósito y, si algún costo subió,
 * deja una SUGERENCIA pendiente. Nunca cambia un precio por su cuenta.
 */
export const entrarMercaderia = (
  e: EstadoApp,
  args: {
    proveedorId: Uuid;
    items: { productoId: Uuid; cantidad: number; costoUnitarioCent: Cent }[];
    condicionPago: Compra['condicionPago'];
  },
  ctx: Ctx,
): Resultado => {
  if (!args.items.length) throw new Error('No hay productos en la compra');

  const compraId = ctx.nuevoId();
  const fecha = ctx.ahora();

  const lineas: CompraItem[] = args.items.map((it) => ({
    id: ctx.nuevoId(),
    compraId,
    productoId: it.productoId,
    cantidad: it.cantidad,
    costoUnitarioCent: it.costoUnitarioCent,
  }));

  const compra: Compra = {
    id: compraId,
    negocioId: e.negocioId,
    proveedorId: args.proveedorId,
    fecha,
    condicionPago: args.condicionPago,
    totalCent: lineas.reduce((a, l) => a + porCantidad(l.costoUnitarioCent, l.cantidad), 0),
    items: lineas,
  };

  const movimientos: MovimientoStock[] = args.items.map((it) => ({
    id: ctx.nuevoId(),
    negocioId: e.negocioId,
    productoId: it.productoId,
    ubicacion: 'deposito',
    cantidad: it.cantidad,
    tipo: 'compra',
    refTipo: 'compra',
    refId: compraId,
    fecha,
  }));

  const sugerencias: SugerenciaPrecio[] = [];
  for (const it of args.items) {
    const costoAnterior = costoDe(e, it.productoId);
    const precio = precioDe(e, it.productoId);
    if (costoAnterior === null || precio === null) continue;
    if (it.costoUnitarioCent <= costoAnterior) continue;

    const s = sugerirPrecio({
      precioVigenteCent: precio,
      costoAnteriorCent: costoAnterior,
      costoNuevoCent: it.costoUnitarioCent,
      redondeoCent: e.parametros.redondeoCent,
    });

    sugerencias.push({
      id: ctx.nuevoId(),
      productoId: it.productoId,
      listaId: e.listaId,
      costoAnteriorCent: costoAnterior,
      costoNuevoCent: it.costoUnitarioCent,
      precioVigenteCent: precio,
      precioSugeridoCent: s.precioSugeridoCent,
      baseCalculo: 'margen',
      estado: 'pendiente',
      creadaEn: fecha,
    });
  }

  return { compras: [compra], movimientos, sugerencias };
};

/**
 * Anular un ingreso de mercadería.
 *
 * Anotó una entrada que no fue: se equivocó de proveedor, puso 100 donde iban
 * 10, o la cargó dos veces.
 *
 * NO BORRA NADA. Los renglones de la compra y los movimientos de stock son
 * inmutables —la base lo hace cumplir con triggers— y eso no es un obstáculo:
 * es la REGLA 0. Un error se corrige apilando un asiento que lo compensa, igual
 * que en un libro contable de papel. Acá eso son tres cosas:
 *
 *   1. Un movimiento por renglón, con la cantidad en negativo y tipo 'ajuste'.
 *      La entrada sigue estando y el ajuste también; lo que cambia es la suma.
 *   2. La cabecera marcada con `anuladaEn`. Deja de sumar en la deuda con el
 *      proveedor y deja de contar para el costo del producto.
 *   3. Las sugerencias de precio que esa compra había disparado pasan a
 *      descartadas: nacieron de un aumento de costo que no ocurrió, y dejarlas
 *      pendientes sería pedirle que decida sobre un aumento inventado.
 *
 * LO QUE NO TOCA, A PROPÓSITO
 *
 * Las ventas ya hechas con esa mercadería quedan como están. Su costo se
 * congeló en el renglón de la venta cuando se hizo, que es exactamente para lo
 * que sirve congelarlo: lo que él ganó en esa venta no cambia porque después se
 * corrija una carga.
 *
 * Y el stock puede quedar en negativo si ya vendió parte de lo que entró. Es
 * correcto y es información: significa que vendió mercadería que el sistema no
 * tiene registrada como recibida, y algo de las dos cargas está mal. Taparlo
 * dejándolo en cero sería esconder el problema.
 */
export const anularCompra = (e: EstadoApp, compraId: Uuid, ctx: Ctx): Resultado => {
  const compra = e.compras.find((c) => c.id === compraId);
  if (!compra) throw new Error('Ese ingreso no existe');
  if (compra.anuladaEn) throw new Error('Ese ingreso ya estaba anulado');

  const fecha = ctx.ahora();

  const movimientos: MovimientoStock[] = compra.items.map((it) => ({
    id: ctx.nuevoId(),
    negocioId: e.negocioId,
    productoId: it.productoId,
    ubicacion: 'deposito',
    cantidad: -it.cantidad,
    tipo: 'ajuste',
    refTipo: 'compra',
    refId: compraId,
    fecha,
    nota: 'Anulación del ingreso',
  }));

  /*
   * Las sugerencias no guardan de qué compra salieron, así que se las reconoce
   * por lo que sí tienen: el mismo producto, el mismo costo nuevo y la misma
   * fecha de creación que la compra. `entrarMercaderia` las crea con la fecha
   * exacta de la compra, así que la coincidencia es precisa y no aproximada.
   */
  const sugerenciasResueltas = e.sugerencias
    .filter((s) =>
      s.estado === 'pendiente' &&
      s.creadaEn === compra.fecha &&
      compra.items.some(
        (it) => it.productoId === s.productoId && it.costoUnitarioCent === s.costoNuevoCent,
      ))
    .map((s) => ({ ...s, estado: 'descartada' as const, resueltaEn: fecha }));

  return {
    compras: [{ ...compra, anuladaEn: fecha }],
    movimientos,
    ...(sugerenciasResueltas.length ? { sugerenciasResueltas } : {}),
  };
};


/** Registrar un cobro. */
export const cobrar = (
  e: EstadoApp,
  args: { clienteId: Uuid; montoCent: Cent; medio: PagoCliente['medio'] },
  ctx: Ctx,
): Resultado => {
  if (args.montoCent <= 0) throw new Error('El monto tiene que ser mayor a cero');
  return {
    pagos: [
      {
        id: ctx.nuevoId(),
        negocioId: e.negocioId,
        clienteId: args.clienteId,
        montoCent: args.montoCent,
        fecha: ctx.ahora(),
        medio: args.medio,
      },
    ],
  };
};

/** Aplicar una sugerencia de precio. Solo se llama desde la confirmación explícita. */
export const aplicarSugerencias = (
  e: EstadoApp,
  sugerenciaIds: Uuid[],
  ctx: Ctx,
): Resultado => {
  const ahora = ctx.ahora();
  const nuevos: PrecioVenta[] = [];
  const cerrados: PrecioVenta[] = [];
  const resueltas: SugerenciaPrecio[] = [];

  for (const id of sugerenciaIds) {
    const s = e.sugerencias.find((x) => x.id === id && x.estado === 'pendiente');
    if (!s) continue;

    const vigente = precioVigente(
      e.precios.filter((p) => p.productoId === s.productoId && p.listaId === s.listaId),
    );

    const cambio = cerrarYAbrir({
      vigente,
      nuevoId: ctx.nuevoId(),
      productoId: s.productoId,
      listaId: s.listaId,
      precioCent: s.precioSugeridoCent,
      ahora,
      origen: 'sugerido',
      motivo: 'aumento de costo',
    });

    nuevos.push(cambio.nueva);
    if (cambio.cerrada) cerrados.push(cambio.cerrada);
    resueltas.push({ ...s, estado: 'aplicada', resueltaEn: ahora });
  }

  return {
    precios: nuevos,
    preciosCerrados: cerrados,
    sugerenciasResueltas: resueltas,
  };
};

export const descartarSugerencias = (
  e: EstadoApp,
  sugerenciaIds: Uuid[],
  ctx: Ctx,
): Resultado => ({
  sugerenciasResueltas: e.sugerencias
    .filter((s) => sugerenciaIds.includes(s.id) && s.estado === 'pendiente')
    .map((s) => ({ ...s, estado: 'descartada' as const, resueltaEn: ctx.ahora() })),
});

// ---------------------------------------------------------------------------
// Reductor: aplica un resultado al estado. Solo concatena y reemplaza por id.
// ---------------------------------------------------------------------------

const fusionar = <T extends { id: Uuid }>(actuales: T[], nuevos?: T[]): T[] => {
  if (!nuevos?.length) return actuales;
  const porId = new Map(actuales.map((x) => [x.id, x]));
  for (const n of nuevos) porId.set(n.id, n); // por id: un reintento no duplica
  return [...porId.values()];
};

export const aplicar = (e: EstadoApp, r: Resultado): EstadoApp => ({
  ...e,
  productos: fusionar(e.productos, r.productos),
  proveedores: fusionar(e.proveedores, r.proveedores),
  clientes: fusionar(e.clientes, r.clientes),
  ventas: fusionar(e.ventas, r.ventas),
  compras: fusionar(e.compras, r.compras),
  movimientos: fusionar(e.movimientos, r.movimientos),
  pagos: fusionar(e.pagos, r.pagos),
  precios: fusionar(fusionar(e.precios, r.preciosCerrados), r.precios),
  sugerencias: fusionar(fusionar(e.sugerencias, r.sugerencias), r.sugerenciasResueltas),
});
