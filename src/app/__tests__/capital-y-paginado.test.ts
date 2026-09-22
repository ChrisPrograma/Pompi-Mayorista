/**
 * Tests del capital en productos y del paginado de las listas.
 *
 * El capital es un número que él va a mirar para decidir si compra más o si ya
 * tiene demasiada plata parada. Si está mal, la decisión es mala y nadie se
 * entera hasta que falta el efectivo.
 */

import { describe, expect, it } from 'vitest';
import { pesos } from '../../domain/money.ts';
import { POR_PAGINA, cuantasPaginas, paginaDe } from '../../ui/paginado.ts';
import { valorDelStock } from '../../ui/vistas.ts';
import {
  altaProducto, aplicar, entrarMercaderia, estadoVacio, vender, type Ctx, type EstadoApp,
} from '../estado.ts';
import { idsSecuenciales } from '../semilla.ts';

const HOY = '2026-09-22T14:00:00.000Z';
const ctx = (p = 'k'): Ctx => ({ nuevoId: idsSecuenciales(p), ahora: () => HOY });

/** Carga un producto y, si se le dice, hace entrar unidades con su costo. */
const conProducto = (
  e: EstadoApp,
  c: Ctx,
  datos: { nombre: string; precio?: number; cantidad?: number; costo?: number },
): EstadoApp => {
  const r = altaProducto(e, {
    nombre: datos.nombre,
    ...(datos.precio !== undefined ? { precioCent: pesos(datos.precio) } : {}),
  }, c);
  let x = aplicar(e, r);
  const id = x.productos[x.productos.length - 1]!.id;
  if (datos.cantidad) {
    x = aplicar(x, entrarMercaderia(x, {
      proveedorId: 'prov1',
      items: [{ productoId: id, cantidad: datos.cantidad, costoUnitarioCent: pesos(datos.costo ?? 0) }],
      condicionPago: 'contado',
    }, c));
  }
  return x;
};

describe('el capital parado en mercadería', () => {
  it('suma costo × unidades, y precio × unidades por separado', () => {
    /*
     * Son dos preguntas distintas y él hace las dos: cuánto PUSO y cuánto va a
     * SACAR. Un solo número las mezclaría.
     */
    const c = ctx();
    let e = estadoVacio('n1', 'l1');
    e = conProducto(e, c, { nombre: 'Pretal', precio: 6500, cantidad: 10, costo: 4000 });
    e = conProducto(e, c, { nombre: 'Pelota', precio: 1800, cantidad: 5, costo: 900 });

    const v = valorDelStock(e);
    expect(v.costoCent).toBe(pesos(10 * 4000 + 5 * 900));   // $ 44.500
    expect(v.ventaCent).toBe(pesos(10 * 6500 + 5 * 1800));  // $ 74.000
    expect(v.productos).toBe(2);
    expect(v.unidades).toBe(15);
  });

  it('lo que no tiene stock no cuenta', () => {
    const c = ctx();
    let e = estadoVacio('n1', 'l1');
    e = conProducto(e, c, { nombre: 'Con stock', precio: 1000, cantidad: 3, costo: 500 });
    e = conProducto(e, c, { nombre: 'Sin stock', precio: 9999 });

    const v = valorDelStock(e);
    expect(v.productos).toBe(1);
    expect(v.costoCent).toBe(pesos(1500));
  });

  it('el stock en NEGATIVO no resta del capital', () => {
    /*
     * Un stock negativo significa que vendió algo que el sistema no tiene como
     * recibido: es un error de carga, no plata en contra. Si restara, un cero de
     * más al anotar una venta bajaría el capital del negocio.
     */
    const c = ctx();
    let e = estadoVacio('n1', 'l1');
    e = conProducto(e, c, { nombre: 'Pretal', precio: 6500, cantidad: 10, costo: 4000 });
    e = conProducto(e, c, { nombre: 'Correa', precio: 3000, cantidad: 2, costo: 1500 });
    const correa = e.productos[1]!.id;

    // Vende 6 de las 2 que tiene: queda en −4.
    e = aplicar(e, vender(e, {
      clienteId: 'c1', items: [{ productoId: correa, cantidad: 6 }],
      forma: 'efectivo', cobradoCent: pesos(18_000),
    }, c));

    const v = valorDelStock(e);
    expect(v.productos).toBe(1);                 // solo el pretal
    expect(v.costoCent).toBe(pesos(40_000));     // 10 × 4.000, sin restarle nada
  });

  it('avisa cuántos productos con stock no tienen costo', () => {
    /*
     * Sin este aviso el capital estaría subestimado en silencio, y encima se
     * arreglaría solo a medida que cargue costos: un número que se mueve sin que
     * nadie sepa por qué.
     */
    const c = ctx();
    let e = estadoVacio('n1', 'l1');
    e = conProducto(e, c, { nombre: 'Con costo', precio: 1000, cantidad: 4, costo: 600 });
    e = conProducto(e, c, { nombre: 'Sin costo', precio: 1000, cantidad: 7, costo: 0 });

    const v = valorDelStock(e);
    expect(v.sinCosto).toBe(1);
    expect(v.costoCent).toBe(pesos(2400));       // el de costo cero no suma
    expect(v.unidades).toBe(11);                 // pero sus unidades sí se cuentan
  });

  it('sin nada cargado, todo en cero y sin avisos', () => {
    const v = valorDelStock(estadoVacio('n1', 'l1'));
    expect(v).toEqual({
      costoCent: 0, ventaCent: 0, productos: 0, unidades: 0, sinCosto: 0, sinPrecio: 0,
    });
  });
});

describe('el paginado de las listas del inicio', () => {
  const lista = Array.from({ length: 34 }, (_, i) => i + 1);

  it('la primera página trae los primeros diez', () => {
    expect(paginaDe(lista, 0, POR_PAGINA)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('la última trae lo que queda, no diez', () => {
    expect(paginaDe(lista, 3, POR_PAGINA)).toEqual([31, 32, 33, 34]);
  });

  it('una página más allá del final devuelve la última, no una lista vacía', () => {
    /*
     * Pasa al cambiar de rango: estaba en la página 3 de "mes" y "semana" tiene
     * una sola. Una lista vacía ahí parecería que no hay nada, que es la peor
     * respuesta posible a un cambio de filtro.
     */
    expect(paginaDe(lista, 99, POR_PAGINA)).toEqual([31, 32, 33, 34]);
    expect(paginaDe([1, 2, 3], 5, POR_PAGINA)).toEqual([1, 2, 3]);
  });

  it('una página negativa devuelve la primera', () => {
    expect(paginaDe(lista, -3, POR_PAGINA)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('con diez o menos, una sola página con todo', () => {
    const diez = lista.slice(0, 10);
    expect(paginaDe(diez, 0, POR_PAGINA)).toEqual(diez);
    expect(paginaDe([], 0, POR_PAGINA)).toEqual([]);
  });

  it('cuenta bien cuántas páginas hay', () => {
    expect(cuantasPaginas(34, POR_PAGINA)).toBe(4);
    expect(cuantasPaginas(10, POR_PAGINA)).toBe(1);
    expect(cuantasPaginas(0, POR_PAGINA)).toBe(1);   // una página vacía sigue siendo una
  });

  it('las páginas no pierden ni repiten ningún ítem', () => {
    // El control que importa: juntando todas las páginas sale la lista original.
    const juntas = [0, 1, 2, 3].flatMap((n) => paginaDe(lista, n, POR_PAGINA));
    expect(juntas).toEqual(lista);
  });
});
