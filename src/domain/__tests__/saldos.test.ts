import { describe, expect, it } from 'vitest';
import { pesos } from '../money.ts';
import { clasificar, saldoCliente, totalEnLaCalle } from '../saldos.ts';
import type { MovimientoStock, PagoCliente, Producto, Venta } from '../types.ts';

const HOY = '2026-09-13T12:00:00Z';

const venta = (id: string, clienteId: string, fecha: string, total: number, cobrado = 0): Venta => ({
  id,
  negocioId: 'n1',
  clienteId,
  fecha,
  totalCent: pesos(total),
  cobradoCent: pesos(cobrado),
  formaPago: cobrado >= total ? 'efectivo' : 'cuenta',
  items: [],
});

const pago = (id: string, clienteId: string, monto: number, fecha: string): PagoCliente => ({
  id,
  negocioId: 'n1',
  clienteId,
  montoCent: pesos(monto),
  fecha,
  medio: 'efectivo',
});

describe('cuenta corriente de clientes', () => {
  it('el saldo es ventas a cuenta menos pagos', () => {
    const ventas = [
      venta('v1', 'c1', '2026-08-22T10:00:00Z', 100000),
      venta('v2', 'c1', '2026-09-05T10:00:00Z', 48500),
      venta('v3', 'c1', '2026-09-10T10:00:00Z', 60000, 60000), // cobrada en el momento
    ];
    const s = saldoCliente('c1', ventas, [], HOY);
    expect(s.saldoCent).toBe(pesos(148500));
  });

  it('los pagos se imputan de la deuda más vieja a la más nueva', () => {
    const ventas = [
      venta('v1', 'c1', '2026-08-01T10:00:00Z', 100000),
      venta('v2', 'c1', '2026-09-05T10:00:00Z', 50000),
    ];
    // Paga 100.000: cancela la vieja entera.
    const s = saldoCliente('c1', ventas, [pago('p1', 'c1', 100000, HOY)], HOY);

    expect(s.saldoCent).toBe(pesos(50000));
    // Y ahora la deuda más vieja es la de septiembre, no la de agosto.
    expect(s.deudaMasViejaIso).toBe('2026-09-05T10:00:00Z');
    expect(s.diasAtraso).toBe(8);
  });

  it('un pago parcial deja la deuda vieja viva y el atraso sigue contando desde ahí', () => {
    const ventas = [venta('v1', 'c1', '2026-08-03T10:00:00Z', 231000)];
    const s = saldoCliente('c1', ventas, [pago('p1', 'c1', 100000, HOY)], HOY);

    expect(s.saldoCent).toBe(pesos(131000));
    expect(s.deudaMasViejaIso).toBe('2026-08-03T10:00:00Z');
    expect(s.diasAtraso).toBe(41);
    expect(clasificar(s.diasAtraso!)).toBe('muy_atrasado');
  });

  it('un cliente al día no tiene atraso', () => {
    const s = saldoCliente('c1', [venta('v1', 'c1', HOY, 50000, 50000)], [], HOY);
    expect(s.saldoCent).toBe(0);
    expect(s.diasAtraso).toBeNull();
  });

  it('suma toda la plata que está en la calle', () => {
    const ventas = [
      venta('v1', 'c1', '2026-08-22T10:00:00Z', 148500),
      venta('v2', 'c2', '2026-09-05T10:00:00Z', 62300),
      venta('v3', 'c3', '2026-08-03T10:00:00Z', 231000),
    ];
    expect(totalEnLaCalle(ventas, [], HOY)).toBe(pesos(441800));
  });
});
