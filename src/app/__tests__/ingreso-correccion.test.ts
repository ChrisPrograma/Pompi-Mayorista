/**
 * Tests de la corrección de ingresos y del buscador de la venta.
 *
 * Corregir una entrada es la operación que más fácil deja el stock mal: toca
 * cantidades, costos y deuda a la vez, y el error no se ve hasta que alguien
 * cuenta cajas. Estos tests fijan que la cuenta cierre exactamente, no
 * aproximadamente.
 */

import { describe, expect, it } from 'vitest';
import { pesos } from '../../domain/money.ts';
import { stockDe } from '../../domain/stock.ts';
import { buscarProductos } from '../../ui/orden.ts';
import { vistaParaVender, vistaProductos } from '../../ui/vistas.ts';
import {
  altaProducto, altaProveedor, aplicar, corregirIngreso, costoDe, entrarMercaderia,
  estadoVacio, vender, type Ctx, type EstadoApp,
} from '../estado.ts';
import { idsSecuenciales } from '../semilla.ts';

const HOY = '2026-09-21T14:00:00.000Z';
const ctx = (p = 'k'): Ctx => ({ nuevoId: idsSecuenciales(p), ahora: () => HOY });

/** Un negocio con un proveedor y dos productos con precio. */
const armar = () => {
  const c = ctx();
  let e: EstadoApp = estadoVacio('n1', 'l1');
  e = aplicar(e, altaProveedor(e, { nombre: 'Distribuidora Once' }, c));
  const proveedorId = e.proveedores[0]!.id;

  for (const [codigo, nombre, precio] of [
    ['1179', 'Pretal Plateado', 6500],
    ['205', 'Pelota de goma', 1800],
  ] as const) {
    e = aplicar(e, altaProducto(e, { codigo, nombre, precioCent: pesos(precio), proveedorId }, c));
  }
  const [pretal, pelota] = e.productos.map((p) => p.id) as [string, string];
  return { e, c, proveedorId, pretal, pelota };
};

/** El stock real de un producto: la suma de su libro mayor. */
const stock = (e: EstadoApp, productoId: string) => stockDe(e.movimientos, productoId);

describe('corregir un ingreso', () => {
  it('el stock queda con la cantidad corregida, no con la suma de las dos', () => {
    /*
     * El caso que motivó el pedido: puso 100 donde iban 10. Si corregir fuera
     * "cargar otra entrada", quedarían 110 unidades de algo que nunca entró.
     */
    let { e, c, proveedorId, pretal } = armar();
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId,
      items: [{ productoId: pretal, cantidad: 100, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'cuenta',
    }, c));
    expect(stock(e, pretal)).toBe(100);

    const compraId = e.compras[0]!.id;
    e = aplicar(e, corregirIngreso(e, {
      compraId, proveedorId,
      items: [{ productoId: pretal, cantidad: 10, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'cuenta',
    }, c));

    expect(stock(e, pretal)).toBe(10);
  });

  it('no borra nada: quedan MÁS movimientos que antes', () => {
    /*
     * La REGLA 0 en una línea. Después de corregir hay tres asientos por ese
     * producto: la entrada original, el ajuste que la compensa y la entrada
     * nueva. El stock es la suma, y el camino queda escrito.
     */
    let { e, c, proveedorId, pretal } = armar();
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId,
      items: [{ productoId: pretal, cantidad: 100, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'cuenta',
    }, c));
    const antes = e.movimientos.length;

    e = aplicar(e, corregirIngreso(e, {
      compraId: e.compras[0]!.id, proveedorId,
      items: [{ productoId: pretal, cantidad: 10, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'cuenta',
    }, c));

    expect(e.movimientos.length).toBe(antes + 2);
    expect(e.compras).toHaveLength(2);
    expect(e.compras[0]!.anuladaEn).toBe(HOY);   // la vieja, marcada
    expect(e.compras[1]!.anuladaEn).toBe(undefined);
  });

  it('la deuda con el proveedor queda con el total corregido', () => {
    let { e, c, proveedorId, pretal } = armar();
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId,
      items: [{ productoId: pretal, cantidad: 100, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'cuenta',
    }, c));

    const deuda = (x: EstadoApp) => x.compras
      .filter((k) => k.proveedorId === proveedorId && k.condicionPago === 'cuenta' && !k.anuladaEn)
      .reduce((a, k) => a + k.totalCent, 0);

    expect(deuda(e)).toBe(pesos(400_000));

    e = aplicar(e, corregirIngreso(e, {
      compraId: e.compras[0]!.id, proveedorId,
      items: [{ productoId: pretal, cantidad: 10, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'cuenta',
    }, c));

    expect(deuda(e)).toBe(pesos(40_000));
  });

  it('corrigiendo el costo, el producto pasa a costar lo nuevo', () => {
    let { e, c, proveedorId, pretal } = armar();
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId,
      items: [{ productoId: pretal, cantidad: 10, costoUnitarioCent: pesos(400) }], // le erró un cero
      condicionPago: 'contado',
    }, c));
    expect(costoDe(e, pretal)).toBe(pesos(400));

    e = aplicar(e, corregirIngreso(e, {
      compraId: e.compras[0]!.id, proveedorId,
      items: [{ productoId: pretal, cantidad: 10, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'contado',
    }, c));

    expect(costoDe(e, pretal)).toBe(pesos(4000));
    expect(stock(e, pretal)).toBe(10);   // la cantidad no se movió
  });

  it('se puede sacar un producto de la entrada y agregar otro', () => {
    let { e, c, proveedorId, pretal, pelota } = armar();
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId,
      items: [{ productoId: pretal, cantidad: 12, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'contado',
    }, c));

    e = aplicar(e, corregirIngreso(e, {
      compraId: e.compras[0]!.id, proveedorId,
      items: [{ productoId: pelota, cantidad: 25, costoUnitarioCent: pesos(900) }],
      condicionPago: 'contado',
    }, c));

    expect(stock(e, pretal)).toBe(0);    // lo que nunca entró, vuelve a cero
    expect(stock(e, pelota)).toBe(25);
  });

  it('una venta ya hecha con esa mercadería NO se toca', () => {
    /*
     * El costo se congela en el renglón de la venta, que es justamente para
     * esto: lo que ganó ese día no cambia porque después se corrija una carga.
     */
    let { e, c, proveedorId, pretal } = armar();
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId,
      items: [{ productoId: pretal, cantidad: 20, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'contado',
    }, c));
    e = aplicar(e, vender(e, {
      clienteId: 'c1', items: [{ productoId: pretal, cantidad: 2 }],
      formaPago: 'efectivo', cobradoCent: pesos(13_000),
    }, c));
    const ventaAntes = JSON.stringify(e.ventas[0]);

    e = aplicar(e, corregirIngreso(e, {
      compraId: e.compras[0]!.id, proveedorId,
      items: [{ productoId: pretal, cantidad: 8, costoUnitarioCent: pesos(4500) }],
      condicionPago: 'contado',
    }, c));

    expect(JSON.stringify(e.ventas[0])).toBe(ventaAntes);
    // 20 entraron, 2 se vendieron, la entrada se corrigió a 8 → 8 − 2 = 6.
    expect(stock(e, pretal)).toBe(6);
  });

  it('no se puede corregir dos veces el mismo ingreso', () => {
    let { e, c, proveedorId, pretal } = armar();
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId,
      items: [{ productoId: pretal, cantidad: 10, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'contado',
    }, c));
    const compraId = e.compras[0]!.id;
    const items = [{ productoId: pretal, cantidad: 5, costoUnitarioCent: pesos(4000) }];

    e = aplicar(e, corregirIngreso(e, { compraId, proveedorId, items, condicionPago: 'contado' }, c));
    expect(() => corregirIngreso(e, { compraId, proveedorId, items, condicionPago: 'contado' }, c))
      .toThrow('ya estaba anulado');
  });

  it('una corrección sin productos no se guarda a medias', () => {
    /*
     * Importa que tire ANTES de devolver nada: si la anulación saliera y el alta
     * fallara, el ingreso quedaría anulado y sin reemplazo, o sea, mercadería
     * que entró de verdad y desapareció del stock.
     */
    let { e, c, proveedorId, pretal } = armar();
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId,
      items: [{ productoId: pretal, cantidad: 10, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'contado',
    }, c));
    const antes = JSON.stringify(e);

    expect(() => corregirIngreso(e, {
      compraId: e.compras[0]!.id, proveedorId, items: [], condicionPago: 'contado',
    }, c)).toThrow();

    expect(JSON.stringify(e)).toBe(antes);   // el estado no se movió
  });
});

