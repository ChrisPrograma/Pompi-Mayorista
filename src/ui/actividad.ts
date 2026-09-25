/**
 * El feed de actividad: todo lo que pasó, en una sola lista y en orden.
 *
 * POR QUÉ UNA LISTA SOLA
 *
 * Hasta acá el inicio tenía tres bloques separados —lo vendido, lo que ingresó,
 * lo anulado—, cada uno con su rango y su paginado. Funcionaba, pero obligaba a
 * armar el orden de los hechos en la cabeza: una venta de las 14, un ingreso de
 * las 15 y la anulación de las 16 estaban en tres lugares distintos de la
 * pantalla, cada uno ordenado por su cuenta. Así es como lo muestran las
 * billeteras, y es como él ya está acostumbrado a leer movimientos: una tira,
 * de lo último a lo primero.
 *
 * QUÉ ES UN HECHO, Y POR QUÉ UNA VENTA ANULADA APARECE DOS VECES
 *
 * Cada fila es un HECHO, no una operación. Vender es un hecho; anular esa venta,
 * tres días después, es otro. Los dos pasaron, los dos están en el libro mayor y
 * los dos se muestran, cada uno en su fecha: la venta del 21 sale el 21, tachada
 * y marcada, y la anulación sale el 24. Es la REGLA 0 —nada se pisa, todo se
 * apila— dibujada en la pantalla.
 *
 * Esconder la venta original sería más limpio y más mentiroso: él necesita poder
 * mirar el 21 y ver lo que de verdad hizo ese día, incluido lo que después
 * deshizo.
 *
 * Este archivo es `.ts` y no `.tsx` a propósito: sin JSX adentro, el runner de
 * tests de Node lo puede leer y todo esto se prueba sin navegador.
 */

import type { Cent } from '../domain/money.ts';
import { diaLocal, horaLocal } from '../domain/fechas.ts';
import type { Uuid } from '../domain/types.ts';
import type { EstadoApp } from '../app/estado.ts';
import { coincide } from './orden.ts';

/** Los cuatro hechos que registra la app. */
export type TipoActividad = 'venta' | 'cobro' | 'ingreso' | 'anulacion';

/** Qué pantalla abre una fila cuando la toca. */
export interface Destino {
  que: 'venta' | 'ingreso' | 'cliente';
  id: Uuid;
}

export interface Actividad {
  /**
   * Clave de la FILA, no de la operación.
   *
   * Una venta anulada produce dos filas —la venta y su anulación— y las dos
   * salen del mismo registro, así que el id solo no alcanza para distinguirlas:
   * React las tomaría como repetidas y dibujaría cualquier cosa. Lleva el tipo
   * adelante.
   */
  clave: string;
  tipo: TipoActividad;
  /**
   * El instante en que pasó ESTE hecho. Es por lo que se ordena y se agrupa.
   *
   * Para una anulación es la fecha de anulación, no la de la venta: la
   * anulación pasó el día que él la hizo.
   */
  cuando: string;
  /** El comercio o el proveedor. Es el renglón grande de la fila. */
  conQuien: string;
  /**
   * El renglón chico, abajo: qué tenía la operación. Corto a propósito — en un
   * teléfono de 390 px, el nombre del comercio ya se lleva dos líneas.
   */
  detalle: string;
  /**
   * La palabra de la derecha, abajo del importe: en qué quedó.
   *
   * Va separada del detalle porque contesta otra pregunta. El detalle dice QUÉ
   * fue (cinco productos); esto dice CÓMO terminó (quedó debiendo). Juntas en un
   * solo renglón, en el teléfono se cortan las dos.
   */
  estado: string;
  montoCent: Cent;
  /**
   * Para dónde va la plata. `null` es "ni entra ni sale": una anulación no
   * mueve plata, deshace algo que ya se había contado.
   */
  direccion: 'entra' | 'sale' | null;
  /** La operación quedó anulada: la fila va tachada. */
  anulada: boolean;
  destino: Destino;
}

