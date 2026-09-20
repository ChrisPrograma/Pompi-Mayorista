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
  anularVenta,
  aplicar,
  cobrar,
  costoDe,
  entrarMercaderia,
  vender,
  type Ctx,
} from '../estado.ts';
import { saldoCliente } from '../../domain/saldos.ts';
import { construirSemilla, idsSecuenciales } from '../semilla.ts';
import { vistaDeudas, vistaHoy, vistaNumeros, vistaProveedores } from '../../ui/vistas.ts';

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

    // Sale de la lista del día y pasa al bloque de anuladas del mes.
    expect(v2.ingresosDeHoy.find((i) => i.id === compra.id)).toBeUndefined();
    expect(v2.anuladasDelMes.some((i) => i.id === compra.id)).toBe(true);
    expect(v2.ingresadoHoyCent).toBe(0);
  });
});


// ===========================================================================
// Anular una venta
// ===========================================================================

/**
 * Una venta toca tres números a la vez: el stock, la caja del día y la cuenta
 * corriente del comercio. Anularla tiene que devolver los tres a donde estaban
 * — y ninguno avisa si queda mal. Por eso cada uno tiene su test.
 */
const conVenta = (formaPago: 'efectivo' | 'cuenta' | 'mixto', cobradoCent?: number) => {
  const e0 = construirSemilla(HOY);
  const e1 = aplicar(e0, vender(e0, {
    clienteId: 'c1',
    items: [{ productoId: 'p1', cantidad: 8 }],
    formaPago,
    ...(cobradoCent === undefined ? {} : { cobradoCent }),
  }, ctx('v')));
  return { e0, e1, venta: e1.ventas.at(-1)! };
};

