/**
 * Dinero.
 *
 * Todos los importes del sistema son ENTEROS DE CENTAVOS. Nunca float.
 * Un precio de $3.200 se guarda como 320000.
 *
 * El motivo no es purismo: los precios se multiplican por cantidades y después
 * se suman. Con punto flotante, el error aparece en el total de la venta, que es
 * exactamente donde el cliente lo ve y donde pierde la confianza en el sistema.
 */

/** Centavos. Siempre entero. */
export type Cent = number;

export class MoneyError extends Error {}

const assertEntero = (n: number, campo = 'importe'): void => {
  if (!Number.isInteger(n)) {
    throw new MoneyError(`${campo} tiene que ser un entero de centavos, llegó ${n}`);
  }
  if (!Number.isSafeInteger(n)) {
    throw new MoneyError(`${campo} fuera del rango seguro: ${n}`);
  }
};

/** Convierte pesos a centavos. pesos(3200) === 320000 */
export const pesos = (n: number): Cent => {
  const cent = Math.round(n * 100);
  assertEntero(cent, 'pesos()');
  return cent;
};

/** Convierte centavos a pesos como número (solo para mostrar, nunca para calcular). */
export const aPesos = (c: Cent): number => c / 100;

/** Suma una lista de importes. */
export const sumar = (...importes: Cent[]): Cent => {
  importes.forEach((i) => assertEntero(i));
  return importes.reduce((a, b) => a + b, 0);
};

/** Multiplica un importe por una cantidad entera (cantidad de unidades). */
export const porCantidad = (importe: Cent, cantidad: number): Cent => {
  assertEntero(importe);
  if (!Number.isInteger(cantidad)) {
    throw new MoneyError(`La cantidad tiene que ser entera, llegó ${cantidad}`);
  }
  return importe * cantidad;
};

/**
 * Redondeo comercial: al múltiplo más cercano.
 * redondearA(pesos(3576), pesos(100)) === pesos(3600)
 */
export const redondearA = (importe: Cent, multiplo: Cent): Cent => {
  assertEntero(importe);
  assertEntero(multiplo, 'múltiplo');
  if (multiplo <= 0) throw new MoneyError('El múltiplo tiene que ser mayor a cero');
  return Math.round(importe / multiplo) * multiplo;
};

const formateador = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Para mostrar en pantalla. "$3.200" */
export const formatear = (c: Cent): string => formateador.format(aPesos(c));

/**
 * Lo que él tipea, a centavos.
 *
 * Tolerante a propósito: acepta "3.200", "3200", "$ 3.200" y "3.200,50". En un
 * celular, parado en la calle, el punto de los miles sale solo y un campo que
 * rechaza "3.200" es un campo que lo frena.
 *
 * El punto se descarta como separador de miles y la coma es la decimal, que es
 * como se escribe acá. Lo que no se pueda leer vale 0, nunca `NaN`: un NaN se
 * propaga en silencio por todas las cuentas y aparece mucho después.
 */
export const aCentavos = (texto: string): Cent => {
  const limpio = texto.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? pesos(n) : 0;
};
