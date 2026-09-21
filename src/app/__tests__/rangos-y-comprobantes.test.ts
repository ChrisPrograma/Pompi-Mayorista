/**
 * Tests de los rangos del inicio y del texto de los comprobantes.
 *
 * Los dos son de la misma familia: cosas que se ven bien en la pantalla y están
 * mal en los bordes. Un rango que se corre un día deja afuera lo de ayer justo
 * cuando él está cerrando la quincena, y un comprobante anulado que no dice que
 * está anulado es peor que no mandar nada.
 */

import { describe, expect, it } from 'vitest';
import { dentroDelRango, nombreDelRango } from '../../domain/fechas.ts';
import { formatear, pesos } from '../../domain/money.ts';
import { estadoDelRecibo, resumenDelRecibo, type DatosRecibo } from '../../ui/recibo.ts';
import { anulacionesDelRango, reciboDeIngreso, reciboDeVenta, vistaHoy } from '../../ui/vistas.ts';
import { estadoVacio, type EstadoApp } from '../estado.ts';
import type { Compra, Venta } from '../../domain/types.ts';

/* Lunes 21 de septiembre de 2026, 14:00 de acá. */
const HOY = '2026-09-21T17:00:00.000Z';

describe('los tres rangos del inicio', () => {
  it('la semana son los últimos 7 días contando hoy', () => {
    /*
     * De calendario, no de 24 horas. Si mira el lunes a la mañana, lo del
     * martes pasado a la tarde tiene que estar: para él eso es "esta semana",
     * aunque hayan pasado 8 × 24 h menos un rato.
     */
    expect(dentroDelRango('2026-09-21T10:00:00.000Z', HOY, 'semana')).toBe(true);  // hoy
    expect(dentroDelRango('2026-09-15T22:00:00.000Z', HOY, 'semana')).toBe(true);  // hace 6 días
    expect(dentroDelRango('2026-09-14T22:00:00.000Z', HOY, 'semana')).toBe(false); // hace 7
  });

  it('la quincena son los últimos 15 días', () => {
    expect(dentroDelRango('2026-09-07T13:00:00.000Z', HOY, 'quincena')).toBe(true);
    expect(dentroDelRango('2026-09-06T13:00:00.000Z', HOY, 'quincena')).toBe(false);
  });

  it('el mes es el mes CALENDARIO, no los últimos 30 días', () => {
    /*
     * La diferencia importa el día del cierre: con una ventana móvil, lo del 3
     * desaparecería el 2 del mes siguiente, justo cuando está sumando el mes.
     */
    expect(dentroDelRango('2026-09-01T12:00:00.000Z', HOY, 'mes')).toBe(true);
    expect(dentroDelRango('2026-08-31T12:00:00.000Z', HOY, 'mes')).toBe(false);
    // 31 de agosto está DENTRO de los últimos 30 días y aun así queda afuera.
    expect(dentroDelRango('2026-08-31T12:00:00.000Z', HOY, 'quincena')).toBe(false);
  });

  it('los bordes se miran en hora de acá, no en UTC', () => {
    // 22:00 del 30 de septiembre acá ya es el 1° de octubre en UTC.
    const treintaALas22 = '2026-10-01T01:00:00.000Z';
    expect(dentroDelRango(treintaALas22, '2026-09-30T23:00:00.000Z', 'mes')).toBe(true);
  });

  it('lo de mañana no entra en la semana ni en la quincena', () => {
    /*
     * Un aparato con la fecha adelantada no puede meter cosas del futuro en una
     * ventana que termina hoy. El MES es otra cosa y por eso no está acá: es el
     * mes calendario completo, así que el 30 sigue siendo de septiembre aunque
     * hoy sea 21. Eso es lo correcto para un cierre de mes.
     */
    const manana = '2026-09-22T14:00:00.000Z';
    expect(dentroDelRango(manana, HOY, 'semana')).toBe(false);
    expect(dentroDelRango(manana, HOY, 'quincena')).toBe(false);
    expect(dentroDelRango(manana, HOY, 'mes')).toBe(true);
  });

  it('cada rango se llama como corresponde en la pantalla', () => {
    expect(nombreDelRango('semana', HOY)).toBe('en la semana');
    expect(nombreDelRango('quincena', HOY)).toBe('en la quincena');
    expect(nombreDelRango('mes', HOY)).toBe('en septiembre');
  });
});

// ---------------------------------------------------------------------------

const compra = (id: string, fecha: string, totalCent: number, anuladaEn?: string): Compra => ({
  id,
  negocioId: 'n1',
  proveedorId: 'prov1',
  fecha,
  condicionPago: 'cuenta',
  totalCent,
  items: [{
    id: `${id}-1`, compraId: id, productoId: 'p1', cantidad: 5, costoUnitarioCent: totalCent / 5,
  }],
  ...(anuladaEn ? { anuladaEn } : {}),
});

