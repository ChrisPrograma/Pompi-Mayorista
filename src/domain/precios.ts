/**
 * Precios y costos.
 *
 * Dos reglas que este archivo hace cumplir:
 *
 * 1. Un precio no se edita. Se cierra el vigente y se abre uno nuevo.
 *    `cerrarYAbrir` devuelve las dos filas; nunca muta la anterior.
 *
 * 2. "El costo" son tres respuestas distintas según para qué se pregunte:
 *      - fijar precio de venta  -> último costo (precio de reposición)
 *      - ganancia de una venta  -> costo congelado en la línea de esa venta
 *      - valuar el stock        -> costo promedio ponderado
 */

import { porCantidad, redondearA, type Cent } from './money.ts';
import type { CompraItem, PrecioVenta, Uuid, Venta } from './types.ts';

export class PrecioError extends Error {}

// ---------------------------------------------------------------------------
// Costos
// ---------------------------------------------------------------------------

/** Precio de reposición: lo que cuesta HOY volver a comprarlo. Para fijar precio de venta. */
export const costoUltimo = (
  items: CompraItem[],
  fechaDeCompra: (compraId: Uuid) => string,
  productoId: Uuid,
): Cent | null => {
  const propios = items
    .filter((i) => i.productoId === productoId)
    .sort((a, b) => fechaDeCompra(a.compraId).localeCompare(fechaDeCompra(b.compraId)));
  return propios.length ? propios[propios.length - 1].costoUnitarioCent : null;
};

/** Costo promedio ponderado. Para valuar lo que tiene guardado en la casa. */
export const costoPromedio = (items: CompraItem[], productoId: Uuid): Cent | null => {
  const propios = items.filter((i) => i.productoId === productoId);
  const unidades = propios.reduce((a, i) => a + i.cantidad, 0);
  if (unidades === 0) return null;
  const total = propios.reduce((a, i) => a + porCantidad(i.costoUnitarioCent, i.cantidad), 0);
  return Math.round(total / unidades);
};

// ---------------------------------------------------------------------------
// Sugerencia de precio
// ---------------------------------------------------------------------------

export interface Sugerencia {
  precioVigenteCent: Cent;
  precioSugeridoCent: Cent;
  costoAnteriorCent: Cent;
  costoNuevoCent: Cent;
  /** Margen sobre venta antes del aumento, 0..1 */
  margenAnterior: number;
  /** Margen sobre venta que queda DESPUÉS del redondeo. Es el que hay que mostrar. */
  margenResultante: number;
}

/**
 * Precio que mantiene el mismo margen sobre venta después de un aumento de costo.
 *
 *   margen          = (precio - costo) / precio
 *   precio_sugerido = costo_nuevo / (1 - margen)  ==  precio * costo_nuevo / costo_viejo
 *
 * Se redondea al múltiplo comercial y se recalcula el margen REAL sobre el número
 * redondeado: es el que se le muestra al usuario. Mostrar el margen teórico hace
 * que el número no le cierre cuando lo verifica a mano, y ahí pierde la confianza.
 */
export const sugerirPrecio = (args: {
  precioVigenteCent: Cent;
  costoAnteriorCent: Cent;
  costoNuevoCent: Cent;
  redondeoCent?: Cent;
}): Sugerencia => {
  const { precioVigenteCent, costoAnteriorCent, costoNuevoCent } = args;
  const redondeo = args.redondeoCent ?? 10_000; // $100

  if (precioVigenteCent <= 0) throw new PrecioError('El precio vigente tiene que ser mayor a cero');
  if (costoAnteriorCent <= 0) throw new PrecioError('El costo anterior tiene que ser mayor a cero');
  if (costoNuevoCent <= 0) throw new PrecioError('El costo nuevo tiene que ser mayor a cero');

  const margenAnterior = (precioVigenteCent - costoAnteriorCent) / precioVigenteCent;
  const crudo = (precioVigenteCent * costoNuevoCent) / costoAnteriorCent;
  const precioSugeridoCent = Math.max(
    redondearA(Math.round(crudo), redondeo),
    // Nunca sugerir por debajo del costo nuevo, pase lo que pase con el redondeo.
    costoNuevoCent,
  );
  const margenResultante = (precioSugeridoCent - costoNuevoCent) / precioSugeridoCent;

  return {
    precioVigenteCent,
    precioSugeridoCent,
    costoAnteriorCent,
    costoNuevoCent,
    margenAnterior,
    margenResultante,
  };
};

