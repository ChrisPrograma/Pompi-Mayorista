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
  args: { nombre: string; zona?: string; diaVisita?: number },
  ctx: Ctx,
): Resultado => {
  const nombre = args.nombre.trim();
  if (!nombre) throw new Error('El comercio necesita un nombre');

  const zona = args.zona?.trim();

  return {
    clientes: [{
      id: ctx.nuevoId(),
      negocioId: e.negocioId,
      nombre,
      ...(zona ? { zona } : {}),
      ...(args.diaVisita !== undefined ? { diaVisita: args.diaVisita } : {}),
      activo: true,
    }],
  };
};

/** ¿Ya existe un comercio con ese nombre? Para avisar antes de duplicar. */
export const clienteParecido = (e: EstadoApp, nombre: string): Cliente | null => {
  const n = nombre.trim().toLowerCase();
  if (!n) return null;
  return e.clientes.find((c) => c.activo && c.nombre.trim().toLowerCase() === n) ?? null;
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
  clientes: fusionar(e.clientes, r.clientes),
  ventas: fusionar(e.ventas, r.ventas),
  compras: fusionar(e.compras, r.compras),
  movimientos: fusionar(e.movimientos, r.movimientos),
  pagos: fusionar(e.pagos, r.pagos),
  precios: fusionar(fusionar(e.precios, r.preciosCerrados), r.precios),
  sugerencias: fusionar(fusionar(e.sugerencias, r.sugerencias), r.sugerenciasResueltas),
});