describe('anular una venta', () => {
  it('la mercadería vuelve al stock', () => {
    const { e0, e1, venta } = conVenta('efectivo');
    const antes = calcularStock(e0.movimientos).get('p1')!.total;
    expect(calcularStock(e1.movimientos).get('p1')!.total).toBe(antes - 8);

    const e2 = aplicar(e1, anularVenta(e1, venta.id, ctx('w')));
    expect(calcularStock(e2.movimientos).get('p1')!.total).toBe(antes);
  });

  it('no borra nada: la salida y el ajuste conviven', () => {
    const { e1, venta } = conVenta('efectivo');
    const e2 = aplicar(e1, anularVenta(e1, venta.id, ctx('w')));

    expect(e2.movimientos.length).toBe(e1.movimientos.length + venta.items.length);
    for (const m of e1.movimientos) {
      expect(e2.movimientos.find((x) => x.id === m.id)).toEqual(m);
    }
    const guardada = e2.ventas.find((v) => v.id === venta.id)!;
    expect(guardada.items).toEqual(venta.items);
    expect(guardada.totalCent).toBe(venta.totalCent);
    expect(guardada.cobradoCent).toBe(venta.cobradoCent);
    expect(guardada.anuladaEn).toBe(HOY);
  });

  it('la plata cobrada sale de la caja del día', () => {
    /*
     * "Cobré hoy". Si esto no se revierte, el número del día le queda inflado y
     * no hay forma de que se dé cuenta mirando la pantalla: el total simplemente
     * no cierra con lo que tiene en el bolsillo.
     */
    const { e0, e1, venta } = conVenta('efectivo');
    const antes = vistaHoy(e0, HOY).cobradoHoyCent;
    expect(vistaHoy(e1, HOY).cobradoHoyCent).toBe(antes + venta.totalCent);

    const e2 = aplicar(e1, anularVenta(e1, venta.id, ctx('w')));
    expect(vistaHoy(e2, HOY).cobradoHoyCent).toBe(antes);
  });

  it('la deuda del comercio vuelve a lo que era, en una venta a cuenta', () => {
    const { e0, e1, venta } = conVenta('cuenta');
    const antes = saldoCliente('c1', e0.ventas, e0.pagos, HOY).saldoCent;
    expect(saldoCliente('c1', e1.ventas, e1.pagos, HOY).saldoCent).toBe(antes + venta.totalCent);

    const e2 = aplicar(e1, anularVenta(e1, venta.id, ctx('w')));
    expect(saldoCliente('c1', e2.ventas, e2.pagos, HOY).saldoCent).toBe(antes);
    expect(vistaDeudas(e2, HOY).totalCent).toBe(vistaDeudas(e0, HOY).totalCent);
  });

  it('en un pago parcial revierte las DOS puntas: la caja y la deuda', () => {
    /*
     * El caso que más fácil se rompe, porque hay plata en los dos lados a la
     * vez. Una implementación que solo mire `formaPago` se olvidaría de una.
     */
    const { e0, venta } = conVenta('efectivo');
    const mitad = Math.floor(venta.totalCent / 2);

    const e1 = aplicar(e0, vender(e0, {
      clienteId: 'c1',
      items: [{ productoId: 'p1', cantidad: 8 }],
      formaPago: 'mixto',
      cobradoCent: mitad,
    }, ctx('v')));
    const parcial = e1.ventas.at(-1)!;

    const cajaAntes = vistaHoy(e0, HOY).cobradoHoyCent;
    const deudaAntes = saldoCliente('c1', e0.ventas, e0.pagos, HOY).saldoCent;

    expect(vistaHoy(e1, HOY).cobradoHoyCent).toBe(cajaAntes + mitad);
    expect(saldoCliente('c1', e1.ventas, e1.pagos, HOY).saldoCent)
      .toBe(deudaAntes + (parcial.totalCent - mitad));

    const e2 = aplicar(e1, anularVenta(e1, parcial.id, ctx('w')));
    expect(vistaHoy(e2, HOY).cobradoHoyCent).toBe(cajaAntes);
    expect(saldoCliente('c1', e2.ventas, e2.pagos, HOY).saldoCent).toBe(deudaAntes);
  });

  it('sale de la ganancia del mes', () => {
    const { e0, e1, venta } = conVenta('efectivo');
    const antes = vistaNumeros(e0, HOY, 30).gananciaCent;
    expect(vistaNumeros(e1, HOY, 30).ventasCent).toBeGreaterThan(vistaNumeros(e0, HOY, 30).ventasCent);

    const e2 = aplicar(e1, anularVenta(e1, venta.id, ctx('w')));
    expect(vistaNumeros(e2, HOY, 30).gananciaCent).toBe(antes);
    expect(vistaNumeros(e2, HOY, 30).ventasCent).toBe(vistaNumeros(e0, HOY, 30).ventasCent);
  });

  it('deja de contar como "hoy vendiste" y el comercio vuelve a estar sin visitar', () => {
    const { e1, venta } = conVenta('efectivo');
    expect(vistaHoy(e1, HOY).misiones.venta).toBe(true);

    const e2 = aplicar(e1, anularVenta(e1, venta.id, ctx('w')));
    const v2 = vistaHoy(e2, HOY);
    // En la semilla puede haber otras ventas de hoy; lo que se controla es que
    // ESTA deje de contar como visita a ese comercio.
    const enRuta = v2.ruta.find((r) => r.clienteId === 'c1');
    if (enRuta) expect(enRuta.visitado).toBe(false);
    expect(v2.ventasDeHoy.find((x) => x.id === venta.id)).toBeUndefined();
    expect(v2.anuladasDelMes.some((x) => x.id === venta.id)).toBe(true);
  });

  it('sigue en la lista del día, marcada, pero sin sumar en el total', () => {
    /*
     * Las dos mitades del mismo comportamiento, y por eso van juntas: la venta
     * se SIGUE VIENDO —tiene que poder revisar qué anuló— pero DEJA DE SUMAR.
     * Esconderla sería cómodo; que siguiera sumando sería mentirle.
     */
    const { e0, e1, venta } = conVenta('cuenta');
    const e2 = aplicar(e1, anularVenta(e1, venta.id, ctx('w')));
    const v2 = vistaHoy(e2, HOY);
    // Ya no está entre las del día: pasó al bloque de anuladas del mes.
    expect(v2.ventasDeHoy.find((x) => x.id === venta.id)).toBeUndefined();
    const fila = v2.anuladasDelMes.find((x) => x.id === venta.id)!;

    // Se ve, con su importe entero.
    expect(fila.totalCent).toBe(venta.totalCent);
    expect(fila.tipo).toBe('venta');

    // Y no suma: el vendido del día vuelve a ser el de antes de esta venta.
    expect(vistaHoy(e1, HOY).vendidoHoyCent).toBe(vistaHoy(e0, HOY).vendidoHoyCent + venta.totalCent);
    expect(v2.vendidoHoyCent).toBe(vistaHoy(e0, HOY).vendidoHoyCent);
  });

  it('los pagos que ya hizo el comercio NO se borran', () => {
    /*
     * Es plata que entró de verdad y tiene su propio asiento. Si le pagó la
     * deuda y después se anula la venta, ese pago queda a cuenta de lo que deba.
     * Borrarlo sería hacer desaparecer plata que está en la caja.
     */
    const { e1, venta } = conVenta('cuenta');
    const conPago = aplicar(e1, cobrar(e1, { clienteId: 'c1', montoCent: pesos(1000), medio: 'efectivo' }, ctx('x')));
    const pagosAntes = conPago.pagos.length;

    const e2 = aplicar(conPago, anularVenta(conPago, venta.id, ctx('w')));
    expect(e2.pagos.length).toBe(pagosAntes);
    expect(e2.pagos).toEqual(conPago.pagos);
  });

  it('no se puede anular dos veces', () => {
    const { e1, venta } = conVenta('efectivo');
    const e2 = aplicar(e1, anularVenta(e1, venta.id, ctx('w')));
    expect(() => anularVenta(e2, venta.id, ctx('y'))).toThrow(/ya estaba anulada/i);
  });

  it('anular algo que no existe avisa, no rompe callado', () => {
    const { e1 } = conVenta('efectivo');
    expect(() => anularVenta(e1, 'no-existe', ctx('w'))).toThrow(/no existe/i);
  });

  it('anular una venta no toca las otras', () => {
    const { e1, venta } = conVenta('cuenta');
    const e2 = aplicar(e1, vender(e1, {
      clienteId: 'c2', items: [{ productoId: 'p2', cantidad: 3 }], formaPago: 'efectivo',
    }, ctx('z')));
    const otra = e2.ventas.at(-1)!;

    const e3 = aplicar(e2, anularVenta(e2, venta.id, ctx('w')));

    expect(e3.ventas.find((v) => v.id === otra.id)).toEqual(otra);
    expect(calcularStock(e3.movimientos).get('p2')!.total)
      .toBe(calcularStock(e2.movimientos).get('p2')!.total);
  });
});