/** Precio a partir de un markup sobre el costo. Para productos nuevos, sin margen histórico. */
export const precioPorMarkup = (
  costoCent: Cent,
  markup: number,
  redondeoCent: Cent = 10_000,
): Cent => {
  if (markup <= 1) throw new PrecioError('El markup tiene que ser mayor a 1');
  return redondearA(Math.round(costoCent * markup), redondeoCent);
};

// ---------------------------------------------------------------------------
// Cambio de precio: cerrar y abrir, nunca editar
// ---------------------------------------------------------------------------

export interface CambioPrecio {
  /** Copia de la fila anterior con la vigencia cerrada. La original no se toca. */
  cerrada: PrecioVenta | null;
  /** Fila nueva, vigente. */
  nueva: PrecioVenta;
}

export const cerrarYAbrir = (args: {
  vigente: PrecioVenta | null;
  nuevoId: Uuid;
  productoId: Uuid;
  listaId: Uuid;
  precioCent: Cent;
  ahora: string;
  origen?: PrecioVenta['origen'];
  motivo?: string;
}): CambioPrecio => {
  if (args.precioCent <= 0) throw new PrecioError('El precio tiene que ser mayor a cero');
  if (args.vigente && args.vigente.vigenteHasta !== null) {
    throw new PrecioError('Ese precio ya estaba cerrado');
  }

  return {
    cerrada: args.vigente ? { ...args.vigente, vigenteHasta: args.ahora } : null,
    nueva: {
      id: args.nuevoId,
      productoId: args.productoId,
      listaId: args.listaId,
      precioCent: args.precioCent,
      vigenteDesde: args.ahora,
      vigenteHasta: null,
      origen: args.origen ?? 'manual',
      motivo: args.motivo,
    },
  };
};

/** El precio vigente de una lista de precios históricos. */
export const precioVigente = (historial: PrecioVenta[]): PrecioVenta | null =>
  historial.find((p) => p.vigenteHasta === null) ?? null;

/** El precio que estaba vigente en una fecha dada. Esto es lo que el historial permite responder. */
export const precioEnFecha = (historial: PrecioVenta[], fechaIso: string): PrecioVenta | null =>
  historial.find(
    (p) =>
      p.vigenteDesde <= fechaIso && (p.vigenteHasta === null || p.vigenteHasta > fechaIso),
  ) ?? null;

// ---------------------------------------------------------------------------
// Ganancia
// ---------------------------------------------------------------------------

export interface Ganancia {
  ventaCent: Cent;
  costoCent: Cent;
  gananciaCent: Cent;
  margen: number;
}

/**
 * Ganancia de una venta, calculada SIEMPRE con el costo congelado en sus líneas.
 * No recibe el costo actual como parámetro: es imposible por construcción que el
 * resultado de un mes cerrado cambie porque hoy subió un proveedor.
 */
export const gananciaDeVenta = (venta: Venta): Ganancia => {
  const ventaCent = venta.items.reduce(
    (a, i) => a + porCantidad(i.precioUnitarioCent, i.cantidad),
    0,
  );
  const costoCent = venta.items.reduce(
    (a, i) => a + porCantidad(i.costoUnitarioCent, i.cantidad),
    0,
  );
  return {
    ventaCent,
    costoCent,
    gananciaCent: ventaCent - costoCent,
    margen: ventaCent === 0 ? 0 : (ventaCent - costoCent) / ventaCent,
  };
};

export const gananciaDelPeriodo = (ventas: Venta[]): Ganancia => {
  // Igual que en `saldoCliente`: el filtro va en el dominio y no en la pantalla.
  // Una venta anulada no vendió ni costó nada, así que no entra en la cuenta.
  const g = ventas.filter((v) => !v.anuladaEn).map(gananciaDeVenta);
  const ventaCent = g.reduce((a, x) => a + x.ventaCent, 0);
  const costoCent = g.reduce((a, x) => a + x.costoCent, 0);
  return {
    ventaCent,
    costoCent,
    gananciaCent: ventaCent - costoCent,
    margen: ventaCent === 0 ? 0 : (ventaCent - costoCent) / ventaCent,
  };
};