// ---------------------------------------------------------------------------
// Armar el feed
// ---------------------------------------------------------------------------

const nombreCliente = (e: EstadoApp, id: Uuid): string =>
  e.clientes.find((c) => c.id === id)?.nombre ?? '—';

const nombreProveedor = (e: EstadoApp, id?: Uuid): string =>
  (id ? e.proveedores.find((p) => p.id === id)?.nombre : undefined) ?? 'Sin proveedor';

const unidadesDe = (items: readonly { cantidad: number }[]): number =>
  items.reduce((a, i) => a + i.cantidad, 0);

const enPlural = (n: number, singular: string, plural: string): string =>
  `${n} ${n === 1 ? singular : plural}`;

/**
 * Todos los hechos, del más reciente al más viejo.
 *
 * Se arma entero y sin recortar: la app tiene todo en memoria y funciona sin
 * señal, así que filtrar, buscar y paginar son operaciones sobre esta lista. El
 * inicio se queda con las tres primeras; la pantalla de actividad las muestra
 * todas.
 */
export const actividades = (e: EstadoApp): Actividad[] => {
  const filas: Actividad[] = [];

  for (const v of e.ventas) {
    const anulada = Boolean(v.anuladaEn);
    filas.push({
      clave: `venta:${v.id}`,
      tipo: 'venta',
      cuando: v.fecha,
      conQuien: nombreCliente(e, v.clienteId),
      detalle: enPlural(unidadesDe(v.items), 'producto', 'productos'),
      estado: anulada ? 'anulada'
        : v.cobradoCent >= v.totalCent ? 'cobrado'
        : v.cobradoCent > 0 ? 'pagó parte'
        : 'te lo debe',
      montoCent: v.totalCent,
      // Una venta anulada no entró: por eso no lleva flecha ni signo.
      direccion: anulada ? null : 'entra',
      anulada,
      destino: { que: 'venta', id: v.id },
    });

    if (v.anuladaEn) {
      filas.push({
        clave: `anulacion:${v.id}`,
        tipo: 'anulacion',
        cuando: v.anuladaEn,
        conQuien: nombreCliente(e, v.clienteId),
        detalle: `Venta del ${diaCorto(v.fecha)}`,
        estado: 'se anuló',
        montoCent: v.totalCent,
        direccion: null,
        anulada: true,
        destino: { que: 'venta', id: v.id },
      });
    }
  }

  for (const c of e.compras) {
    const anulada = Boolean(c.anuladaEn);
    filas.push({
      clave: `ingreso:${c.id}`,
      tipo: 'ingreso',
      cuando: c.fecha,
      conQuien: nombreProveedor(e, c.proveedorId),
      detalle: enPlural(unidadesDe(c.items), 'unidad', 'unidades'),
      estado: anulada ? 'anulado'
        : c.condicionPago === 'cuenta' ? 'se lo debés' : 'pagado',
      montoCent: c.totalCent,
      direccion: anulada ? null : 'sale',
      anulada,
      destino: { que: 'ingreso', id: c.id },
    });

    if (c.anuladaEn) {
      filas.push({
        clave: `anulacion:${c.id}`,
        tipo: 'anulacion',
        cuando: c.anuladaEn,
        conQuien: nombreProveedor(e, c.proveedorId),
        detalle: `Ingreso del ${diaCorto(c.fecha)}`,
        estado: 'se anuló',
        montoCent: c.totalCent,
        direccion: null,
        anulada: true,
        destino: { que: 'ingreso', id: c.id },
      });
    }
  }

  for (const p of e.pagos) {
    filas.push({
      clave: `cobro:${p.id}`,
      tipo: 'cobro',
      cuando: p.fecha,
      conQuien: nombreCliente(e, p.clienteId),
      detalle: 'Te pagó una deuda',
      estado: MEDIO[p.medio] ?? 'cobrado',
      montoCent: p.montoCent,
      direccion: 'entra',
      anulada: false,
      destino: { que: 'cliente', id: p.clienteId },
    });
  }

  return ordenar(filas);
};

