/**
 * Tests del catálogo: agregar, editar y "eliminar" productos, clientes y proveedores.
 *
 * Lo que se prueba acá no es que las funciones anden, es que **no puedan** hacer
 * las tres cosas que arruinarían el sistema:
 *
 *   1. que editar un comercio borre datos que la pantalla no mostraba;
 *   2. que "eliminar" borre de verdad y deje ventas huérfanas;
 *   3. que cambiar un precio pise el anterior en vez de apilarlo.
 *
 * Las tres son fáciles de escribir por accidente y muy caras de descubrir después.
 */

import { describe, expect, it } from 'vitest';
import { pesos } from '../../domain/money.ts';
import { calcularStock } from '../../domain/stock.ts';
import {
  activarCliente,
  activarProducto,
  activarProveedor,
  altaProducto,
  altaProveedor,
  aplicar,
  cambiarPrecio,
  costoDe,
  editarCliente,
  editarProducto,
  editarProveedor,
  historialPrecios,
  precioDe,
  productoParecido,
  vender,
  type Ctx,
} from '../estado.ts';
import { construirSemilla, idsSecuenciales } from '../semilla.ts';
import { cuantosActivos, vistaProductos, vistaProveedores } from '../../ui/vistas.ts';

const HOY = '2026-09-15T14:00:00.000Z';
const ctx = (): Ctx => ({ nuevoId: idsSecuenciales('n'), ahora: () => HOY });

// ---------------------------------------------------------------------------
// Editar: la distinción entre "no lo mandé" y "lo mandé vacío"
// ---------------------------------------------------------------------------

describe('editarCliente', () => {
  it('no toca los campos que no vienen', () => {
    const e0 = construirSemilla(HOY);
    const antes = e0.clientes.find((c) => c.id === 'c1')!;
    expect(antes.zona).toBeTruthy();
    expect(antes.diaVisita).toBeDefined();

    // Solo se manda el contacto, como haría una pantalla que muestra un campo.
    const e1 = aplicar(e0, editarCliente(e0, { id: 'c1', contacto: '11 5555-4444' }));
    const despues = e1.clientes.find((c) => c.id === 'c1')!;

    expect(despues.contacto).toBe('11 5555-4444');
    expect(despues.zona).toBe(antes.zona);
    expect(despues.diaVisita).toBe(antes.diaVisita);
    expect(despues.nombre).toBe(antes.nombre);
  });

  it('un campo mandado vacío se borra', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, editarCliente(e0, { id: 'c1', zona: '' }));
    expect(e1.clientes.find((c) => c.id === 'c1')!.zona).toBeUndefined();
  });

  it('null saca un número, sin confundirse con cero', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, editarCliente(e0, { id: 'c1', diaVisita: null }));
    expect(e1.clientes.find((c) => c.id === 'c1')!.diaVisita).toBeUndefined();

    // 0 es domingo, un día válido: no se puede tratar como "vacío".
    const e2 = aplicar(e0, editarCliente(e0, { id: 'c1', diaVisita: 0 }));
    expect(e2.clientes.find((c) => c.id === 'c1')!.diaVisita).toBe(0);
  });

  it('no deja al comercio sin nombre', () => {
    const e0 = construirSemilla(HOY);
    expect(() => editarCliente(e0, { id: 'c1', nombre: '   ' })).toThrow();
  });

  it('editar no agrega un comercio: lo reemplaza por id', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, editarCliente(e0, { id: 'c1', nombre: 'Huellitas' }));
    expect(e1.clientes.length).toBe(e0.clientes.length);
  });
});

describe('editarProducto y editarProveedor', () => {
  it('corregir el nombre de un producto no toca su precio ni su stock', () => {
    const e0 = construirSemilla(HOY);
    const precioAntes = precioDe(e0, 'p1');
    const stockAntes = calcularStock(e0.movimientos).get('p1')!;

    const e1 = aplicar(e0, editarProducto(e0, { id: 'p1', nombre: 'Collar reforzado' }));

    expect(e1.productos.find((p) => p.id === 'p1')!.nombre).toBe('Collar reforzado');
    expect(precioDe(e1, 'p1')).toBe(precioAntes);
    expect(calcularStock(e1.movimientos).get('p1')).toEqual(stockAntes);
    expect(historialPrecios(e1, 'p1').length).toBe(historialPrecios(e0, 'p1').length);
  });

  it('el proveedor guarda su contacto', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, editarProveedor(e0, { id: 'v1', contacto: '11 4444-3333' }));
    expect(e1.proveedores.find((p) => p.id === 'v1')!.contacto).toBe('11 4444-3333');
    expect(e1.proveedores.find((p) => p.id === 'v1')!.rubro)
      .toBe(e0.proveedores.find((p) => p.id === 'v1')!.rubro);
  });
});

