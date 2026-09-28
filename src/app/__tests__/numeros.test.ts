/**
 * Tests de la pantalla de Números: la caja, el cuadro de resultados y los cinco
 * reportes.
 *
 * LO QUE MÁS IMPORTA ACÁ
 *
 * Que la CAJA y el RESULTADO puedan dar distinto y los dos estén bien. Es el
 * punto entero del rediseño: una venta a cuenta suma ganancia el día que se hace
 * y no pone un peso en el bolsillo; una compra al contado saca plata hoy y
 * recién cuenta como costo cuando esa mercadería se vende. Si algún día alguien
 * "arregla" uno para que coincida con el otro, estos tests se ponen en rojo.
 *
 * Y que el período corte donde tiene que cortar. Una venta de las 22:00 del 30
 * de septiembre, en UTC, ya es octubre: sin la zona de acá se le iría del mes
 * justo en el cierre.
 */

import { describe, expect, it } from 'vitest';
import { pesos } from '../../domain/money.ts';
import { mesDesplazado, ultimoDiaDelMes } from '../../domain/fechas.ts';
import {
  caja, comprasSinPagar, enVentana, flujoDeCaja, gastosDelPeriodo, planillaDeCaja,
  planillaDeGastos, planillaDeProductos, planillaDeStock, planillaPorCobrar, porCobrar,
  resultado, valorizacionDeStock, ventanaDe, ventasPorProducto,
} from '../../ui/numeros.ts';
import { csvDe } from '../../ui/exportar.ts';
import {
  altaCliente, altaProducto, altaProveedor, anularGasto, anularVenta, aplicar, cobrar,
  entrarMercaderia, estadoVacio, registrarGasto, vender, type Ctx, type EstadoApp,
} from '../estado.ts';
import { idsSecuenciales } from '../semilla.ts';

const HOY = '2026-09-28T14:00:00.000Z';

/** Un contexto con reloj movible: es lo que permite poner cosas en otro mes. */
const reloj = (inicial = HOY) => {
  let ahora = inicial;
  const nuevoId = idsSecuenciales('n');
  return {
    ctx: { nuevoId, ahora: () => ahora } as Ctx,
    en: (iso: string) => { ahora = iso; },
  };
};

// ---------------------------------------------------------------------------
// El período
// ---------------------------------------------------------------------------

