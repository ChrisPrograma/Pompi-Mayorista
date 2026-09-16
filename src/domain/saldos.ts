/**
 * Cuentas corrientes: las dos puntas de su plata.
 *
 * El saldo tampoco es una columna. Es ventas a cuenta menos pagos, calculado
 * cada vez. Así no existe el caso de un saldo guardado que quedó desfasado.
 */

import type { Cent } from './money.ts';
import type { PagoCliente, Uuid, Venta } from './types.ts';

export interface SaldoCliente {
  clienteId: Uuid;
  saldoCent: Cent;
  /** Fecha de la venta impaga más antigua que todavía no está cubierta por pagos. */
  deudaMasViejaIso: string | null;
  diasAtraso: number | null;
}

/**
 * Los pagos se imputan de la deuda más vieja a la más nueva (FIFO).
 * Es como lo hace cualquier cuenta corriente de verdad, y es lo que permite
 * decir "te debe desde hace 41 días" en vez de un promedio sin sentido.
 */
export const saldoCliente = (
  clienteId: Uuid,
  ventas: Venta[],
  pagos: PagoCliente[],
  hoyIso: string,
): SaldoCliente => {
  const impagas = ventas
    .filter((v) => v.clienteId === clienteId && v.totalCent > v.cobradoCent)
    .map((v) => ({ fecha: v.fecha, pendiente: v.totalCent - v.cobradoCent }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  let bolsaPagos = pagos
    .filter((p) => p.clienteId === clienteId)
    .reduce((a, p) => a + p.montoCent, 0);

  let deudaMasViejaIso: string | null = null;
  let saldoCent = 0;

  for (const v of impagas) {
    const aplicado = Math.min(bolsaPagos, v.pendiente);
    bolsaPagos -= aplicado;
    const resto = v.pendiente - aplicado;
    if (resto > 0) {
      saldoCent += resto;
      if (deudaMasViejaIso === null) deudaMasViejaIso = v.fecha;
    }
  }

  const diasAtraso =
    deudaMasViejaIso === null ? null : diasEntre(deudaMasViejaIso, hoyIso);

  return { clienteId, saldoCent, deudaMasViejaIso, diasAtraso };
};

export const diasEntre = (desdeIso: string, hastaIso: string): number => {
  const d = Date.parse(desdeIso);
  const h = Date.parse(hastaIso);
  return Math.max(0, Math.floor((h - d) / 86_400_000));
};

/**
 * Clasificación de una deuda por antigüedad.
 * El umbral no está fijo acá: lo define el cliente (pregunta 18 de la lista).
 */
export type Antiguedad = 'reciente' | 'atrasado' | 'muy_atrasado';

export const clasificar = (
  dias: number,
  umbrales: { atrasado: number; muyAtrasado: number } = { atrasado: 15, muyAtrasado: 30 },
): Antiguedad => {
  if (dias > umbrales.muyAtrasado) return 'muy_atrasado';
  if (dias > umbrales.atrasado) return 'atrasado';
  return 'reciente';
};

/** Total en la calle: la suma de lo que le deben todos. */
export const totalEnLaCalle = (
  ventas: Venta[],
  pagos: PagoCliente[],
  hoyIso: string,
): Cent => {
  const clientes = [...new Set(ventas.map((v) => v.clienteId))];
  return clientes.reduce(
    (a, c) => a + saldoCliente(c, ventas, pagos, hoyIso).saldoCent,
    0,
  );
};