// ---------------------------------------------------------------------------
// "Eliminar" = desactivar. El historial tiene que sobrevivir.
// ---------------------------------------------------------------------------

describe('desactivar en vez de borrar', () => {
  it('un producto desactivado sale de las listas pero sus ventas siguen enteras', () => {
    const e0 = construirSemilla(HOY);
    const conVenta = aplicar(e0, vender(e0, {
      clienteId: 'c1', items: [{ productoId: 'p1', cantidad: 3 }], formaPago: 'efectivo',
    }, ctx()));
    const venta = conVenta.ventas.at(-1)!;

    const e1 = aplicar(conVenta, activarProducto(conVenta, 'p1', false));

    // Fuera de la lista…
    expect(vistaProductos(e1).some((p) => p.id === 'p1')).toBe(false);
    // …pero la fila sigue existiendo, y la venta sigue apuntando a algo real.
    expect(e1.productos.find((p) => p.id === 'p1')).toBeDefined();
    expect(e1.ventas.find((v) => v.id === venta.id)!.items[0].productoId).toBe('p1');
    expect(e1.ventas.length).toBe(conVenta.ventas.length);
    // Y la mercadería que quedaba en la casa no desapareció por arte de magia.
    expect(calcularStock(e1.movimientos).get('p1')!.deposito)
      .toBe(calcularStock(conVenta.movimientos).get('p1')!.deposito);
  });

  it('se puede volver a activar', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, activarProducto(e0, 'p1', false));
    const e2 = aplicar(e1, activarProducto(e1, 'p1', true));
    expect(vistaProductos(e2).some((p) => p.id === 'p1')).toBe(true);
  });

  it('un comercio desactivado conserva su deuda', () => {
    const e0 = construirSemilla(HOY);
    const conDeuda = aplicar(e0, vender(e0, {
      clienteId: 'c1', items: [{ productoId: 'p1', cantidad: 2 }], formaPago: 'cuenta',
    }, ctx()));
    const e1 = aplicar(conDeuda, activarCliente(conDeuda, 'c1', false));

    expect(e1.clientes.find((c) => c.id === 'c1')!.activo).toBe(false);
    expect(e1.ventas.filter((v) => v.clienteId === 'c1').length)
      .toBe(conDeuda.ventas.filter((v) => v.clienteId === 'c1').length);
  });

  it('un proveedor desactivado sale de la lista', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, activarProveedor(e0, 'v1', false));
    expect(vistaProveedores(e1).lista.some((p) => p.id === 'v1')).toBe(false);
    expect(e1.compras.length).toBe(e0.compras.length);
  });

  it('archivar baja el número que muestran las tarjetas de "Mis cosas"', () => {
    /*
     * El número de la tarjeta salía de `estado.productos.length`, que cuenta
     * también los archivados. Archivar un producto dejaba la tarjeta diciendo
     * "3 productos" y la lista mostrando 2, y esa diferencia entre el resumen y
     * la lista es exactamente el tipo de cosa que lo hace desconfiar de la app.
     *
     * Se compara contra la lista, no contra un número escrito a mano: lo que
     * importa no es cuántos hay, es que la tarjeta y la lista digan lo mismo.
     */
    const e0 = construirSemilla(HOY);
    const antes = cuantosActivos(e0.productos);
    expect(antes).toBe(vistaProductos(e0).length);

    const e1 = aplicar(e0, activarProducto(e0, 'p1', false));
    expect(cuantosActivos(e1.productos)).toBe(antes - 1);
    expect(cuantosActivos(e1.productos)).toBe(vistaProductos(e1).length);
    // La fila sigue estando: se archivó, no se borró.
    expect(e1.productos.length).toBe(e0.productos.length);
  });

  it('archivar un comercio baja el número de "Mis clientes"', () => {
    const e0 = construirSemilla(HOY);
    const antes = cuantosActivos(e0.clientes);
    const e1 = aplicar(e0, activarCliente(e0, 'c1', false));
    expect(cuantosActivos(e1.clientes)).toBe(antes - 1);
    expect(e1.clientes.length).toBe(e0.clientes.length);
  });

  it('archivar un proveedor baja el número de "Mis proveedores"', () => {
    const e0 = construirSemilla(HOY);
    const antes = vistaProveedores(e0).lista.length;
    const e1 = aplicar(e0, activarProveedor(e0, 'v1', false));
    expect(vistaProveedores(e1).lista.length).toBe(antes - 1);
    expect(cuantosActivos(e1.proveedores)).toBe(antes - 1);
  });
});