describe('la ventana del período', () => {
  it('"este mes" es el mes calendario entero', () => {
    const v = ventanaDe('mes', HOY);
    expect(v.desde).toBe('2026-09-01');
    expect(v.hasta).toBe('2026-09-30');
    expect(v.titulo).toContain('septiembre');
    expect(v.titulo).toContain('2026');
  });

  it('"el mes anterior" es el de antes, completo', () => {
    const v = ventanaDe('anterior', HOY);
    expect(v.desde).toBe('2026-08-01');
    expect(v.hasta).toBe('2026-08-31');
    expect(v.titulo).toContain('agosto');
  });

  it('el mes anterior a enero es diciembre del año pasado', () => {
    const v = ventanaDe('anterior', '2026-01-14T15:00:00.000Z');
    expect(v.desde).toBe('2025-12-01');
    expect(v.hasta).toBe('2025-12-31');
    expect(v.titulo).toContain('2025');
  });

  it('febrero termina donde el calendario diga, bisiesto incluido', () => {
    expect(ultimoDiaDelMes('2026-02')).toBe('2026-02-28');
    expect(ultimoDiaDelMes('2028-02')).toBe('2028-02-29');
    expect(ultimoDiaDelMes('2026-04')).toBe('2026-04-30');
  });

  it('correr meses no se pasa de año ni se traba en el 31', () => {
    expect(mesDesplazado('2026-01', -1)).toBe('2025-12');
    expect(mesDesplazado('2026-12', 1)).toBe('2027-01');
    // El 31 de marzo corrido un mes no existe: si el cálculo se anclara al día
    // 31 caería en mayo. Por eso adentro se ancla al 15.
    expect(mesDesplazado('2026-03', -1)).toBe('2026-02');
  });

  it('un rango a mano escrito al revés se da vuelta solo', () => {
    const v = ventanaDe('personalizado', HOY, { desde: '2026-09-20', hasta: '2026-09-03' });
    expect(v.desde).toBe('2026-09-03');
    expect(v.hasta).toBe('2026-09-20');
  });

  it('los dos extremos entran', () => {
    const v = ventanaDe('personalizado', HOY, { desde: '2026-09-03', hasta: '2026-09-20' });
    // Mediodía de acá: sin ambigüedad de zona, para fijar que el borde es el día.
    expect(enVentana('2026-09-03T15:00:00.000Z', v)).toBe(true);
    expect(enVentana('2026-09-20T15:00:00.000Z', v)).toBe(true);
    expect(enVentana('2026-09-02T15:00:00.000Z', v)).toBe(false);
    expect(enVentana('2026-09-21T15:00:00.000Z', v)).toBe(false);
  });

  it('las 22:00 del 30 de septiembre siguen siendo septiembre', () => {
    /*
     * Es el borde que costó caro en "Cobré hoy". En UTC ese instante ya es el 1
     * de octubre; acá son las 22 del 30 y el negocio todavía está abierto.
     */
    const septiembre = ventanaDe('mes', HOY);
    expect(enVentana('2026-10-01T01:00:00.000Z', septiembre)).toBe(true);

    const octubre = ventanaDe('mes', '2026-10-15T15:00:00.000Z');
    expect(enVentana('2026-10-01T01:00:00.000Z', octubre)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Un negocio de prueba
// ---------------------------------------------------------------------------

/**
 * Arma un mes con las cuatro clases de hecho que mueven los números:
 * una venta cobrada, una venta a cuenta, una compra al contado y un gasto.
 */
const negocio = () => {
  const r = reloj('2026-09-02T13:00:00.000Z');
  let e: EstadoApp = estadoVacio('n1', 'l1');
  const paso = (f: (x: EstadoApp) => ReturnType<typeof vender>) => { e = aplicar(e, f(e)); };

  paso((x) => altaProveedor(x, { nombre: 'Distribuidora Sur' }, r.ctx));
  const proveedorId = e.proveedores[0]!.id;

  paso((x) => altaCliente(x, { nombre: 'Pet Shop Uno' }, r.ctx));
  paso((x) => altaCliente(x, { nombre: 'Veterinaria Dos' }, r.ctx));
  const [uno, dos] = [e.clientes[0]!.id, e.clientes[1]!.id];

  // Collar: 30 unidades a $1.000 de costo, se vende a $2.500.
  paso((x) => altaProducto(x, {
    nombre: 'Collar', codigo: '101', precioCent: pesos(2500),
    cargaInicial: { cantidad: 30, costoUnitarioCent: pesos(1000), proveedorId },
  }, r.ctx));
  // Pelota: 10 unidades a $400 de costo, se vende a $700.
  paso((x) => altaProducto(x, {
    nombre: 'Pelota', codigo: '9', precioCent: pesos(700),
    cargaInicial: { cantidad: 10, costoUnitarioCent: pesos(400), proveedorId },
  }, r.ctx));
  const [collar, pelota] = [e.productos[0]!.id, e.productos[1]!.id];

  return { get e() { return e; }, r, paso, proveedorId, uno, dos, collar, pelota };
};

// ---------------------------------------------------------------------------
// La caja
// ---------------------------------------------------------------------------

describe('la caja: lo que entró menos lo que salió', () => {
  it('una venta cobrada entra; una a cuenta no entra hasta que la cobre', () => {
    const n = negocio();
    n.r.en('2026-09-10T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 4 }], formaPago: 'efectivo',
    }, n.r.ctx));
    n.paso((x) => vender(x, {
      clienteId: n.dos, items: [{ productoId: n.collar, cantidad: 2 }], formaPago: 'cuenta',
    }, n.r.ctx));

    const v = ventanaDe('mes', HOY);
    const c = caja(flujoDeCaja(n.e, v));

    // Solo la primera: 4 × $2.500.
    expect(c.entroCent).toBe(pesos(10_000));

    n.r.en('2026-09-20T13:00:00.000Z');
    n.paso((x) => cobrar(x, { clienteId: n.dos, montoCent: pesos(5000), medio: 'efectivo' }, n.r.ctx));

    expect(caja(flujoDeCaja(n.e, v)).entroCent).toBe(pesos(15_000));
  });

  it('una compra al contado sale; una en cuenta NO sale, y se avisa', () => {
    const n = negocio();
    n.r.en('2026-09-12T13:00:00.000Z');
    n.paso((x) => entrarMercaderia(x, {
      proveedorId: n.proveedorId,
      items: [{ productoId: n.collar, cantidad: 10, costoUnitarioCent: pesos(1000) }],
      condicionPago: 'contado',
    }, n.r.ctx));
    n.paso((x) => entrarMercaderia(x, {
      proveedorId: n.proveedorId,
      items: [{ productoId: n.pelota, cantidad: 20, costoUnitarioCent: pesos(400) }],
      condicionPago: 'cuenta',
    }, n.r.ctx));

    const v = ventanaDe('mes', HOY);
    const movs = flujoDeCaja(n.e, v);

    /*
     * La carga inicial de los dos productos también es una compra al contado
     * ($30.000 + $4.000), así que salieron $10.000 más: $44.000. La de cuenta
     * NO está, y por eso existe el cartel.
     */
    expect(caja(movs).salioCent).toBe(pesos(44_000));
    expect(movs.some((m) => m.montoCent === pesos(8000))).toBe(false);

    const aviso = comprasSinPagar(n.e, v);
    expect(aviso.cuantas).toBe(1);
    expect(aviso.totalCent).toBe(pesos(8000));
  });

  it('un gasto sale, y uno anulado deja de salir', () => {
    const n = negocio();
    n.r.en('2026-09-15T13:00:00.000Z');
    n.paso((x) => registrarGasto(x, {
      montoCent: pesos(15_000), categoria: 'combustible', medio: 'efectivo', nota: 'Nafta',
    }, n.r.ctx));
    n.paso((x) => registrarGasto(x, {
      montoCent: pesos(3000), categoria: 'empaque', medio: 'efectivo',
    }, n.r.ctx));

    const v = ventanaDe('mes', HOY);
    const antes = caja(flujoDeCaja(n.e, v)).salioCent;

    const gastoId = n.e.gastos.find((g) => g.montoCent === pesos(15_000))!.id;
    n.paso((x) => anularGasto(x, gastoId, n.r.ctx));

    expect(caja(flujoDeCaja(n.e, v)).salioCent).toBe(antes - pesos(15_000));
    expect(gastosDelPeriodo(n.e, v)).toHaveLength(1);
  });

  it('una venta anulada saca de la caja lo que había cobrado', () => {
    const n = negocio();
    n.r.en('2026-09-10T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 4 }], formaPago: 'efectivo',
    }, n.r.ctx));

    const v = ventanaDe('mes', HOY);
    expect(caja(flujoDeCaja(n.e, v)).entroCent).toBe(pesos(10_000));

    const ventaId = n.e.ventas[0]!.id;
    n.paso((x) => anularVenta(x, ventaId, n.r.ctx));

    expect(caja(flujoDeCaja(n.e, v)).entroCent).toBe(0);
  });

  it('lo del mes anterior no se mezcla', () => {
    const n = negocio();
    n.r.en('2026-08-14T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 2 }], formaPago: 'efectivo',
    }, n.r.ctx));
    n.r.en('2026-09-14T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 8 }], formaPago: 'efectivo',
    }, n.r.ctx));

    expect(caja(flujoDeCaja(n.e, ventanaDe('anterior', HOY))).entroCent).toBe(pesos(5000));
    expect(caja(flujoDeCaja(n.e, ventanaDe('mes', HOY))).entroCent).toBe(pesos(20_000));
  });

  it('el neto puede dar negativo, y eso es información', () => {
    const n = negocio();
    n.r.en('2026-09-15T13:00:00.000Z');
    n.paso((x) => registrarGasto(x, {
      montoCent: pesos(50_000), categoria: 'flete', medio: 'efectivo',
    }, n.r.ctx));

    const c = caja(flujoDeCaja(n.e, ventanaDe('mes', HOY)));
    expect(c.netoCent).toBeLessThan(0);
    expect(c.netoCent).toBe(c.entroCent - c.salioCent);
  });

  it('el movimiento más nuevo va primero', () => {
    const n = negocio();
    n.r.en('2026-09-05T13:00:00.000Z');
    n.paso((x) => registrarGasto(x, { montoCent: pesos(1000), categoria: 'otros', medio: 'efectivo' }, n.r.ctx));
    n.r.en('2026-09-25T13:00:00.000Z');
    n.paso((x) => registrarGasto(x, { montoCent: pesos(2000), categoria: 'otros', medio: 'efectivo' }, n.r.ctx));

    const movs = flujoDeCaja(n.e, ventanaDe('mes', HOY));
    expect(movs[0]!.montoCent).toBe(pesos(2000));
  });
});