describe('el buscador de la pantalla de venta', () => {
  it('encuentra por código y por nombre', () => {
    const { e } = armar();
    const lista = vistaParaVender(e);

    expect(buscarProductos(lista, '1179').map((p) => p.nombre)).toEqual(['Pretal Plateado']);
    expect(buscarProductos(lista, 'pelo').map((p) => p.nombre)).toEqual(['Pelota de goma']);
  });

  it('ignora acentos y mayúsculas, y busca por pedazo', () => {
    const { e } = armar();
    const lista = vistaParaVender(e);
    expect(buscarProductos(lista, 'PRETAL')).toHaveLength(1);
    expect(buscarProductos(lista, 'plateado')).toHaveLength(1);
  });

  it('sin texto devuelve todo, y con algo que no existe no devuelve nada', () => {
    const { e } = armar();
    const lista = vistaParaVender(e);
    expect(buscarProductos(lista, '')).toHaveLength(2);
    expect(buscarProductos(lista, 'zzz')).toHaveLength(0);
  });

  it('filtrar NO cambia lo que el pedido tiene cargado', () => {
    /*
     * El bug que este test impide: si el pedido se guardara por posición en la
     * lista visible, buscar "pelo" movería las cantidades de un producto a otro.
     * Se guarda por id, así que el filtro es solo visual.
     */
    const { e, pretal, pelota } = armar();
    const pedido: Record<string, number> = { [pretal]: 12, [pelota]: 3 };
    const visibles = buscarProductos(vistaParaVender(e), 'pelo');

    expect(visibles.map((p) => pedido[p.id] ?? 0)).toEqual([3]);
    expect(pedido[pretal]).toBe(12);   // sigue en el carrito aunque no se vea
  });

  it('busca sobre la lista de vender, que es la que tiene precio', () => {
    // Un producto sin precio no se puede vender, así que tampoco tiene por qué
    // aparecer en la búsqueda de esa pantalla.
    const c = ctx('z');
    let { e } = armar();
    /*
     * A mano y no por `altaProducto`: el alta exige precio mayor que cero, y
     * está bien que lo exija. Un producto sin precio llega de otro lado —del
     * servidor, o de una carga vieja— y es justamente el que hay que probar.
     */
    e = {
      ...e,
      productos: [
        ...e.productos,
        { id: c.nuevoId(), negocioId: e.negocioId, nombre: 'Correa sin precio', unidad: 'unidad', activo: true },
      ],
    };

    expect(vistaProductos(e)).toHaveLength(3);
    expect(buscarProductos(vistaParaVender(e), 'correa')).toHaveLength(0);
  });
});
