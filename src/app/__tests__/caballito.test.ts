/**
 * Tests del "caballito de batalla": el producto que más unidades le compró un
 * comercio.
 *
 * Es un número que se muestra como un dato duro —"se lleva 48 collares"— y por
 * eso conviene que sea exacto. Un caballito equivocado no rompe nada: lo manda a
 * ofrecerle lo que no compra, y eso él lo nota recién parado en el mostrador.
 */

import { describe, expect, it } from 'vitest';
import { pesos } from '../../domain/money.ts';
import { productoMasComprado } from '../../domain/saldos.ts';
import { anularVenta, aplicar, vender, type Ctx } from '../estado.ts';
import { construirSemilla, idsSecuenciales } from '../semilla.ts';
import { caballitoDeBatalla } from '../../ui/vistas.ts';
import type { Venta } from '../../domain/types.ts';

const HOY = '2026-09-15T14:00:00.000Z';
const ctx = (p = 'k'): Ctx => ({ nuevoId: idsSecuenciales(p), ahora: () => HOY });

/** Una venta armada a mano, para controlar exactamente las cantidades. */
const venta = (
  id: string,
  clienteId: string,
  items: [string, number][],
  extra: Partial<Venta> = {},
): Venta => ({
  id,
  negocioId: 'n1',
  clienteId,
  fecha: HOY,
  totalCent: pesos(1000),
  cobradoCent: pesos(1000),
  formaPago: 'efectivo',
  items: items.map(([productoId, cantidad], i) => ({
    id: `${id}-${i}`,
    ventaId: id,
    productoId,
    cantidad,
    precioUnitarioCent: pesos(100),
    costoUnitarioCent: pesos(50),
  })),
  ...extra,
});

describe('el producto que más compró', () => {
  it('suma las unidades de TODAS sus ventas, no mira una sola', () => {
    /*
     * El error fácil: quedarse con el producto de la venta más grande. Acá el
     * collar aparece de a poco en tres ventas y la pelota de una sola vez; el
     * caballito es el collar, que es lo que él percibe como "siempre se lleva".
     */
    const ventas = [
      venta('v1', 'c1', [['collar', 10], ['pelota', 12]]),
      venta('v2', 'c1', [['collar', 10]]),
      venta('v3', 'c1', [['collar', 10]]),
    ];
    expect(productoMasComprado('c1', ventas)).toEqual({ productoId: 'collar', unidades: 30 });
  });

  it('cuenta por unidades, no por plata', () => {
    // La pelota vale lo mismo en este armado, pero lo que decide es la cantidad.
    const ventas = [venta('v1', 'c1', [['barato', 50], ['caro', 2]])];
    expect(productoMasComprado('c1', ventas)!.productoId).toBe('barato');
  });

  it('no mezcla comercios', () => {
    const ventas = [
      venta('v1', 'c1', [['collar', 5]]),
      venta('v2', 'c2', [['pelota', 99]]),
    ];
    expect(productoMasComprado('c1', ventas)).toEqual({ productoId: 'collar', unidades: 5 });
    expect(productoMasComprado('c2', ventas)).toEqual({ productoId: 'pelota', unidades: 99 });
  });

  it('las ventas anuladas NO cuentan', () => {
    /*
     * Importa: si contaran, un error de carga que él anuló podría dejarle un
     * caballito de batalla que ese comercio nunca compró.
     */
    const ventas = [
      venta('v1', 'c1', [['collar', 5]]),
      venta('v2', 'c1', [['pelota', 500]], { anuladaEn: HOY }),
    ];
    expect(productoMasComprado('c1', ventas)).toEqual({ productoId: 'collar', unidades: 5 });
  });

  it('si todas sus ventas están anuladas, no hay caballito', () => {
    const ventas = [venta('v1', 'c1', [['collar', 5]], { anuladaEn: HOY })];
    expect(productoMasComprado('c1', ventas)).toBeNull();
  });

  it('un comercio sin ventas no tiene caballito', () => {
    expect(productoMasComprado('c1', [])).toBeNull();
    expect(productoMasComprado('c9', [venta('v1', 'c1', [['collar', 5]])])).toBeNull();
  });

  it('un empate siempre devuelve el mismo, no uno distinto cada vez', () => {
    /*
     * Sin un criterio fijo, el orden de un Map decide, y la ficha mostraría un
     * producto diferente en cada dibujado. Se resuelve por id: es arbitrario,
     * pero es estable.
     */
    const ventas = [venta('v1', 'c1', [['zeta', 10], ['alfa', 10]])];
    const primero = productoMasComprado('c1', ventas);
    for (let i = 0; i < 5; i++) {
      expect(productoMasComprado('c1', ventas)).toEqual(primero);
    }
    expect(primero!.productoId).toBe('alfa');
  });
});

describe('el caballito, listo para mostrar', () => {
  it('le pega el nombre y el código del catálogo de ahora', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, vender(e0, {
      clienteId: 'c1', items: [{ productoId: 'p1', cantidad: 40 }], formaPago: 'efectivo',
    }, ctx()));

    const cab = caballitoDeBatalla(e1, 'c1')!;
    expect(cab.productoId).toBe('p1');
    expect(cab.unidades).toBeGreaterThanOrEqual(40);
    expect(cab.nombre).toBe(e1.productos.find((p) => p.id === 'p1')!.nombre);
  });

  it('un comercio sin ventas devuelve null, y la ficha muestra el texto vacío', () => {
    const e0 = construirSemilla(HOY);
    const sinVentas = { ...e0, ventas: [] };
    expect(caballitoDeBatalla(sinVentas, 'c1')).toBeNull();
  });

  it('al anular la única venta grande, el caballito cambia', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, vender(e0, {
      clienteId: 'c1', items: [{ productoId: 'p2', cantidad: 500 }], formaPago: 'efectivo',
    }, ctx('a')));
    expect(caballitoDeBatalla(e1, 'c1')!.productoId).toBe('p2');

    const e2 = aplicar(e1, anularVenta(e1, e1.ventas.at(-1)!.id, ctx('b')));
    expect(caballitoDeBatalla(e2, 'c1')!.productoId).not.toBe('p2');
  });
});