// ---------------------------------------------------------------------------
// El cuadro de resultados
// ---------------------------------------------------------------------------

describe('el cuadro de resultados', () => {
  it('ventas − costo = bruta, y bruta − gastos = neta', () => {
    const n = negocio();
    n.r.en('2026-09-10T13:00:00.000Z');
    // 4 collares: vende $10.000, le costaron $4.000.
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 4 }], formaPago: 'efectivo',
    }, n.r.ctx));
    n.paso((x) => registrarGasto(x, {
      montoCent: pesos(1500), categoria: 'combustible', medio: 'efectivo',
    }, n.r.ctx));

    const res = resultado(n.e, ventanaDe('mes', HOY));
    expect(res.ventasCent).toBe(pesos(10_000));
    expect(res.costoCent).toBe(pesos(4000));
    expect(res.brutaCent).toBe(pesos(6000));
    expect(res.gastosCent).toBe(pesos(1500));
    expect(res.netaCent).toBe(pesos(4500));
    expect(res.brutaCent).toBe(res.ventasCent - res.costoCent);
    expect(res.netaCent).toBe(res.brutaCent - res.gastosCent);
  });

  it('los márgenes salen sobre lo vendido', () => {
    const n = negocio();
    n.r.en('2026-09-10T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 4 }], formaPago: 'efectivo',
    }, n.r.ctx));
    n.paso((x) => registrarGasto(x, {
      montoCent: pesos(1500), categoria: 'flete', medio: 'efectivo',
    }, n.r.ctx));

    const res = resultado(n.e, ventanaDe('mes', HOY));
    expect(res.margenBruto).toBeCloseTo(0.6, 5);
    expect(res.margenNeto).toBeCloseTo(0.45, 5);
  });

  it('sin ventas los márgenes son cero y no NaN', () => {
    const n = negocio();
    n.r.en('2026-09-15T13:00:00.000Z');
    n.paso((x) => registrarGasto(x, { montoCent: pesos(9000), categoria: 'otros', medio: 'efectivo' }, n.r.ctx));

    const res = resultado(n.e, ventanaDe('mes', HOY));
    expect(res.margenBruto).toBe(0);
    expect(res.margenNeto).toBe(0);
    // Sin vender nada, los gastos dejan la ganancia neta en rojo. Es correcto.
    expect(res.netaCent).toBe(pesos(-9000));
  });

  it('LA CAJA Y EL RESULTADO DAN DISTINTO, y los dos están bien', () => {
    /*
     * El caso que justifica todo el rediseño. Un mes en el que vende bien a
     * cuenta y compra al contado: el negocio ganó plata y en el bolsillo hay
     * menos que antes.
     */
    const n = negocio();
    n.r.en('2026-09-10T13:00:00.000Z');
    // Vende 10 collares A CUENTA: factura $25.000, cobra $0.
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 10 }], formaPago: 'cuenta',
    }, n.r.ctx));

    const v = ventanaDe('mes', HOY);
    const res = resultado(n.e, v);
    const c = caja(flujoDeCaja(n.e, v));

    // Ganancia bruta: $25.000 − $10.000 de costo.
    expect(res.brutaCent).toBe(pesos(15_000));
    expect(res.netaCent).toBe(pesos(15_000));

    // Caja: no entró un peso, y la carga inicial de $34.000 salió.
    expect(c.entroCent).toBe(0);
    expect(c.salioCent).toBe(pesos(34_000));
    expect(c.netoCent).toBe(pesos(-34_000));

    expect(res.netaCent).not.toBe(c.netoCent);
  });
});

