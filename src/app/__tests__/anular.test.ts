/**
 * Tests de la anulación de un ingreso.
 *
 * Es la operación más peligrosa que tiene la app, por una razón concreta: toca
 * tres cosas a la vez —stock, deuda con el proveedor y costo del producto— y las
 * tres son números que él usa para decidir. Si una queda mal, no hay ningún
 * error en pantalla: simplemente el sistema empieza a mentirle.
 *
 * Por eso los tests no comprueban "que no explote". Comprueban que los tres
 * números vuelvan exactamente a donde estaban, y que lo que NO tiene que volver
 * —las ventas ya hechas— no vuelva.
 */

import { describe, expect, it } from 'vitest';
import { pesos } from '../../domain/money.ts';
import { calcularStock } from '../../domain/stock.ts';
import {
  anularCompra,
  aplicar,
  costoDe,
  entrarMercaderia,
  vender,
  type Ctx,
} from '../estado.ts';
import { construirSemilla, idsSecuenciales } from '../semilla.ts';
import { vistaHoy, vistaProveedores } from '../../ui/vistas.ts';

const HOY = '2026-09-15T14:00:00.000Z';
const ctx = (prefijo = 'a'): Ctx => ({ nuevoId: idsSecuenciales(prefijo), ahora: () => HOY });

/** Una compra de 50 unidades de p1 a $2.000, en cuenta, sobre la semilla. */
const conCompra = (condicionPago: 'contado' | 'cuenta' = 'cuenta') => {
  const e0 = construirSemilla(HOY);
  const e1 = aplicar(e0, entrarMercaderia(e0, {
    proveedorId: 'v1',
    items: [{ productoId: 'p1', cantidad: 50, costoUnitarioCent: pesos(2000) }],
    condicionPago,
  }, ctx()));
  return { e0, e1, compra: e1.compras.at(-1)! };
};