const venta = (id: string, fecha: string, totalCent: number, anuladaEn?: string): Venta => ({
  id,
  negocioId: 'n1',
  clienteId: 'c1',
  fecha,
  totalCent,
  cobradoCent: totalCent,
  formaPago: 'efectivo',
  items: [{
    id: `${id}-1`, ventaId: id, productoId: 'p1', cantidad: 2,
    precioUnitarioCent: totalCent / 2, costoUnitarioCent: pesos(50),
  }],
  ...(anuladaEn ? { anuladaEn } : {}),
});

const base = (): EstadoApp => ({
  ...estadoVacio('n1', 'l1'),
  proveedores: [{ id: 'prov1', negocioId: 'n1', nombre: 'Distribuidora Once', activo: true }],
  clientes: [{ id: 'c1', negocioId: 'n1', nombre: 'Veterinaria del Norte', activo: true }],
  productos: [{
    id: 'p1', negocioId: 'n1', codigo: '1179', nombre: 'Pretal Plateado', activo: true,
  }],
});

describe('los ingresos, según el rango elegido', () => {
  const e: EstadoApp = {
    ...base(),
    compras: [
      compra('hoy', HOY, pesos(10_000)),
      compra('hace3', '2026-09-18T14:00:00.000Z', pesos(20_000)),
      compra('hace10', '2026-09-11T14:00:00.000Z', pesos(40_000)),
      compra('mesPasado', '2026-08-25T14:00:00.000Z', pesos(80_000)),
    ],
  };

  it('la semana trae solo lo de los últimos 7 días', () => {
    const v = vistaHoy(e, HOY, 'semana');
    expect(v.ingresosDelRango.map((x) => x.id)).toEqual(['hoy', 'hace3']);
    expect(v.ingresadoDelRangoCent).toBe(pesos(30_000));
  });

  it('la quincena suma lo de hace diez días', () => {
    const v = vistaHoy(e, HOY, 'quincena');
    expect(v.ingresosDelRango.map((x) => x.id)).toEqual(['hoy', 'hace3', 'hace10']);
    expect(v.ingresadoDelRangoCent).toBe(pesos(70_000));
  });

  it('el mes trae todo septiembre y NADA de agosto', () => {
    const v = vistaHoy(e, HOY, 'mes');
    expect(v.ingresosDelRango.map((x) => x.id)).not.toContain('mesPasado');
    expect(v.ingresadoDelRangoCent).toBe(pesos(70_000));
  });

  it('sin rango, el inicio abre en el mes', () => {
    expect(vistaHoy(e, HOY).rango).toBe('mes');
    expect(vistaHoy(e, HOY).ingresosDelRango).toHaveLength(3);
  });

  it('los anulados no suman en el total ni aparecen en la lista', () => {
    const conAnulada: EstadoApp = {
      ...e,
      compras: [...e.compras, compra('anulada', HOY, pesos(500_000), HOY)],
    };
    const v = vistaHoy(conAnulada, HOY, 'mes');
    expect(v.ingresosDelRango.map((x) => x.id)).not.toContain('anulada');
    expect(v.ingresadoDelRangoCent).toBe(pesos(70_000));
    // Pero se ve, en su bloque.
    expect(v.anuladasDelRango.map((x) => x.id)).toContain('anulada');
  });

  it('cada ingreso trae su día, no solo la hora', () => {
    // Con el rango en semana o mes, una hora suelta no ubica nada.
    expect(vistaHoy(e, HOY, 'mes').ingresosDelRango[0]!.fecha).toBe(HOY);
  });
});

