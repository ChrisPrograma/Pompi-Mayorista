/**
 * Tests de la cola de salida.
 *
 * No prueban que la cola "ande": prueban que **no pueda perder una operación**.
 * Los tres casos de acá son bugs que estuvieron de verdad en el código y que los
 * tests con simulaciones de la pantalla no podían ver, porque el problema no
 * estaba en la pantalla sino en el orden y en la contabilidad de la cola.
 */

import { describe, expect, it } from 'vitest';
import { Cola, esErrorPermanente, type AlmacenCola, type ItemCola, type Operacion } from '../outbox.ts';

/**
 * Un error como los que tira el transporte.
 *
 * Sin propiedad de parámetro (`readonly status: number` en el constructor) a
 * propósito: el runner nativo de Node corre TypeScript "strip-only" y esa
 * sintaxis no la soporta. Escrito así, el test corre con y sin npm.
 */
class ErrorConStatus extends Error {
  status: number;
  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.status = status;
  }
}

/** Un almacén en memoria, con la misma semántica que el de IndexedDB. */
const almacenFalso = () => {
  const items = new Map<string, ItemCola>();
  const PENDIENTES = ['pendiente', 'enviando'];
  const SIN_SUBIR = ['pendiente', 'enviando', 'error'];
  const almacen: AlmacenCola = {
    async agregar(i) { items.set(i.id, i); },
    async pendientes(ahoraIso) {
      return [...items.values()]
        .filter((i) => PENDIENTES.includes(i.estado))
        .filter((i) => !i.reintentarDesde || i.reintentarDesde <= ahoraIso)
        .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
    },
    async actualizar(id, cambios) {
      const i = items.get(id);
      if (i) items.set(id, { ...i, ...cambios });
    },
    async quitar(id) { items.delete(id); },
    async contarPendientes() {
      return [...items.values()].filter((i) => SIN_SUBIR.includes(i.estado)).length;
    },
  };
  return { almacen, items };
};

const op = (id: string): Operacion => ({ tipo: 'guardar_cliente', id, payload: {} });

describe('orden de la cola', () => {
  it('si una operación falla, NO sigue con las de atrás', async () => {
    // El caso real: falla "guardar el comercio nuevo" y atrás viene "venderle a
    // ese comercio". Si la cola siguiera, la venta llegaría antes que el comercio
    // y rebotaría por clave foránea — un 4xx, o sea error permanente. La venta
    // quedaría marcada como imposible de subir cuando solo llegó temprano.
    const { almacen, items } = almacenFalso();
    const enviadas: string[] = [];
    const cola = new Cola(almacen, {
      async enviar(o) {
        if (o.id === 'b') throw new ErrorConStatus('sin señal', 503);
        enviadas.push(o.id);
      },
    });

    for (const id of ['a', 'b', 'c']) {
      await cola.encolar(op(id));
      await new Promise((r) => setTimeout(r, 2));   // creadoEn distinto
    }
    await cola.sincronizar();

    expect(enviadas).toEqual(['a']);                 // 'c' NO se adelantó
    expect(items.get('c')?.estado).toBe('pendiente'); // sigue esperando su turno
    expect(items.has('a')).toBe(false);               // la que salió, salió
  });

  it('cuando la de adelante se destraba, las de atrás salen en orden', async () => {
    const { almacen } = almacenFalso();
    const enviadas: string[] = [];
    let falla = true;
    const cola = new Cola(almacen, {
      async enviar(o) {
        if (o.id === 'b' && falla) throw new ErrorConStatus('sin señal', 503);
        enviadas.push(o.id);
      },
    });

    for (const id of ['a', 'b', 'c']) {
      await cola.encolar(op(id));
      await new Promise((r) => setTimeout(r, 2));
    }
    await cola.sincronizar();
    falla = false;
    // El backoff empuja el reintento al futuro: se sincroniza con un reloj adelantado.
    const despues = new Cola(almacen, {
      async enviar(o) { enviadas.push(o.id); },
    }, () => new Date(Date.now() + 60_000));
    await despues.sincronizar();

    expect(enviadas).toEqual(['a', 'b', 'c']);
  });
});

describe('el contador de "sin subir"', () => {
  it('cuenta también lo que falló para siempre', async () => {
    // Era el bug más silencioso de los tres: una venta que el servidor rechazó
    // salía del contador y el cartel decía "0 sin subir". Él la daba por hecha y
    // no estaba en ningún lado.
    const { almacen } = almacenFalso();
    const cola = new Cola(almacen, {
      async enviar() { throw new ErrorConStatus('dato inválido', 400); },
    });

    await cola.encolar(op('a'));
    await cola.sincronizar();

    expect(await cola.sinSubir()).toBe(1);
  });

  it('lo que se subió bien no se cuenta', async () => {
    const { almacen } = almacenFalso();
    const cola = new Cola(almacen, { async enviar() { /* ok */ } });
    await cola.encolar(op('a'));
    await cola.sincronizar();
    expect(await cola.sinSubir()).toBe(0);
  });
});

describe('qué se reintenta y qué no', () => {
  it('sin señal se reintenta; un dato mal no', () => {
    expect(esErrorPermanente(new ErrorConStatus('x', 503))).toBe(false);  // servidor caído
    expect(esErrorPermanente(new ErrorConStatus('x', 429))).toBe(false);  // demasiados intentos
    expect(esErrorPermanente(new ErrorConStatus('x', 408))).toBe(false);  // timeout
    expect(esErrorPermanente(new ErrorConStatus('x', 400))).toBe(true);   // dato inválido
    expect(esErrorPermanente(new ErrorConStatus('x', 409))).toBe(true);   // conflicto
    expect(esErrorPermanente(new Error('sin red'))).toBe(false);          // fetch falló
  });
});