// ---------------------------------------------------------------------------
// Alta de productos
// ---------------------------------------------------------------------------

describe('altaProducto', () => {
  it('deja el precio como una fila vigente, no como un campo del producto', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, altaProducto(e0, {
      nombre: 'Pretal acolchado', precioCent: pesos(8900),
    }, ctx()));

    const p = e1.productos.find((x) => x.nombre === 'Pretal acolchado')!;
    expect(precioDe(e1, p.id)).toBe(pesos(8900));
    // La regla de siempre: el objeto producto no tiene precio encima.
    expect('precio' in p).toBe(false);
    expect('stock' in p).toBe(false);
    expect('costo' in p).toBe(false);
    expect(e1.precios.filter((x) => x.productoId === p.id && x.vigenteHasta === null).length).toBe(1);
  });

  it('sin carga inicial, el producto existe pero todavía no tiene costo', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, altaProducto(e0, { nombre: 'Bozal', precioCent: pesos(5000) }, ctx()));
    const p = e1.productos.find((x) => x.nombre === 'Bozal')!;
    expect(costoDe(e1, p.id)).toBeNull();
    expect(calcularStock(e1.movimientos).get(p.id)).toBeUndefined();
  });

  it('con carga inicial, el stock y el costo salen del libro mayor', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, altaProducto(e0, {
      nombre: 'Bozal', precioCent: pesos(5000), proveedorId: 'v1',
      cargaInicial: { cantidad: 12, costoUnitarioCent: pesos(2600) },
    }, ctx()));

    const p = e1.productos.find((x) => x.nombre === 'Bozal')!;
    expect(calcularStock(e1.movimientos).get(p.id)!.deposito).toBe(12);
    expect(calcularStock(e1.movimientos).get(p.id)!.vehiculo).toBe(0);
    expect(costoDe(e1, p.id)).toBe(pesos(2600));

    // La carga inicial no puede inventarle una deuda con el proveedor.
    expect(e1.compras.at(-1)!.condicionPago).toBe('contado');
  });

  it('lo único obligatorio es el nombre y el precio', () => {
    const e0 = construirSemilla(HOY);
    expect(() => altaProducto(e0, { nombre: '', precioCent: pesos(100) }, ctx())).toThrow();
    expect(() => altaProducto(e0, { nombre: 'X', precioCent: 0 }, ctx())).toThrow();
  });

  it('acepta carga inicial SIN proveedor', () => {
    /*
     * Este test reemplaza a uno que exigía lo contrario, y el que estaba
     * encima era el bug.
     *
     * La pantalla decía "opcional" al lado del proveedor, dejaba escribir las
     * unidades y el costo, y al guardar tiraba "hace falta decir de qué
     * proveedor es". Como nadie agarraba esa excepción, la hoja quedaba abierta
     * sin cartel: parecía que el botón no hacía nada.
     *
     * Lo correcto es que sea opcional: "estas diez unidades ya las tengo en
     * casa" no se le compró a nadie hoy. Queda como compra al CONTADO y sin
     * proveedor — al contado porque no es una deuda nueva, y sin proveedor
     * porque no hay a quién debérsela.
     */
    const e0 = construirSemilla(HOY);
    const r = altaProducto(e0, {
      nombre: 'Producto sin proveedor',
      precioCent: pesos(100),
      cargaInicial: { cantidad: 5, costoUnitarioCent: pesos(50) },
    }, ctx());

    const compra = r.compras![0];
    expect(compra.proveedorId).toBeUndefined();
    expect(compra.condicionPago).toBe('contado');
    expect(r.movimientos![0].cantidad).toBe(5);
  });

  it('avisa cuando el nombre y la presentación ya existen', () => {
    const e0 = construirSemilla(HOY);
    const p1 = e0.productos.find((x) => x.id === 'p1')!;
    expect(productoParecido(e0, p1.nombre, p1.variante)?.id).toBe('p1');
    // Mismo nombre, otra presentación: es otro producto, no un duplicado.
    expect(productoParecido(e0, p1.nombre, 'Talle 9 · gigante')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cambio de precio a mano: la prueba de REGLA 0
// ---------------------------------------------------------------------------

describe('cambiarPrecio', () => {
  it('apila el precio nuevo y no toca el anterior', () => {
    const e0 = construirSemilla(HOY);
    const vigenteAntes = e0.precios.find((p) => p.productoId === 'p1' && p.vigenteHasta === null)!;
    const precioViejo = vigenteAntes.precioCent;

    const e1 = aplicar(e0, cambiarPrecio(e0, {
      productoId: 'p1', precioCent: pesos(4100), motivo: 'subió la competencia',
    }, ctx()));

    expect(precioDe(e1, 'p1')).toBe(pesos(4100));

    // La fila vieja sigue existiendo, con su precio original intacto.
    const filaVieja = e1.precios.find((p) => p.id === vigenteAntes.id)!;
    expect(filaVieja.precioCent).toBe(precioViejo);
    expect(filaVieja.vigenteHasta).toBe(HOY);

    // Y sigue habiendo exactamente un precio vigente.
    expect(e1.precios.filter((p) => p.productoId === 'p1' && p.vigenteHasta === null).length).toBe(1);
  });

  it('la ganancia de una venta anterior no se mueve', () => {
    const e0 = construirSemilla(HOY);
    const conVenta = aplicar(e0, vender(e0, {
      clienteId: 'c1', items: [{ productoId: 'p1', cantidad: 5 }], formaPago: 'efectivo',
    }, ctx()));
    const linea = conVenta.ventas.at(-1)!.items[0];
    const precioCongelado = linea.precioUnitarioCent;

    const e1 = aplicar(conVenta, cambiarPrecio(conVenta, {
      productoId: 'p1', precioCent: pesos(9999),
    }, ctx()));

    expect(e1.ventas.at(-1)!.items[0].precioUnitarioCent).toBe(precioCongelado);
    expect(e1.ventas.at(-1)!.totalCent).toBe(conVenta.ventas.at(-1)!.totalCent);
  });

  it('poner el mismo precio no agrega una fila', () => {
    const e0 = construirSemilla(HOY);
    const actual = precioDe(e0, 'p1')!;
    const r = cambiarPrecio(e0, { productoId: 'p1', precioCent: actual }, ctx());
    expect(r.precios ?? []).toEqual([]);
    expect(r.preciosCerrados ?? []).toEqual([]);
  });

  it('no acepta un precio de cero o negativo', () => {
    const e0 = construirSemilla(HOY);
    expect(() => cambiarPrecio(e0, { productoId: 'p1', precioCent: 0 }, ctx())).toThrow();
    expect(() => cambiarPrecio(e0, { productoId: 'p1', precioCent: -100 }, ctx())).toThrow();
  });

  it('deja poder responder a cuánto lo vendía antes', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, cambiarPrecio(e0, { productoId: 'p1', precioCent: pesos(4100) }, ctx()));
    const historial = historialPrecios(e1, 'p1');
    expect(historial.length).toBeGreaterThan(1);
    expect(historial.filter((h) => h.vigenteHasta === null).length).toBe(1);
  });
});

describe('altaProveedor', () => {
  it('queda disponible para cargar mercadería', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, altaProveedor(e0, {
      nombre: 'Mayorista del Sur', rubro: 'Higiene', contacto: '11 2222-1111',
    }, ctx()));
    const p = vistaProveedores(e1).lista.find((x) => x.nombre === 'Mayorista del Sur')!;
    expect(p).toBeDefined();
    expect(p.deboCent).toBe(0);
  });

  it('necesita un nombre', () => {
    const e0 = construirSemilla(HOY);
    expect(() => altaProveedor(e0, { nombre: '  ' }, ctx())).toThrow();
  });
});