// ---------------------------------------------------------------------------
// Reporte: ventas y margen por producto
// ---------------------------------------------------------------------------

describe('ventas y margen por producto', () => {
  it('junta las ventas del mismo producto y ordena por ganancia', () => {
    const n = negocio();
    n.r.en('2026-09-10T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno,
      items: [{ productoId: n.collar, cantidad: 3 }, { productoId: n.pelota, cantidad: 5 }],
      formaPago: 'efectivo',
    }, n.r.ctx));
    n.r.en('2026-09-18T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.dos, items: [{ productoId: n.collar, cantidad: 2 }], formaPago: 'efectivo',
    }, n.r.ctx));

    const filas = ventasPorProducto(n.e, ventanaDe('mes', HOY));
    expect(filas).toHaveLength(2);

    const collar = filas.find((f) => f.nombre === 'Collar')!;
    expect(collar.unidades).toBe(5);
    expect(collar.ventaCent).toBe(pesos(12_500));
    expect(collar.costoCent).toBe(pesos(5000));
    expect(collar.gananciaCent).toBe(pesos(7500));
    expect(collar.margen).toBeCloseTo(0.6, 5);
    expect(collar.codigo).toBe('101');

    // El collar deja $7.500 y la pelota $1.500: el collar va primero.
    expect(filas[0]!.nombre).toBe('Collar');
  });

  it('el costo queda congelado: cambiar el costo hoy no reescribe lo vendido', () => {
    const n = negocio();
    n.r.en('2026-09-10T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 4 }], formaPago: 'efectivo',
    }, n.r.ctx));

    const antes = ventasPorProducto(n.e, ventanaDe('mes', HOY))[0]!;

    // Entra mercadería al doble de costo, después de la venta.
    n.r.en('2026-09-20T13:00:00.000Z');
    n.paso((x) => entrarMercaderia(x, {
      proveedorId: n.proveedorId,
      items: [{ productoId: n.collar, cantidad: 5, costoUnitarioCent: pesos(2000) }],
      condicionPago: 'contado',
    }, n.r.ctx));

    const despues = ventasPorProducto(n.e, ventanaDe('mes', HOY))[0]!;
    expect(despues.costoCent).toBe(antes.costoCent);
    expect(despues.gananciaCent).toBe(antes.gananciaCent);
  });

  it('una venta anulada no aparece', () => {
    const n = negocio();
    n.r.en('2026-09-10T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.pelota, cantidad: 5 }], formaPago: 'efectivo',
    }, n.r.ctx));
    n.paso((x) => anularVenta(x, n.e.ventas[0]!.id, n.r.ctx));

    expect(ventasPorProducto(n.e, ventanaDe('mes', HOY))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Reporte: cuentas por cobrar
// ---------------------------------------------------------------------------

describe('cuentas por cobrar', () => {
  it('NO se filtra por período: es plata que está en la calle hoy', () => {
    const n = negocio();
    // Una venta a cuenta de hace dos meses.
    n.r.en('2026-07-10T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 4 }], formaPago: 'cuenta',
    }, n.r.ctx));

    // Mirando septiembre, esa deuda TIENE que seguir apareciendo.
    const deSeptiembre = porCobrar(n.e, HOY);
    expect(deSeptiembre).toHaveLength(1);
    expect(deSeptiembre[0]!.saldoCent).toBe(pesos(10_000));
    expect(deSeptiembre[0]!.dias).toBeGreaterThan(70);
  });

  it('el que hace más que debe va primero, y el que pagó desaparece', () => {
    const n = negocio();
    n.r.en('2026-09-05T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 2 }], formaPago: 'cuenta',
    }, n.r.ctx));
    n.r.en('2026-09-25T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.dos, items: [{ productoId: n.collar, cantidad: 2 }], formaPago: 'cuenta',
    }, n.r.ctx));

    expect(porCobrar(n.e, HOY).map((f) => f.nombre)).toEqual(['Pet Shop Uno', 'Veterinaria Dos']);

    n.paso((x) => cobrar(x, { clienteId: n.uno, montoCent: pesos(5000), medio: 'efectivo' }, n.r.ctx));
    expect(porCobrar(n.e, HOY).map((f) => f.nombre)).toEqual(['Veterinaria Dos']);
  });
});