describe('los anulados, según el rango elegido', () => {
  const e: EstadoApp = {
    ...base(),
    ventas: [venta('v-vieja', '2026-09-02T14:00:00.000Z', pesos(30_000), '2026-09-10T14:00:00.000Z')],
    compras: [compra('i-hoy', '2026-09-01T14:00:00.000Z', pesos(15_000), HOY)],
  };

  it('junta ventas e ingresos anulados, del más nuevo al más viejo', () => {
    const lista = anulacionesDelRango(e, HOY, 'mes');
    expect(lista.map((x) => x.tipo)).toEqual(['ingreso', 'venta']);
    expect(lista.map((x) => x.id)).toEqual(['i-hoy', 'v-vieja']);
  });

  it('cada uno trae su fecha original Y la de anulación', () => {
    const [ingreso] = anulacionesDelRango(e, HOY, 'mes');
    expect(ingreso!.fecha).toBe('2026-09-01T14:00:00.000Z');
    expect(ingreso!.anuladaEn).toBe(HOY);
  });

  it('filtra por la fecha de ANULACIÓN, no por la de la operación', () => {
    /*
     * La venta es del 2 y se anuló el 10. En "semana" —últimos 7 días desde el
     * 21— no entra ninguna de las dos fechas, así que no aparece. Pero una
     * venta vieja anulada HOY sí tiene que aparecer en la semana.
     */
    expect(anulacionesDelRango(e, HOY, 'semana').map((x) => x.id)).toEqual(['i-hoy']);
    expect(anulacionesDelRango(e, HOY, 'quincena').map((x) => x.id)).toEqual(['i-hoy', 'v-vieja']);
  });

  it('en octubre, lo anulado en septiembre ya no está', () => {
    expect(anulacionesDelRango(e, '2026-10-02T14:00:00.000Z', 'mes')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('el texto del comprobante', () => {
  const e = base();
  const NEGOCIO = 'Pompi Mayorista';

  it('una venta lleva negocio, comercio, productos y total', () => {
    const texto = resumenDelRecibo(reciboDeVenta(e, venta('v1', HOY, pesos(13_000)), NEGOCIO));
    const todo = texto.join('\n');

    expect(todo).toContain('Pompi Mayorista');
    expect(todo).toContain('Comprobante para');
    expect(todo).toContain('Veterinaria del Norte');
    expect(todo).toContain('1179 · Pretal Plateado');
    // El importe se arma con el mismo formateador que usa la app: lleva un
    // espacio duro entre el signo y el número, y escribirlo a mano no coincide.
    expect(todo).toContain(`2 × ${formatear(pesos(6500))}`);
    expect(todo).toContain(`Total: ${formatear(pesos(13_000))}`);
    expect(todo).toContain('PAGADO');
    expect(todo).not.toContain('ANULADO');
  });

  it('una venta ANULADA lo dice en el primer renglón', () => {
    /*
     * El renglón cero y no el último: quien lo recibe por WhatsApp ve la
     * previsualización del texto, que son las primeras líneas.
     */
    const v = venta('v1', HOY, pesos(13_000), '2026-09-21T19:00:00.000Z');
    const texto = resumenDelRecibo(reciboDeVenta(e, v, NEGOCIO));

    expect(texto[0]).toContain('COMPROBANTE ANULADO');
    expect(texto[0]).toContain('21/09/2026');
    expect(texto.join('\n')).toContain('ANULADO');
  });

  it('un ingreso dice de quién vino y que los importes son de costo', () => {
    const texto = resumenDelRecibo(reciboDeIngreso(e, compra('c1', HOY, pesos(20_000)), NEGOCIO));
    const todo = texto.join('\n');

    expect(todo).toContain('Entrada de mercadería de');
    expect(todo).toContain('Distribuidora Once');
    expect(todo).toContain(`5 × ${formatear(pesos(4000))} de costo`);
    expect(todo).toContain(`Total: ${formatear(pesos(20_000))}`);
    // En cuenta: todavía no le pagó nada de esta entrada.
    expect(todo).toContain(`Queda a pagar: ${formatear(pesos(20_000))}`);
  });

  it('un ingreso ANULADO también lo grita', () => {
    const c = compra('c1', HOY, pesos(20_000), '2026-09-21T20:00:00.000Z');
    const texto = resumenDelRecibo(reciboDeIngreso(e, c, NEGOCIO));

    expect(texto[0]).toContain('COMPROBANTE ANULADO');
    expect(texto.join('\n')).toContain('Distribuidora Once');
  });

  it('el estado dice lo que pasó, y anulado gana sobre todo lo demás', () => {
    const vta = (extra: Partial<DatosRecibo>): DatosRecibo => ({
      negocio: 'x', tipo: 'venta', cliente: 'y', fechaIso: HOY, lineas: [],
      totalCent: pesos(1000), pagadoCent: pesos(1000), saldoCent: 0, ...extra,
    });

    expect(estadoDelRecibo(vta({}))).toBe('PAGADO');
    expect(estadoDelRecibo(vta({ pagadoCent: pesos(400), saldoCent: pesos(600) }))).toBe('PAGO PARCIAL');
    expect(estadoDelRecibo(vta({ pagadoCent: 0, saldoCent: pesos(1000) }))).toBe('QUEDA EN CUENTA');
    expect(estadoDelRecibo(vta({ tipo: 'ingreso', pagadoCent: 0, saldoCent: pesos(1000) }))).toBe('QUEDA A PAGAR');
    // Una venta cobrada y después anulada dice ANULADO, no PAGADO.
    expect(estadoDelRecibo(vta({ anuladaEn: HOY }))).toBe('ANULADO');
  });

  it('el comprobante de una venta congela el precio de ESA venta', () => {
    // Aunque mañana cambie la lista, el texto de hoy dice lo que cobró hoy.
    const texto = resumenDelRecibo(reciboDeVenta(e, venta('v1', HOY, pesos(13_000)), NEGOCIO));
    expect(texto.join('\n')).toContain(formatear(pesos(6500)));
  });
});