// ===========================================================================
// El bloque de anulaciones del mes
// ===========================================================================

/**
 * Lo anulado se queda a la vista hasta que termina el mes y después se va solo.
 *
 * Lo que importa probar acá no es que aparezca —eso se ve— sino que **se vaya**,
 * y que irse no signifique borrarse: la venta anulada tiene que seguir entera en
 * el estado el 1° de octubre, aunque el inicio ya no la muestre.
 */
describe('las anulaciones del mes en el inicio', () => {
  const anular = () => {
    const { e1, venta } = conVenta('cuenta');
    return { e2: aplicar(e1, anularVenta(e1, venta.id, ctx('w'))), venta };
  };

  it('aparece mientras estemos en el mismo mes', () => {
    const { e2, venta } = anular();
    // Se anuló el 15/09. Mirado el 28/09, sigue a la vista.
    const v = vistaHoy(e2, '2026-09-28T14:00:00.000Z');
    expect(v.anuladasDelMes.map((x) => x.id)).toContain(venta.id);
    expect(v.anuladasDelMes[0].tipo).toBe('venta');
  });

  it('el 1° del mes siguiente desaparece sola, sin borrar nada', () => {
    const { e2, venta } = anular();
    const v = vistaHoy(e2, '2026-10-01T14:00:00.000Z');

    expect(v.anuladasDelMes).toEqual([]);
    // Pero el dato sigue entero: no se borró, solo dejó de mostrarse.
    const guardada = e2.ventas.find((x) => x.id === venta.id)!;
    expect(guardada.anuladaEn).toBe(HOY);
    expect(guardada.items).toEqual(venta.items);
  });

  it('filtra por la fecha de ANULACIÓN, no por la de la venta', () => {
    /*
     * El caso que distingue una implementación correcta de una que parece
     * correcta: una venta de agosto anulada en septiembre es una anulación DE
     * SEPTIEMBRE, y es en septiembre cuando él la tiene que poder revisar.
     */
    const e0 = construirSemilla(HOY);
    const enAgosto = aplicar(e0, vender(e0, {
      clienteId: 'c1', items: [{ productoId: 'p1', cantidad: 2 }], formaPago: 'cuenta',
    }, { nuevoId: idsSecuenciales('ag'), ahora: () => '2026-08-10T14:00:00.000Z' }));
    const venta = enAgosto.ventas.at(-1)!;
    expect(venta.fecha.slice(0, 7)).toBe('2026-08');

    // Se anula en septiembre.
    const anulada = aplicar(enAgosto, anularVenta(enAgosto, venta.id, ctx('se')));
    expect(vistaHoy(anulada, HOY).anuladasDelMes.map((x) => x.id)).toContain(venta.id);
    // Y en octubre ya no.
    expect(vistaHoy(anulada, '2026-10-05T14:00:00.000Z').anuladasDelMes).toEqual([]);
  });

  it('junta ventas e ingresos, de lo último anulado a lo más viejo', () => {
    const e0 = construirSemilla(HOY);
    const conCompraYVenta = aplicar(aplicar(e0, entrarMercaderia(e0, {
      proveedorId: 'v1',
      items: [{ productoId: 'p1', cantidad: 5, costoUnitarioCent: pesos(900) }],
      condicionPago: 'contado',
    }, ctx('i'))), vender(e0, {
      clienteId: 'c1', items: [{ productoId: 'p1', cantidad: 1 }], formaPago: 'efectivo',
    }, ctx('vv')));

    const compra = conCompraYVenta.compras.at(-1)!;
    const venta = conCompraYVenta.ventas.at(-1)!;

    // La compra se anula primero, la venta después.
    const a1 = aplicar(conCompraYVenta, anularCompra(conCompraYVenta, compra.id,
      { nuevoId: idsSecuenciales('x'), ahora: () => '2026-09-16T10:00:00.000Z' }));
    const a2 = aplicar(a1, anularVenta(a1, venta.id,
      { nuevoId: idsSecuenciales('y'), ahora: () => '2026-09-17T10:00:00.000Z' }));

    const lista = vistaHoy(a2, '2026-09-20T14:00:00.000Z').anuladasDelMes;
    expect(lista).toHaveLength(2);
    // Lo último anulado, primero.
    expect(lista[0].tipo).toBe('venta');
    expect(lista[1].tipo).toBe('ingreso');
  });

  it('si no anuló nada, el bloque no existe', () => {
    const { e1 } = conVenta('efectivo');
    expect(vistaHoy(e1, HOY).anuladasDelMes).toEqual([]);
  });
});