// ---------------------------------------------------------------------------
// Reporte: valorización de stock
// ---------------------------------------------------------------------------

describe('valorización de stock', () => {
  it('suma costo × unidades y cuenta lo que hay', () => {
    const n = negocio();
    // 30 collares a $1.000 + 10 pelotas a $400 = $34.000.
    const val = valorizacionDeStock(n.e);
    expect(val.totalCent).toBe(pesos(34_000));
    expect(val.unidades).toBe(40);
    expect(val.filas).toHaveLength(2);
    expect(val.filas[0]!.nombre).toBe('Collar');
  });

  it('el stock negativo no resta', () => {
    const n = negocio();
    n.r.en('2026-09-10T13:00:00.000Z');
    // Vende 12 pelotas teniendo 10: quedan −2.
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.pelota, cantidad: 12 }], formaPago: 'efectivo',
    }, n.r.ctx));

    const val = valorizacionDeStock(n.e);
    const pelota = val.filas.find((f) => f.nombre === 'Pelota')!;
    expect(pelota.stock).toBe(-2);
    // Vale null, no −$800: un faltante es un error de carga, no plata en contra.
    expect(pelota.valorCent).toBeNull();
    expect(val.totalCent).toBe(pesos(30_000));
    expect(val.unidades).toBe(30);
  });

  it('sin costo cargado el valor es null y se avisa, no es cero', () => {
    const n = negocio();
    n.paso((x) => altaProducto(x, { nombre: 'Mordillo', precioCent: pesos(900) }, n.r.ctx));
    const mordillo = n.e.productos.find((p) => p.nombre === 'Mordillo')!.id;
    n.r.en('2026-09-08T13:00:00.000Z');
    n.paso((x) => entrarMercaderia(x, {
      proveedorId: n.proveedorId,
      items: [{ productoId: mordillo, cantidad: 5, costoUnitarioCent: 0 }],
      condicionPago: 'contado',
    }, n.r.ctx));

    const val = valorizacionDeStock(n.e);
    const fila = val.filas.find((f) => f.nombre === 'Mordillo')!;
    expect(fila.stock).toBe(5);
    expect(fila.valorCent).toBeNull();
    expect(val.sinCosto).toBe(1);
    // Y no infló el total.
    expect(val.totalCent).toBe(pesos(34_000));
  });

  it('un producto sin stock no ensucia la lista', () => {
    const n = negocio();
    n.paso((x) => altaProducto(x, { nombre: 'Correa', precioCent: pesos(1200) }, n.r.ctx));
    expect(valorizacionDeStock(n.e).filas.some((f) => f.nombre === 'Correa')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bajar a planilla
// ---------------------------------------------------------------------------

describe('las planillas', () => {
  it('la caja lleva dos columnas, entró y salió, y nunca las dos llenas', () => {
    const n = negocio();
    n.r.en('2026-09-10T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 4 }], formaPago: 'efectivo',
    }, n.r.ctx));

    const p = planillaDeCaja(flujoDeCaja(n.e, ventanaDe('mes', HOY)));
    expect(p.columnas).toEqual(['Fecha', 'Concepto', 'Detalle', 'Entró', 'Salió']);
    for (const fila of p.filas) {
      const llenas = [fila[3], fila[4]].filter((x) => x !== null).length;
      expect(llenas).toBe(1);
    }
  });

  it('los importes van en pesos y con coma decimal, que es lo que entiende Excel', () => {
    const n = negocio();
    n.r.en('2026-09-15T13:00:00.000Z');
    n.paso((x) => registrarGasto(x, {
      montoCent: 1234_56, categoria: 'flete', medio: 'transferencia', nota: 'Acarreo',
    }, n.r.ctx));

    const p = planillaDeGastos(gastosDelPeriodo(n.e, ventanaDe('mes', HOY)));
    const csv = csvDe(p.columnas, p.filas);

    expect(csv).toContain('1234,56');
    expect(csv).not.toContain('1234.56');
    expect(csv.split('\r\n')[0]).toBe('Fecha;Categoría;Detalle;Medio de pago;Monto');
    expect(csv).toContain('15/09/2026');
  });

  it('un texto con punto y coma adentro no parte la fila', () => {
    const n = negocio();
    n.r.en('2026-09-15T13:00:00.000Z');
    n.paso((x) => registrarGasto(x, {
      montoCent: pesos(500), categoria: 'otros', medio: 'efectivo', nota: 'Peaje; ida y vuelta',
    }, n.r.ctx));

    const p = planillaDeGastos(gastosDelPeriodo(n.e, ventanaDe('mes', HOY)));
    const cuerpo = csvDe(p.columnas, p.filas).split('\r\n')[1]!;
    expect(cuerpo).toContain('"Peaje; ida y vuelta"');
    expect(cuerpo.split(';')).toHaveLength(6); // la nota aporta un ; adentro de comillas
  });

  it('el margen sale como número, para poder promediarlo', () => {
    const n = negocio();
    n.r.en('2026-09-10T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 4 }], formaPago: 'efectivo',
    }, n.r.ctx));

    const p = planillaDeProductos(ventasPorProducto(n.e, ventanaDe('mes', HOY)));
    expect(p.filas[0]![6]).toBe(60);
  });

  it('el stock y las cuentas por cobrar también bajan', () => {
    const n = negocio();
    n.r.en('2026-09-05T13:00:00.000Z');
    n.paso((x) => vender(x, {
      clienteId: n.uno, items: [{ productoId: n.collar, cantidad: 2 }], formaPago: 'cuenta',
    }, n.r.ctx));

    const stock = planillaDeStock(valorizacionDeStock(n.e).filas);
    expect(stock.filas.length).toBeGreaterThan(0);
    expect(csvDe(stock.columnas, stock.filas)).toContain('Collar');

    const deudas = planillaPorCobrar(porCobrar(n.e, HOY));
    expect(csvDe(deudas.columnas, deudas.filas)).toContain('Pet Shop Uno');
  });

  it('una planilla vacía es solo el encabezado, no revienta', () => {
    const p = planillaDeCaja([]);
    expect(csvDe(p.columnas, p.filas)).toBe('Fecha;Concepto;Detalle;Entró;Salió');
  });
});
