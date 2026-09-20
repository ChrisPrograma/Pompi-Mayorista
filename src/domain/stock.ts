/**
 * Stock.
 *
 * El stock NO es un número guardado: es la suma del libro mayor de movimientos.
 * Este archivo no guarda nada; recibe movimientos y devuelve saldos.
 *
 * Consecuencia práctica: se puede borrar cualquier caché de stock y reconstruirlo
 * entero desde los movimientos, y el número va a dar igual. Si alguna vez no da
 * igual, el bug está en el caché, no acá.
 *
 * UN SOLO STOCK (desde la migración 009)
 *
 * Hubo dos ubicaciones, 'deposito' y 'vehiculo', y un paso de "cargar el auto"
 * que movía mercadería de una a la otra. El cliente lo pidió sacar: vende desde
 * la vereda y anotar dos veces la misma caja era, en sus palabras, "doble
 * laburo".
 *
 * La ubicación sigue existiendo en el libro mayor porque los movimientos viejos
 * siguen diciendo la verdad sobre lo que pasó en su momento, y porque un
 * movimiento no se puede editar ni borrar. Lo que cambió es que de acá en más
 * todo se anota en 'deposito' y la app muestra un solo número: `total`.
 */

import type { MovimientoStock, Ubicacion, Uuid } from './types.ts';

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
 * Movimientos que genera una venta: sale del stock, que ahora es uno solo.
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
    ubicacion: 'deposito' as const,
    cantidad: -it.cantidad,
    tipo: 'venta' as const,
    refTipo: 'venta' as const,
    refId: args.ventaId,
    fecha: args.fecha,
  }));