describe('anular un ingreso', () => {
  it('descuenta del stock exactamente lo que había entrado', () => {
    const { e0, e1, compra } = conCompra();
    const antes = calcularStock(e0.movimientos).get('p1')!.total;
    expect(calcularStock(e1.movimientos).get('p1')!.total).toBe(antes + 50);

    const e2 = aplicar(e1, anularCompra(e1, compra.id, ctx('b')));
    expect(calcularStock(e2.movimientos).get('p1')!.total).toBe(antes);
  });

  it('no borra nada: la entrada y el ajuste conviven', () => {
    /*
     * El corazón de la REGLA 0. Después de anular hay MÁS movimientos que antes,
     * no menos. La base lo hace cumplir con triggers —un movimiento no se puede
     * borrar ni modificar—, así que si esta función intentara borrar, fallaría
     * recién en producción.
     */
    const { e1, compra } = conCompra();
    const e2 = aplicar(e1, anularCompra(e1, compra.id, ctx('b')));

    expect(e2.movimientos.length).toBe(e1.movimientos.length + compra.items.length);
    // Los originales siguen enteros.
    for (const m of e1.movimientos) {
      expect(e2.movimientos.find((x) => x.id === m.id)).toEqual(m);
    }
    // Y la compra sigue estando, con sus renglones.
    const guardada = e2.compras.find((c) => c.id === compra.id)!;
    expect(guardada.items).toEqual(compra.items);
    expect(guardada.totalCent).toBe(compra.totalCent);
    expect(guardada.anuladaEn).toBe(HOY);
  });

  it('revierte la deuda con el proveedor', () => {
    const { e0, e1, compra } = conCompra('cuenta');
    const antes = vistaProveedores(e0).lista.find((p) => p.id === 'v1')!.deboCent;

    expect(vistaProveedores(e1).lista.find((p) => p.id === 'v1')!.deboCent)
      .toBe(antes + compra.totalCent);

    const e2 = aplicar(e1, anularCompra(e1, compra.id, ctx('b')));
    expect(vistaProveedores(e2).lista.find((p) => p.id === 'v1')!.deboCent).toBe(antes);
    expect(vistaProveedores(e2).totalCent).toBe(vistaProveedores(e0).totalCent);
  });

  it('una compra al contado no tenía deuda, y sigue sin tenerla', () => {
    const { e0, e1, compra } = conCompra('contado');
    const antes = vistaProveedores(e0).lista.find((p) => p.id === 'v1')!.deboCent;
    expect(vistaProveedores(e1).lista.find((p) => p.id === 'v1')!.deboCent).toBe(antes);

    const e2 = aplicar(e1, anularCompra(e1, compra.id, ctx('b')));
    expect(vistaProveedores(e2).lista.find((p) => p.id === 'v1')!.deboCent).toBe(antes);
  });

  it('el costo del producto vuelve al de la compra anterior', () => {
    /*
     * El efecto menos obvio y el que más plata mueve. El costo es el de la
     * última compra; si la anulada era la última, el costo tiene que retroceder.
     * Si no, la app seguiría calculando la ganancia contra un costo que salió de
     * una entrada que él acaba de decir que no existió.
     */
    const { e0, e1, compra } = conCompra();
    const costoAntes = costoDe(e0, 'p1');

    expect(costoDe(e1, 'p1')).toBe(pesos(2000));
    expect(costoDe(e1, 'p1')).not.toBe(costoAntes);

    const e2 = aplicar(e1, anularCompra(e1, compra.id, ctx('b')));
    expect(costoDe(e2, 'p1')).toBe(costoAntes);
  });

  it('las ventas ya hechas no se tocan', () => {
    /*
     * Vendió con la mercadería que entró, y después anuló la entrada. Lo que
     * ganó en esa venta NO cambia: el costo se congeló en el renglón cuando
     * vendió, que es exactamente para lo que sirve congelarlo.
     */
    const { e1, compra } = conCompra();
    const conVenta = aplicar(e1, vender(e1, {
      clienteId: 'c1', items: [{ productoId: 'p1', cantidad: 5 }], formaPago: 'efectivo',
    }, ctx('c')));
    const venta = conVenta.ventas.at(-1)!;

    const e2 = aplicar(conVenta, anularCompra(conVenta, compra.id, ctx('d')));
    const despues = e2.ventas.find((v) => v.id === venta.id)!;

    expect(despues).toEqual(venta);
    expect(despues.items[0].costoUnitarioCent).toBe(pesos(2000));
    expect(vistaHoy(e2, HOY).vendidoHoyCent).toBe(vistaHoy(conVenta, HOY).vendidoHoyCent);
  });

  it('si ya vendió parte, el stock queda en negativo y eso está bien', () => {
    /*
     * Entraron 50, vendió 5, se anula la entrada: quedan -5 respecto de antes.
     * No se recorta en cero a propósito. El número en rojo es información —
     * vendió mercadería que el sistema no tiene como recibida, o sea que una de
     * las dos cargas está mal— y taparlo escondería el problema.
     */
    const { e0, e1, compra } = conCompra();
    const antes = calcularStock(e0.movimientos).get('p1')!.total;

    const conVenta = aplicar(e1, vender(e1, {
      clienteId: 'c1', items: [{ productoId: 'p1', cantidad: antes + 50 }], formaPago: 'efectivo',
    }, ctx('c')));
    expect(calcularStock(conVenta.movimientos).get('p1')!.total).toBe(0);

    const e2 = aplicar(conVenta, anularCompra(conVenta, compra.id, ctx('d')));
    expect(calcularStock(e2.movimientos).get('p1')!.total).toBe(-50);
  });

  it('no se puede anular dos veces', () => {
    /*
     * Importa de verdad: anular dos veces descontaría el stock dos veces, y ese
     * error no da ningún síntoma hasta que alguien cuenta las cajas. La función
     * del servidor tiene la misma protección, porque la cola reintenta sola
     * cuando vuelve la señal.
     */
    const { e1, compra } = conCompra();
    const e2 = aplicar(e1, anularCompra(e1, compra.id, ctx('b')));
    expect(() => anularCompra(e2, compra.id, ctx('c'))).toThrow(/ya estaba anulado/i);
  });

  it('anular algo que no existe avisa, no rompe callado', () => {
    const { e1 } = conCompra();
    expect(() => anularCompra(e1, 'no-existe', ctx('b'))).toThrow(/no existe/i);
  });

  it('las sugerencias de precio que había dejado esa compra se descartan', () => {
    /*
     * Una compra más cara que la anterior deja una sugerencia de subir el precio.
     * Si la compra se anula, ese aumento nunca ocurrió: dejar la sugerencia
     * pendiente sería pedirle que decida sobre un aumento inventado.
     */
    const e0 = construirSemilla(HOY);
    const costoViejo = costoDe(e0, 'p1')!;
    const e1 = aplicar(e0, entrarMercaderia(e0, {
      proveedorId: 'v1',
      items: [{ productoId: 'p1', cantidad: 10, costoUnitarioCent: costoViejo * 2 }],
      condicionPago: 'cuenta',
    }, ctx()));
    const compra = e1.compras.at(-1)!;

    const pendientesAntes = e1.sugerencias.filter((s) => s.estado === 'pendiente');
    expect(pendientesAntes.length).toBeGreaterThan(e0.sugerencias.filter((s) => s.estado === 'pendiente').length);

    const e2 = aplicar(e1, anularCompra(e1, compra.id, ctx('b')));
    const deLaCompra = e2.sugerencias.filter(
      (s) => s.creadaEn === compra.fecha && s.productoId === 'p1',
    );
    expect(deLaCompra.length).toBeGreaterThan(0);
    expect(deLaCompra.every((s) => s.estado === 'descartada')).toBe(true);
  });

  it('anular una compra no toca las otras', () => {
    const { e1, compra } = conCompra();
    const e2 = aplicar(e1, entrarMercaderia(e1, {
      proveedorId: 'v1',
      items: [{ productoId: 'p2', cantidad: 7, costoUnitarioCent: pesos(900) }],
      condicionPago: 'cuenta',
    }, ctx('c')));
    const otra = e2.compras.at(-1)!;

    const e3 = aplicar(e2, anularCompra(e2, compra.id, ctx('d')));

    expect(e3.compras.find((c) => c.id === otra.id)!.anuladaEn).toBeUndefined();
    expect(calcularStock(e3.movimientos).get('p2')!.total)
      .toBe(calcularStock(e2.movimientos).get('p2')!.total);
  });
});

describe('los ingresos del día', () => {
  it('aparecen en la pantalla de hoy, y el total no cuenta los anulados', () => {
    const { e1, compra } = conCompra();
    const v1 = vistaHoy(e1, HOY);

    expect(v1.ingresosDeHoy.some((i) => i.id === compra.id)).toBe(true);
    expect(v1.ingresadoHoyCent).toBe(compra.totalCent);

    const e2 = aplicar(e1, anularCompra(e1, compra.id, ctx('b')));
    const v2 = vistaHoy(e2, HOY);

    // Sigue en la lista —tiene que poder ver qué anuló— pero deja de sumar.
    expect(v2.ingresosDeHoy.find((i) => i.id === compra.id)!.anulada).toBe(true);
    expect(v2.ingresadoHoyCent).toBe(0);
  });
});