/*
 * Cortas a propósito: van en la columna de la derecha, que en un teléfono
 * angosto le come el ancho al nombre del comercio. "por transferencia" empujaba
 * "Pet Shop Huellitas" a dos renglones.
 */
const MEDIO: Record<string, string> = {
  efectivo: 'efectivo',
  transferencia: 'transferencia',
  cheque: 'cheque',
  otro: 'otro medio',
};

/** "21/09", para meterlo adentro de una frase. */
const diaCorto = (iso: string): string => {
  const [, mes, dia] = diaLocal(iso).split('-');
  return `${dia}/${mes}`;
};

/**
 * De lo último a lo primero.
 *
 * El desempate por clave no es un detalle: dos hechos del mismo segundo —una
 * venta y su cobro, que la app puede registrar con la misma marca de tiempo—
 * quedarían en un orden que depende de cómo el motor haya ordenado el arreglo, y
 * la lista se reacomodaría sola entre dibujado y dibujado. Con el desempate, el
 * orden es siempre el mismo.
 */
const ordenar = (filas: Actividad[]): Actividad[] =>
  filas.sort((a, b) => b.cuando.localeCompare(a.cuando) || a.clave.localeCompare(b.clave));

// ---------------------------------------------------------------------------
// Filtrar y buscar
// ---------------------------------------------------------------------------

export type FiltroActividad = 'todos' | 'ventas' | 'cobros' | 'ingresos' | 'anulados';

/**
 * Las chapitas de arriba, en orden.
 *
 * "Cobros" es una más de las que se pidieron, y está por un motivo: si los
 * cobros entran al feed, tienen que poder aislarse. Sin la chapita, la única
 * forma de ver solo cobros sería buscar por nombre de comercio, que es
 * justamente lo que un filtro evita.
 */
export const FILTROS: { id: FiltroActividad; texto: string }[] = [
  { id: 'todos', texto: 'Todos' },
  { id: 'ventas', texto: 'Ventas' },
  { id: 'cobros', texto: 'Cobros' },
  { id: 'ingresos', texto: 'Ingresos' },
  { id: 'anulados', texto: 'Anulados' },
];

/**
 * El filtro por tipo.
 *
 * "Anulados" es el único que no se corresponde con un tipo: junta las
 * anulaciones con las operaciones que quedaron anuladas, que es lo que él quiere
 * ver cuando toca esa chapita —el lío completo, no la mitad—.
 *
 * Y al revés: "Ventas" e "Ingresos" NO muestran las anuladas. Filtrar por ventas
 * es preguntar qué vendió, y lo anulado no se vendió.
 */
export const filtrarActividades = (
  lista: Actividad[],
  filtro: FiltroActividad,
): Actividad[] => {
  if (filtro === 'todos') return lista;
  if (filtro === 'anulados') return lista.filter((a) => a.anulada);
  const tipo: TipoActividad =
    filtro === 'ventas' ? 'venta' : filtro === 'cobros' ? 'cobro' : 'ingreso';
  return lista.filter((a) => a.tipo === tipo && !a.anulada);
};

/**
 * Busca por comercio, por proveedor y por lo que dice la fila.
 *
 * Reusa el comparador de las otras listas: sin acentos, sin mayúsculas y por
 * trozo, así "huel" encuentra "Pet Shop Huellitas".
 */
export const buscarActividades = (lista: Actividad[], q: string): Actividad[] =>
  q.trim() ? lista.filter((a) => coincide(q, [a.conQuien, a.detalle, a.estado, CHAPA[a.tipo].texto])) : lista;

// ---------------------------------------------------------------------------
// Agrupar por día
// ---------------------------------------------------------------------------

export interface GrupoDeActividad {
  /** `2026-09-22`. Es la clave, no lo que se muestra. */
  dia: string;
  /** "Hoy", "Ayer" o "22 de septiembre". */
  etiqueta: string;
  items: Actividad[];
}

