/**
 * Stock.
 *
 * El stock NO es un número guardado: es la suma del libro mayor de movimientos.
 * Este archivo no guarda nada; recibe movimientos y devuelve saldos.
 *
 * Consecuencia práctica: se puede borrar cualquier caché de stock y reconstruirlo
 * entero desde los movimientos, y el número va a dar igual. Si alguna vez no da
 * igual, el bug está en el caché, no acá.
 */

import type { MovimientoStock, Producto, Ubicacion, Uuid } from './types.ts';

export interface StockProducto {
  productoId: Uuid;
  deposito: number;
  vehiculo: number;
  total: number;
}

/** Suma el libro mayor y devuelve el stock por producto. */
export const calcularStock = (movimientos: MovimientoStock[]): Map<Uuid, StockProducto> => {
  const mapa = new Map<Uuid, StockProducto>();

  for (const m of movimientos) {
    let s = mapa.get(m.productoId);
    if (!s) {
      s = { productoId: m.productoId, deposito: 0, vehiculo: 0, total: 0 };
      mapa.set(m.productoId, s);
    }
    if (m.ubicacion === 'deposito') s.deposito += m.cantidad;
    else s.vehiculo += m.cantidad;
    s.total += m.cantidad;
  }

  return mapa;
};

export const stockDe = (
  movimientos: MovimientoStock[],
  productoId: Uuid,
  ubicacion?: Ubicacion,
): number => {
  const s = calcularStock(movimientos).get(productoId);
  if (!s) return 0;
  if (ubicacion === 'deposito') return s.deposito;
  if (ubicacion === 'vehiculo') return s.vehiculo;
  return s.total;
};

/**
 * Movimientos que genera una venta: sale del vehículo, que es de donde vende.
 *
 * No valida que haya stock suficiente a propósito. Si el sistema le impide
 * registrar una venta que ya hizo parado en la vereda, deja de usar el sistema.
 * El faltante se muestra después como diferencia a revisar.
 */
export const movimientosDeVenta = (
  args: {
    negocioId: Uuid;
    ventaId: Uuid;
    fecha: string;
    items: { productoId: Uuid; cantidad: number }[];
  },
  nuevoId: () => Uuid,
): MovimientoStock[] =>
  args.items.map((it) => ({
    id: nuevoId(),
    negocioId: args.negocioId,
    productoId: it.productoId,
    ubicacion: 'vehiculo' as const,
    cantidad: -it.cantidad,
    tipo: 'venta' as const,
    refTipo: 'venta' as const,
    refId: args.ventaId,
    fecha: args.fecha,
  }));

/** Movimientos de un traslado casa → auto (cantidad > 0) o auto → casa (cantidad < 0). */
export const movimientosDeTraslado = (
  args: {
    negocioId: Uuid;
    productoId: Uuid;
    cantidad: number;
    fecha: string;
  },
  nuevoId: () => Uuid,
): MovimientoStock[] => {
  if (args.cantidad === 0) return [];
  const abs = Math.abs(args.cantidad);
  const origen: Ubicacion = args.cantidad > 0 ? 'deposito' : 'vehiculo';
  const destino: Ubicacion = args.cantidad > 0 ? 'vehiculo' : 'deposito';
  const base = {
    negocioId: args.negocioId,
    productoId: args.productoId,
    tipo: 'traslado' as const,
    fecha: args.fecha,
  };
  return [
    { ...base, id: nuevoId(), ubicacion: origen, cantidad: -abs },
    { ...base, id: nuevoId(), ubicacion: destino, cantidad: abs },
  ];
};

export interface FaltanteCarga {
  productoId: Uuid;
  enVehiculo: number;
  sugerido: number;
  /** Cuánto se puede subir de verdad, limitado por lo que hay en la casa. */
  aCargar: number;
  /** Lo que falta y tampoco está en la casa: hay que comprarlo. */
  sinStock: number;
}

/**
 * Qué falta cargar en el auto para cubrir una ruta típica.
 * Nunca sugiere cargar más de lo que hay en el depósito.
 */
export const calcularCarga = (
  productos: Producto[],
  movimientos: MovimientoStock[],
): FaltanteCarga[] => {
  const stock = calcularStock(movimientos);

  return productos
    .filter((p) => p.activo && (p.sugeridoEnVehiculo ?? 0) > 0)
    .map((p) => {
      const s = stock.get(p.id) ?? { deposito: 0, vehiculo: 0, total: 0, productoId: p.id };
      const sugerido = p.sugeridoEnVehiculo ?? 0;
      const falta = Math.max(0, sugerido - s.vehiculo);
      const aCargar = Math.min(falta, Math.max(0, s.deposito));
      return {
        productoId: p.id,
        enVehiculo: s.vehiculo,
        sugerido,
        aCargar,
        sinStock: falta - aCargar,
      };
    })
    .filter((f) => f.aCargar > 0 || f.sinStock > 0);
};
