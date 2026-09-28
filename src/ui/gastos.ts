/**
 * Las categorías de gasto, y cómo se ven.
 *
 * Aparte del componente por lo de siempre: acá se puede testear sin navegador,
 * y en el `.tsx` queda solo el dibujo.
 *
 * POR QUÉ CINCO Y NO QUINCE
 *
 * Una lista larga de categorías parece más precisa y produce el efecto
 * contrario: cuando hay que elegir entre quince chapitas con el motor andando y
 * el ticket en la mano, se toca "otros". A los dos meses el 80% de los gastos
 * está en "otros" y el desglose no dice absolutamente nada.
 *
 * Cinco entran en dos renglones en un teléfono, se distinguen de un vistazo, y
 * cada una junta plata suficiente como para que mirarla sirva. Salen de cómo
 * trabaja un mayorista que reparte en la calle, no de un plan de cuentas.
 */

import type { Cent } from '../domain/money.ts';
import type { CategoriaGasto, Gasto } from '../domain/types.ts';

export interface Categoria {
  id: CategoriaGasto;
  /** Lo que dice la chapita. Corto: tiene que entrar en un teléfono angosto. */
  texto: string;
  /** Lo que entra acá, para el que duda. Se muestra abajo del formulario. */
  ejemplo: string;
  icono: string;
}

export const CATEGORIAS: Categoria[] = [
  { id: 'flete', texto: 'Flete', ejemplo: 'envíos, acarreos, changarines', icono: 'i-truck' },
  { id: 'combustible', texto: 'Combustible', ejemplo: 'nafta, peaje, el vehículo', icono: 'i-fuel' },
  { id: 'empaque', texto: 'Empaque', ejemplo: 'bolsas, cajas, cinta', icono: 'i-box' },
  { id: 'insumos', texto: 'Insumos', ejemplo: 'servicios, teléfono, librería', icono: 'i-store' },
  { id: 'otros', texto: 'Otros', ejemplo: 'arreglos y lo que no entra arriba', icono: 'i-tool' },
];

const POR_ID = new Map(CATEGORIAS.map((c) => [c.id, c]));

/** La categoría, o "Otros" si llegara una desconocida de un servidor más nuevo. */
export const categoria = (id: CategoriaGasto): Categoria =>
  POR_ID.get(id) ?? CATEGORIAS[CATEGORIAS.length - 1]!;

/** Los medios de pago, con el nombre que usa él. */
export const MEDIOS: { id: Gasto['medio']; texto: string }[] = [
  { id: 'efectivo', texto: 'Efectivo' },
  { id: 'transferencia', texto: 'Transferencia' },
  { id: 'cheque', texto: 'Cheque' },
  { id: 'otro', texto: 'Otro' },
];

// ---------------------------------------------------------------------------
// Sumas
// ---------------------------------------------------------------------------

/**
 * Un gasto anulado no cuesta nada.
 *
 * La misma regla que rige a las ventas y las compras anuladas, escrita una sola
 * vez para que ninguna pantalla nueva se la olvide.
 */
export const vale = (g: Gasto): boolean => !g.anuladaEn;

/** Lo gastado en un rango, sin contar lo anulado. */
export const totalDeGastos = (gastos: Gasto[]): Cent =>
  gastos.filter(vale).reduce((a, g) => a + g.montoCent, 0);

export interface GastoPorCategoria {
  categoria: Categoria;
  totalCent: Cent;
  cuantos: number;
  /** Qué porcentaje del total del período se lleva. 0 a 100. */
  porcentaje: number;
}

/**
 * El desglose por categoría, de la que más se lleva a la que menos.
 *
 * Solo salen las categorías que tienen algo: una fila en cero no informa nada y
 * empuja hacia abajo las que sí importan.
 */
export const porCategoria = (gastos: Gasto[]): GastoPorCategoria[] => {
  const vivos = gastos.filter(vale);
  const total = vivos.reduce((a, g) => a + g.montoCent, 0);

  const suma = new Map<CategoriaGasto, { totalCent: Cent; cuantos: number }>();
  for (const g of vivos) {
    const actual = suma.get(g.categoria) ?? { totalCent: 0, cuantos: 0 };
    suma.set(g.categoria, {
      totalCent: actual.totalCent + g.montoCent,
      cuantos: actual.cuantos + 1,
    });
  }

  return [...suma.entries()]
    .map(([id, x]) => ({
      categoria: categoria(id),
      totalCent: x.totalCent,
      cuantos: x.cuantos,
      // Sin gastos el total es cero: dividir daría NaN y la barra quedaría rota.
      porcentaje: total > 0 ? Math.round((x.totalCent / total) * 100) : 0,
    }))
    .sort((a, b) => b.totalCent - a.totalCent);
};

// ---------------------------------------------------------------------------
// El campo del monto
// ---------------------------------------------------------------------------

/**
 * Lo que queda escrito en el campo del importe después de una tecla.
 *
 * Mismo criterio que el campo de cantidad, y por el mismo motivo: en septiembre
 * el cliente cargaba 6 unidades y quedaban 60 porque lo tipeado se pegaba a lo
 * que ya había. Acá se aceptan solo dígitos y UNA coma decimal, se comen los
 * ceros de adelante, y el campo arranca vacío.
 *
 * El punto se convierte en coma: en un teclado numérico de teléfono el
 * separador que aparece es el punto, y él escribe con coma.
 */
export const MAX_PESOS = 99_999_999;

export const textoDeMonto = (crudo: string): string => {
  const normalizado = crudo.replace(/\./g, ',');
  // Solo el primer separador vale: "12,50,30" no es un número.
  const [entero = '', ...resto] = normalizado.split(',');
  const soloEntero = entero.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  const recortado = soloEntero.slice(0, String(MAX_PESOS).length);

  if (resto.length === 0) return recortado;
  // Dos decimales y ni uno más: son centavos.
  const decimales = resto.join('').replace(/[^0-9]/g, '').slice(0, 2);
  return `${recortado},${decimales}`;
};

/** Los centavos que corresponden a lo escrito. Vacío es "todavía nada", no cero. */
export const centavosDeMonto = (texto: string): Cent | null => {
  if (!texto || texto === ',') return null;
  const [entero = '0', decimales = ''] = texto.split(',');
  const centavos = (decimales + '00').slice(0, 2);
  const n = Number(entero || '0') * 100 + Number(centavos);
  return Number.isFinite(n) && n > 0 ? n : null;
};
