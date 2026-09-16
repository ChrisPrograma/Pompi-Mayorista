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
import { movimientosDeTraslado, movimientosDeVenta } from '../domain/stock.ts';
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
  args: { nombre: string; zona?: string; contacto?: string; diaVisita?: number },
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
    variante?: string;
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

  const productoId = ctx.nuevoId();
  const fecha = ctx.ahora();

  const producto: Producto = {
    id: productoId,
    negocioId: e.negocioId,
    nombre,
    unidad: args.unidad?.trim() || 'unidad',
    activo: true,
    ...opcional('variante', args.variante),
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

  const proveedorId = carga.proveedorId ?? args.proveedorId;
  if (!proveedorId) throw new Error('Para cargar stock inicial hace falta decir de qué proveedor es');

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
      proveedorId,
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
    variante?: string;
    categoria?: string;
    proveedorId?: Uuid | null;
    unidad?: string;
    sugeridoEnVehiculo?: number | null;
  },
): Resultado => {
  const actual = e.productos.find((p) => p.id === args.id);
  if (!actual) throw new Error('Ese producto no existe');

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
    ...texto('variante', args.variante),
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
  args: { nombre: string; rubro?: string; contacto?: string },
  ctx: Ctx,
): Resultado => {
  const nombre = args.nombre.trim();
  if (!nombre) throw new Error('El proveedor necesita un nombre');
  return { proveedores: [{
    id: ctx.nuevoId(),
    negocioId: e.negocioId,
    nombre,
    ...opcional('rubro', args.rubro),
    ...opcional('contacto', args.contacto),
    activo: true,
  }] };
};

export const editarProveedor = (
  e: EstadoApp,
  args: { id: Uuid; nombre?: string; rubro?: string; contacto?: string },
): Resultado => {
  const actual = e.proveedores.find((p) => p.id === args.id);
  if (!actual) throw new Error('Ese proveedor no existe');
  if (args.nombre !== undefined && !args.nombre.trim()) {
    throw new Error('El proveedor necesita un nombre');
  }
  return { proveedores: [limpiar({
    ...actual,
    ...(args.nombre !== undefined ? { nombre: args.nombre.trim() } : {}),
    ...texto('rubro', args.rubro),
    ...texto('contacto', args.contacto),
  })] };
};

export const activarProveedor = (e: EstadoApp, id: Uuid, activo: boolean): Resultado => {
  const actual = e.proveedores.find((p) => p.id === id);
  if (!actual) throw new Error('Ese proveedor no existe');
  return { proveedores: [{ ...actual, activo }] };
};

/** Vender: una venta, sus líneas con precio y costo congelados, y la salida del auto. */
export const vender = (
  e: EstadoApp,
  args: {
    clienteId: Uuid;
    items: { productoId: Uuid; cantidad: number }[];
    formaPago: Venta['formaPago'];
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
  const cobradoCent = args.formaPago === 'cuenta' ? 0 : totalCent;

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

/** Cargar el auto: dos movimientos por producto, ninguno pisa nada. */
export const cargarAuto = (
  e: EstadoApp,
  movimientosPedidos: { productoId: Uuid; cantidad: number }[],
  ctx: Ctx,
): Resultado => {
  const fecha = ctx.ahora();
  const movimientos = movimientosPedidos.flatMap((m) =>
    movimientosDeTraslado(
      { negocioId: e.negocioId, productoId: m.productoId, cantidad: m.cantidad, fecha },
      ctx.nuevoId,
    ),
  );
  return { movimientos };
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
