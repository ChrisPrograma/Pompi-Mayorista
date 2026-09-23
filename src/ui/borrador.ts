/**
 * El borrador de la venta en curso.
 *
 * POR QUÉ EXISTE
 *
 * Estaba cargando un pedido de once productos, se le ocurrió mirar el stock de
 * uno, tocó "Mis productos" y al volver el carrito estaba vacío. Eso es todo lo
 * que hace falta para que alguien que ya abandonó dos sistemas abandone el
 * tercero. Ahora el pedido sobrevive a irse a cualquier pantalla, a cerrar la
 * app y a que se apague el teléfono.
 *
 * POR QUÉ EN localStorage Y NO EN IndexedDB
 *
 * Un borrador no es un hecho: no es una venta, no toca el libro mayor y no se
 * sube al servidor. Es una comodidad de ESTE aparato, como la sesión — que vive
 * en el mismo lugar por el mismo motivo. Y hace falta leerlo de forma sincrónica
 * al dibujar la pantalla: con IndexedDB, que es asincrónico, el carrito
 * aparecería un instante después, vacío primero y lleno al toque, que es
 * exactamente la clase de parpadeo que hace desconfiar.
 *
 * TODO LO QUE LEE Y ESCRIBE ESTÁ ENVUELTO EN try/catch
 *
 * `localStorage` tira excepción en modo privado de algunos navegadores y cuando
 * el espacio está lleno. Un borrador que no se puede guardar es una molestia; una
 * app que no abre por eso sería un desastre. Si falla, se sigue sin borrador.
 */

import type { Uuid } from '../domain/types.ts';

const CLAVE = 'pompi.borrador.venta';

export interface BorradorVenta {
  /** A quién se le está vendiendo. Sin esto el pedido no se puede retomar. */
  clienteId: Uuid;
  /** Cuántas unidades de cada producto, por id. */
  items: Record<Uuid, number>;
  /** Cuándo se tocó por última vez. Sirve para descartar un borrador viejo. */
  tocadoEn: string;
}

/** Lo mínimo de `localStorage` que se usa acá. Así el test no necesita navegador. */
export interface Guardarropa {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

const delNavegador = (): Guardarropa | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;   // modo privado, o el navegador lo tiene bloqueado
  }
};

/**
 * Cuántos días vive un borrador.
 *
 * Retomar el pedido de hace dos semanas no es ayudar: los precios cambiaron, el
 * stock también, y lo más probable es que esa venta ya se haya hecho —o no se
 * haya hecho nunca— por otro lado. Tres días cubre "lo dejé a la mañana y sigo a
 * la tarde" y "me quedó de ayer", que son los casos reales.
 */
export const DIAS_DE_VIDA = 3;

const vencido = (tocadoEn: string, ahoraIso: string): boolean => {
  const t = Date.parse(tocadoEn);
  const ahora = Date.parse(ahoraIso);
  if (Number.isNaN(t) || Number.isNaN(ahora)) return true;
  return ahora - t > DIAS_DE_VIDA * 24 * 60 * 60 * 1000;
};

/**
 * Lee el borrador guardado, si hay uno y sirve.
 *
 * Devuelve `null` —y no algo a medias— ante cualquier duda: sin nada guardado,
 * con un texto que no es JSON, con un borrador sin cliente o sin productos, o
 * con uno vencido. Un carrito a medio armar por un dato corrupto sería peor que
 * ninguno, porque terminaría en una venta mal anotada.
 */
export const leerBorrador = (
  ahoraIso: string,
  donde: Guardarropa | null = delNavegador(),
): BorradorVenta | null => {
  if (!donde) return null;
  try {
    const texto = donde.getItem(CLAVE);
    if (!texto) return null;

    const b = JSON.parse(texto) as Partial<BorradorVenta>;
    if (!b || typeof b.clienteId !== 'string' || !b.clienteId) return null;
    if (!b.items || typeof b.items !== 'object') return null;
    if (typeof b.tocadoEn !== 'string' || vencido(b.tocadoEn, ahoraIso)) return null;

    // Se limpian las cantidades que no son números positivos: un "0" guardado no
    // es parte del pedido, y cualquier otra cosa es basura.
    const items: Record<Uuid, number> = {};
    for (const [id, cantidad] of Object.entries(b.items)) {
      if (typeof cantidad === 'number' && Number.isFinite(cantidad) && cantidad > 0) {
        items[id] = Math.floor(cantidad);
      }
    }
    if (Object.keys(items).length === 0) return null;

    return { clienteId: b.clienteId, items, tocadoEn: b.tocadoEn };
  } catch {
    return null;
  }
};

/**
 * Guarda el borrador. Un pedido vacío BORRA el guardado en vez de escribir uno
 * vacío: si sacó todo del carrito, no hay nada que retomar.
 */
export const guardarBorrador = (
  b: { clienteId: Uuid | null; items: Record<Uuid, number> },
  ahoraIso: string,
  donde: Guardarropa | null = delNavegador(),
): void => {
  if (!donde) return;
  try {
    const items: Record<Uuid, number> = {};
    for (const [id, cantidad] of Object.entries(b.items)) {
      if (cantidad > 0) items[id] = cantidad;
    }
    if (!b.clienteId || Object.keys(items).length === 0) {
      donde.removeItem(CLAVE);
      return;
    }
    donde.setItem(CLAVE, JSON.stringify({ clienteId: b.clienteId, items, tocadoEn: ahoraIso }));
  } catch {
    // Sin espacio o en modo privado: se sigue sin borrador, no se rompe nada.
  }
};

/** Tira el borrador. Se llama al cerrar una venta y desde "Vaciar el pedido". */
export const borrarBorrador = (donde: Guardarropa | null = delNavegador()): void => {
  try {
    donde?.removeItem(CLAVE);
  } catch {
    // Igual que arriba: si no se puede, no es motivo para romper la pantalla.
  }
};
