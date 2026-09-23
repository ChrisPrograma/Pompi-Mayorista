/**
 * Lo que sale de la app: la lista de precios que le manda a los comercios, y la
 * planilla de control que es solo para él.
 *
 * SON DOS COSAS DISTINTAS Y NO SE PARECEN EN NADA
 *
 * La **lista de precios** es pública: la recibe cualquier comercio por WhatsApp
 * y de ahí puede ir a parar a donde sea. Lleva código, nombre y precio de venta.
 * NADA MÁS. Ni el costo, ni la ganancia, ni el stock, ni un precio distinto para
 * alguno. Que un comercio vea cuánto le cuesta a él cada producto es el tipo de
 * cosa que hace perder un cliente y no se puede deshacer.
 *
 * La **planilla** es privada: se la baja él a su computadora y ahí sí va todo,
 * costo incluido.
 *
 * La regla, para el que toque esto en el futuro: **la función de la lista no
 * recibe costos**. No es que no los muestre — es que no los tiene. Trabaja sobre
 * un tipo propio (`LineaDeLista`) que solo tiene tres campos, así que agregarle
 * el costo a la lista no es un descuido posible: no compila. Hay tests que lo
 * fijan por si alguien cambia el tipo.
 */

import { formatear, type Cent } from '../domain/money.ts';

/** Lo ÚNICO que puede salir en una lista de precios. Tres campos y se acabó. */
export interface LineaDeLista {
  codigo?: string;
  nombre: string;
  precioCent: Cent;
}

/** Ordena como él los busca: por código numérico, y los sin código al final. */
const porCodigo = (
  a: { codigo?: string; nombre: string },
  b: { codigo?: string; nombre: string },
): number => {
  if (a.codigo && b.codigo) return Number(a.codigo) - Number(b.codigo);
  if (a.codigo) return -1;
  if (b.codigo) return 1;
  return a.nombre.localeCompare(b.nombre, 'es');
};

/**
 * La lista de precios, en texto, lista para pegar en WhatsApp.
 *
 * Texto y no imagen, a propósito: una lista de sesenta productos como imagen es
 * ilegible en un teléfono, no se puede buscar y no se puede copiar. En texto, el
 * comercio busca "collar" en el chat y lo encuentra.
 */
export const listaDePreciosTexto = (
  lineas: LineaDeLista[],
  negocio: string,
  fechaTexto: string,
): string => {
  const ordenadas = lineas.slice().sort(porCodigo);

  const cuerpo = ordenadas.map((l) =>
    `${l.codigo ? `${l.codigo} · ` : ''}${l.nombre}: ${formatear(l.precioCent)}`);

  return [
    `*${negocio}* · Lista de precios`,
    fechaTexto,
    '',
    ...cuerpo,
    '',
    `${ordenadas.length} ${ordenadas.length === 1 ? 'producto' : 'productos'}`,
    'Precios sujetos a cambio sin aviso.',
  ].join('\n');
};

// ---------------------------------------------------------------------------
// La planilla privada
// ---------------------------------------------------------------------------

/** Una fila de la planilla de control. Acá SÍ va todo: es solo para él. */
export interface FilaDePlanilla {
  codigo?: string;
  nombre: string;
  rubro?: string;
  stock: number;
  precioCent: Cent | null;
  costoCent: Cent | null;
}

export const COLUMNAS = [
  'Código', 'Nombre', 'Rubro', 'Stock actual',
  'Precio de lista', 'Costo unitario', 'Valor total de stock',
] as const;

/**
 * Un valor, listo para meter en un CSV que va a abrir Excel.
 *
 * Dos detalles que no son capricho:
 *
 *  - **Las comillas se duplican y el campo va entre comillas** si tiene el
 *    separador, comillas o un salto de línea. Un nombre con punto y coma
 *    —"Collar; chico"— partiría la fila en dos columnas sin esto.
 *  - **Los números van con COMA decimal**, porque un Excel en español así los
 *    entiende. Con punto, "4500.50" queda como texto y no se puede sumar.
 */
const campo = (v: string | number | null): string => {
  if (v === null) return '';
  if (typeof v === 'number') return String(v).replace('.', ',');
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/**
 * La planilla en CSV, separada por punto y coma.
 *
 * POR QUÉ CSV Y NO UN .xlsx DE VERDAD: un xlsx es un ZIP con varios XML adentro,
 * y para escribirlo hace falta una librería —unos 100 kB que viajarían al
 * teléfono en cada carga— o escribir un armador de ZIP a mano. El proyecto tiene
 * DOS dependencias de producción y es una decisión tomada. Excel abre este
 * archivo de doble clic y quedan las siete columnas separadas, que es lo que él
 * necesita; si algún día hace falta el .xlsx nativo (con formatos, fórmulas o
 * varias hojas), ahí sí conviene pagar la dependencia.
 *
 * El punto y coma, y no la coma, porque es lo que espera un Excel configurado en
 * español: con comas, mete todo en la primera columna.
 */
export const planillaCsv = (filas: FilaDePlanilla[]): string => {
  const cuerpo = filas.slice().sort(porCodigo).map((f) => [
    campo(f.codigo ?? ''),
    campo(f.nombre),
    campo(f.rubro ?? ''),
    campo(f.stock),
    campo(f.precioCent === null ? null : f.precioCent / 100),
    campo(f.costoCent === null ? null : f.costoCent / 100),
    // El valor del stock a costo: es la columna por la que existe la planilla.
    campo(f.costoCent === null ? null : (f.costoCent * Math.max(0, f.stock)) / 100),
  ].join(';'));

  return [COLUMNAS.join(';'), ...cuerpo].join('\r\n');
};

/**
 * El CSV como texto para bajar, con BOM adelante.
 *
 * Sin el BOM, Excel abre el archivo en su codificación vieja y los acentos salen
 * rotos: "Ñandú" queda "Ã‘andÃº". Son tres bytes que resuelven el problema más
 * reportado de los CSV en castellano.
 */
export const conBom = (csv: string): string => `﻿${csv}`;

/** Un nombre de archivo sin acentos ni espacios, con la fecha adentro. */
export const nombreDeArchivo = (negocio: string, dia: string, extension: string): string => {
  const limpio = negocio.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
  return `${limpio || 'productos'}-${dia}.${extension}`;
};
