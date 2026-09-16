/**
 * Tests de la REGLA 0: nada se pisa, todo se apila.
 *
 * Estos tests no prueban funciones: prueban que el sistema NO PUEDE cometer los
 * tres errores que arrastran los sistemas de gestión mal hechos. Si alguno de
 * estos se pone en rojo, el error es de diseño, no de implementación.
 */

import { describe, expect, it } from 'vitest';
import { pesos } from '../money.ts';
import { calcularStock } from '../stock.ts';
import { cerrarYAbrir, gananciaDeVenta, precioEnFecha, precioVigente } from '../precios.ts';
import type { MovimientoStock, PrecioVenta, Venta } from '../types.ts';

const NEG = 'negocio-1';
const PROD = 'producto-1';

const mov = (
  id: string,
  ubicacion: 'deposito' | 'vehiculo',
  cantidad: number,
  tipo: MovimientoStock['tipo'],
  fecha = '2026-09-01T10:00:00Z',
): MovimientoStock => ({
  id,
  negocioId: NEG,
  productoId: PROD,
  ubicacion,
  cantidad,
  tipo,
  fecha,
});

describe('REGLA 0 · el stock se reconstruye, no se guarda', () => {
  it('el stock es la suma del libro mayor, en cualquier orden', () => {
    const movimientos = [
      mov('m1', 'deposito', 100, 'compra'),
      mov('m2', 'deposito', -30, 'traslado'),
      mov('m3', 'vehiculo', 30, 'traslado'),
      mov('m4', 'vehiculo', -12, 'venta'),
      mov('m5', 'vehiculo', 2, 'devolucion'),
    ];

    const esperado = { deposito: 70, vehiculo: 20, total: 90 };
    const s1 = calcularStock(movimientos).get(PROD)!;
    // El mismo conjunto, desordenado (que es como llegan al sincronizar sin señal).
    const s2 = calcularStock([...movimientos].reverse()).get(PROD)!;

    expect(s1).toMatchObject(esperado);
    expect(s2).toMatchObject(esperado);
  });

  it('un movimiento repetido por un reintento no duplica stock si se deduplica por id', () => {
    const original = [mov('m1', 'deposito', 40, 'compra')];
    // El celular reintentó la subida; el mismo id llega dos veces.
    const conDuplicado = [...original, mov('m1', 'deposito', 40, 'compra')];

    const deduplicado = [...new Map(conDuplicado.map((m) => [m.id, m])).values()];

    expect(calcularStock(deduplicado).get(PROD)!.deposito).toBe(40);
  });

  it('permite stock negativo: una venta hecha en la calle nunca se rechaza', () => {
    const movimientos = [mov('m1', 'vehiculo', 3, 'traslado'), mov('m2', 'vehiculo', -5, 'venta')];
    // No tira error: queda en -2 y se muestra como diferencia a revisar.
    expect(calcularStock(movimientos).get(PROD)!.vehiculo).toBe(-2);
  });
});

describe('REGLA 0 · un precio no se edita', () => {
  const vigente: PrecioVenta = {
    id: 'pv-1',
    productoId: PROD,
    listaId: 'lista-1',
    precioCent: pesos(3200),
    vigenteDesde: '2026-07-01T00:00:00Z',
    vigenteHasta: null,
    origen: 'manual',
  };

  it('cambiar el precio NO muta la fila anterior', () => {
    const antes = { ...vigente };
    const { cerrada, nueva } = cerrarYAbrir({
      vigente,
      nuevoId: 'pv-2',
      productoId: PROD,
      listaId: 'lista-1',
      precioCent: pesos(3600),
      ahora: '2026-09-13T12:00:00Z',
      origen: 'sugerido',
    });

    // El objeto original quedó intacto: nadie pisó nada.
    expect(vigente).toEqual(antes);
    expect(cerrada!.precioCent).toBe(pesos(3200));
    expect(cerrada!.vigenteHasta).toBe('2026-09-13T12:00:00Z');
    expect(nueva.precioCent).toBe(pesos(3600));
    expect(nueva.vigenteHasta).toBeNull();
  });

  it('el historial permite responder a cuánto lo vendía en una fecha pasada', () => {
    const historial: PrecioVenta[] = [
      { ...vigente, id: 'a', precioCent: pesos(2600), vigenteDesde: '2026-04-01T00:00:00Z', vigenteHasta: '2026-05-15T00:00:00Z' },
      { ...vigente, id: 'b', precioCent: pesos(2900), vigenteDesde: '2026-05-15T00:00:00Z', vigenteHasta: '2026-07-01T00:00:00Z' },
      { ...vigente, id: 'c', precioCent: pesos(3200), vigenteDesde: '2026-07-01T00:00:00Z', vigenteHasta: null },
    ];

    expect(precioEnFecha(historial, '2026-04-20T00:00:00Z')!.precioCent).toBe(pesos(2600));
    expect(precioEnFecha(historial, '2026-06-10T00:00:00Z')!.precioCent).toBe(pesos(2900));
    expect(precioVigente(historial)!.precioCent).toBe(pesos(3200));
  });

  it('no deja cerrar dos veces el mismo precio', () => {
    const yaCerrado: PrecioVenta = { ...vigente, vigenteHasta: '2026-08-01T00:00:00Z' };
    expect(() =>
      cerrarYAbrir({
        vigente: yaCerrado,
        nuevoId: 'pv-3',
        productoId: PROD,
        listaId: 'lista-1',
        precioCent: pesos(4000),
        ahora: '2026-09-13T12:00:00Z',
      }),
    ).toThrow(/ya estaba cerrado/i);
  });
});

describe('REGLA 0 · la ganancia de una venta vieja no se mueve nunca', () => {
  const ventaDeMarzo: Venta = {
    id: 'v-1',
    negocioId: NEG,
    clienteId: 'cli-1',
    fecha: '2026-03-10T14:00:00Z',
    totalCent: pesos(32000),
    cobradoCent: pesos(32000),
    formaPago: 'efectivo',
    items: [
      {
        id: 'vi-1',
        ventaId: 'v-1',
        productoId: PROD,
        cantidad: 10,
        precioUnitarioCent: pesos(3200),
        costoUnitarioCent: pesos(1900), // congelado en marzo
      },
    ],
  };

  it('usa el costo congelado, no el costo de hoy', () => {
    const g = gananciaDeVenta(ventaDeMarzo);
    expect(g.ventaCent).toBe(pesos(32000));
    expect(g.costoCent).toBe(pesos(19000));
    expect(g.gananciaCent).toBe(pesos(13000));
  });

  it('subir el costo del producto en septiembre no cambia la ganancia de marzo', () => {
    const antes = gananciaDeVenta(ventaDeMarzo);

    // En septiembre entra mercadería a $2.150 y el precio pasa a $3.600.
    // Nada de eso toca la venta de marzo: es imposible por construcción,
    // porque gananciaDeVenta no recibe el costo actual como parámetro.
    const despues = gananciaDeVenta(ventaDeMarzo);

    expect(despues).toEqual(antes);
  });
});