/**
 * Parte la lista en días, respetando el orden que ya traía.
 *
 * Se agrupa DESPUÉS de paginar, no antes. Al revés, una página podría cortar un
 * día por la mitad y el encabezado quedaría en la página anterior, sin nada
 * abajo. Agrupando la página ya recortada, cada encabezado siempre tiene sus
 * filas.
 */
export const agruparPorDia = (
  lista: Actividad[],
  hoyIso: string,
  etiquetar: (iso: string) => string,
): GrupoDeActividad[] => {
  const hoy = diaLocal(hoyIso);
  const grupos: GrupoDeActividad[] = [];

  for (const a of lista) {
    const dia = diaLocal(a.cuando);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) {
      ultimo.items.push(a);
      continue;
    }
    grupos.push({ dia, etiqueta: etiquetaDeDia(dia, hoy, a.cuando, etiquetar), items: [a] });
  }

  return grupos;
};

/**
 * "Hoy" y "Ayer" antes que la fecha.
 *
 * Son las dos que él mira todo el tiempo, y "24 de septiembre" obliga a pensar
 * qué día es hoy para saber si eso es reciente. El resto va con la fecha escrita
 * entera, que es más larga pero no se confunde con nada.
 */
const etiquetaDeDia = (
  dia: string,
  hoy: string,
  iso: string,
  etiquetar: (iso: string) => string,
): string => {
  if (dia === hoy) return 'Hoy';
  if (dia === diaAnterior(hoy)) return 'Ayer';
  return etiquetar(iso);
};

/** El día calendario anterior, en texto. Se ancla al mediodía por el horario de verano. */
const diaAnterior = (dia: string): string =>
  new Date(Date.parse(`${dia}T12:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);

/** La hora sola. Alcanza en el historial, donde cada fila ya está bajo su día. */
export const horaDe = (a: Actividad): string => horaLocal(a.cuando);

/**
 * Cuándo pasó, para el inicio — donde NO hay encabezados de día.
 *
 * Las tres últimas actividades pueden ser de tres días distintos, y "08:15" sin
 * fecha no ubica nada: parece de hoy. Si es de hoy va la hora sola, que es lo
 * normal; si no, va el día adelante.
 */
export const momentoDe = (a: Actividad, hoyIso: string): string => {
  const dia = diaLocal(a.cuando);
  const hoy = diaLocal(hoyIso);
  if (dia === hoy) return horaLocal(a.cuando);
  const [, mes, d] = dia.split('-');
  return `${d}/${mes} ${horaLocal(a.cuando)}`;
};

// ---------------------------------------------------------------------------
// Constantes de presentación
// ---------------------------------------------------------------------------

/** Cuántos movimientos se ven en el inicio antes de "Consultar todas". */
export const EN_EL_INICIO = 3;

/** Cuántos por página en el historial completo. */
export const POR_PAGINA_ACTIVIDAD = 20;

/** El ícono de cada tipo. */
export const ICONO: Record<TipoActividad, string> = {
  venta: 'i-cart',
  cobro: 'i-cash',
  ingreso: 'i-inbox',
  anulacion: 'i-undo',
};

/**
 * Cómo se llama cada tipo, en la fila.
 *
 * Era una chapita de color adentro del nombre del comercio, y en un teléfono de
 * 390 px se llevaba un renglón entero: el nombre arrancaba abajo y cada fila
 * medía el doble. Ahora la palabra encabeza el renglón chico, pintada, y el
 * color fuerte lo pone el ícono redondo de la izquierda — que es lo que se ve
 * primero de todos modos.
 */
export const CHAPA: Record<TipoActividad, { texto: string; clase: string }> = {
  venta: { texto: 'Venta', clase: 'ok' },
  cobro: { texto: 'Cobro', clase: 'brand' },
  ingreso: { texto: 'Ingreso', clase: 'warn' },
  anulacion: { texto: 'Anulado', clase: 'bad' },
};

/** El signo de adelante del importe. Una anulación no lleva. */
export const SIGNO: Record<'entra' | 'sale', string> = { entra: '+', sale: '−' };
