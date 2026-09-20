/**
 * La app arranca vacía. Estos tests prueban que eso no rompa nada.
 *
 * Hasta el 16/09/2026 la app se sembraba con datos de ejemplo, así que **ningún
 * camino del código se había ejecutado nunca con cero productos y cero
 * comercios**. Sacar la semilla convirtió un caso que no existía en el caso
 * NORMAL: es lo primero que ve alguien que recién creó su cuenta.
 *
 * Lo que se busca acá es lo que rompe cuando una lista está vacía: divisiones
 * por cero que devuelven `NaN` o `Infinity` y terminan pintados en pantalla como
 * "$NaN", y `Math.max()` sin argumentos que devuelve `-Infinity`.
 */

import { describe, expect, it } from 'vitest';
import { altaCliente, altaProducto, altaProveedor, aplicar, estadoVacio, vender } from '../estado.ts';
import { construirSemilla, idsSecuenciales } from '../semilla.ts';
import { esDatosDeEjemplo, esIdReal, sinDatosDeEjemplo } from '../limpieza.ts';
import {
  sugerenciasPendientes, vistaDeudas, vistaHoy, vistaNumeros,
  vistaParaVender, vistaProductos, vistaProveedores,
} from '../../ui/vistas.ts';

const HOY = '2026-09-16T12:00:00.000Z';
/** Ids con forma de uuid, como los que genera la app de verdad. */
const NEGOCIO = '01a0ab4e-e3f5-7b59-92b4-4f52d481a20c';
const LISTA = '01a0ab4e-e403-7848-9bc6-a962b14dc471';
const vacio = () => estadoVacio(NEGOCIO, LISTA);
const ctx = () => ({ nuevoId: idsSecuenciales('t'), ahora: () => HOY });

/** Recorre cualquier estructura y junta todo número que no sea un número usable. */
const numerosRotos = (x: unknown, ruta = ''): string[] => {
  if (typeof x === 'number') return Number.isFinite(x) ? [] : [`${ruta} = ${x}`];
  if (Array.isArray(x)) return x.flatMap((v, i) => numerosRotos(v, `${ruta}[${i}]`));
  if (x && typeof x === 'object') {
    return Object.entries(x).flatMap(([k, v]) => numerosRotos(v, ruta ? `${ruta}.${k}` : k));
  }
  return [];
};

describe('el estado vacío', () => {
  it('no tiene nada cargado, pero sí negocio y lista', () => {
    const e = vacio();
    expect(e.negocioId).toBe(NEGOCIO);
    expect(e.listaId).toBe(LISTA);
    for (const col of [e.productos, e.clientes, e.proveedores, e.precios,
      e.movimientos, e.compras, e.ventas, e.pagos, e.sugerencias]) {
      expect(col).toHaveLength(0);
    }
  });

  it('ninguna pantalla se rompe ni muestra NaN', () => {
    const e = vacio();
    const vistas = {
      hoy: vistaHoy(e, HOY),
      deudas: vistaDeudas(e, HOY),
      productos: vistaProductos(e),
      paraVender: vistaParaVender(e),
      numeros: vistaNumeros(e, HOY),
      proveedores: vistaProveedores(e),
      sugerencias: sugerenciasPendientes(e),
    };
    expect(numerosRotos(vistas)).toEqual([]);
  });

  it('los totales dan cero, no vacío ni indefinido', () => {
    const e = vacio();
    expect(vistaDeudas(e, HOY).totalCent).toBe(0);
    expect(vistaProveedores(e).totalCent).toBe(0);
    const n = vistaNumeros(e, HOY);
    expect([n.ventasCent, n.costoCent, n.gananciaCent, n.margen]).toEqual([0, 0, 0, 0]);
  });

  it('el gráfico de los 7 días existe igual, todo en cero', () => {
    // La pantalla escala las barras con el día más alto. Con la lista vacía,
    // `Math.max()` sin argumentos daría -Infinity y las barras saldrían al revés.
    const dias = vistaNumeros(vacio(), HOY).ultimos7;
    expect(dias).toHaveLength(7);
    expect(dias.every((d) => d.ventaCent === 0)).toBe(true);
    expect(Math.max(...dias.map((d) => d.ventaCent), 1)).toBe(1);
  });

  it('sin ventas no hay más vendido ni más rentable, y no explota', () => {
    const n = vistaNumeros(vacio(), HOY);
    expect(n.masVendidos).toEqual([]);
    expect(n.masRentable).toBeNull();
  });
});

describe('desde cero hasta la primera venta', () => {
  it('el camino completo funciona sin ningún dato previo', () => {
    // Es lo que va a hacer él el primer día. Si esto anda, la app sirve vacía.
    const c = ctx();
    let e = vacio();

    e = aplicar(e, altaProveedor(e, { nombre: 'Distribuidora Sur' }, c));
    const proveedorId = e.proveedores[0].id;

    e = aplicar(e, altaProducto(e, {
      nombre: 'Collar de nylon',
      precioCent: 320_000,
      proveedorId,
      cargaInicial: { cantidad: 10, costoUnitarioCent: 190_000 },
    }, c));
    const productoId = e.productos[0].id;

    e = aplicar(e, altaCliente(e, { nombre: 'Pet Shop del barrio' }, c));
    const clienteId = e.clientes[0].id;

    // Desde la 009 se vende directo del stock: no hay ningún paso en el medio.
    e = aplicar(e, vender(e, {
      clienteId,
      items: [{ productoId, cantidad: 2 }],
      formaPago: 'cuenta',
    }, c));

    const n = vistaNumeros(e, HOY);
    expect(n.ventasCent).toBe(640_000);                  // 2 × $3.200
    expect(n.costoCent).toBe(380_000);                   // 2 × $1.900
    expect(n.gananciaCent).toBe(260_000);
    expect(vistaDeudas(e, HOY).totalCent).toBe(640_000); // quedó a cuenta
    expect(numerosRotos(n)).toEqual([]);
  });
});

describe('los datos de ejemplo se reconocen para poder borrarlos', () => {
  const UUID_A = NEGOCIO;
  const UUID_B = LISTA;
  const real = vacio;

  it('la semilla entera se reconoce y se tira', () => {
    // Las versiones viejas sembraban la app y esos datos quedaron guardados en
    // el navegador de cualquiera que la haya abierto. Como nunca subieron al
    // servidor, la única forma de sacarlos es reconocerlos acá.
    expect(esDatosDeEjemplo(construirSemilla(HOY))).toBe(true);
    expect(sinDatosDeEjemplo(construirSemilla(HOY))).toBeNull();
  });

  it('un negocio real no se toca, y se devuelve el MISMO objeto', () => {
    // La igualdad por referencia es lo que evita reescribir la base local en
    // cada apertura de la app.
    const e = real();
    expect(esDatosDeEjemplo(e)).toBe(false);
    expect(sinDatosDeEjemplo(e)).toBe(e);
  });

  it('mezclados con datos reales, saca solo los de ejemplo', () => {
    /*
     * ESTE es el caso que la detección por `negocioId` no veía.
     *
     * Al unir lo que baja del servidor con lo del aparato, el negocio pasa a ser
     * el del servidor —un uuid— mientras las filas de ejemplo siguen abajo. La
     * marca de la que dependía la detección desaparecía y los comercios
     * inventados quedaban adentro para siempre, indistinguibles de los reales.
     */
    const e = {
      ...real(),
      clientes: [
        { id: 'c1', negocioId: UUID_A, nombre: 'Pet Shop Huellitas', activo: true },
        { id: UUID_B, negocioId: UUID_A, nombre: 'Comercio de verdad', activo: true },
      ],
      productos: [{ id: 'p1', negocioId: UUID_A, nombre: 'Collar de ejemplo', unidad: 'unidad', activo: true }],
    };

    const limpio = sinDatosDeEjemplo(e)!;
    expect(limpio).not.toBe(e);                                  // hubo cambios
    expect(limpio.clientes.map((c) => c.nombre)).toEqual(['Comercio de verdad']);
    expect(limpio.productos).toHaveLength(0);
  });

  it('la prueba es el formato del id, no el nombre ni el negocio', () => {
    // Un producto real puede llamarse igual que uno de ejemplo. Lo que no puede
    // es tener un id que no sea uuid: la columna `id` de Postgres es de tipo
    // uuid y no acepta "p1". Por eso esta prueba no confunde uno con otro.
    const e = {
      ...real(),
      productos: [{ id: UUID_B, negocioId: UUID_A, nombre: 'Collar de nylon reforzado', unidad: 'unidad', activo: true }],
    };
    expect(sinDatosDeEjemplo(e)).toBe(e);
  });
});

describe('la cola de salida después de la limpieza', () => {
  const UUID = '01a0ab4e-e3f5-7b59-92b4-4f52d481a20c';

  it('una operación con id de ejemplo se reconoce como descartable', () => {
    /*
     * ESTE CASO APARECIÓ EN PRODUCCIÓN, no acá.
     *
     * Después de limpiar los datos quedaron 16 operaciones `guardar_producto`
     * con ids `p1`, `p10`, `p11`… en estado `error`, con nueve intentos cada una
     * y siempre la misma respuesta de Postgres:
     *
     *     22P02  invalid input syntax for type uuid: "p1"
     *
     * Son la prueba de que los datos de ejemplo NUNCA pudieron llegar al
     * servidor: la columna `id` es de tipo uuid y no acepta "p1", por más veces
     * que se reintente. Pero quedaban en el aparato haciendo que el cartel
     * dijera "16 operaciones sin subir" en una app recién limpiada.
     */
    expect(esIdReal('p1')).toBe(false);
    expect(esIdReal('p10')).toBe(false);
    expect(esIdReal('s-0014')).toBe(false);
    expect(esIdReal('c3')).toBe(false);
  });

  it('una operación de verdad NO se descarta', () => {
    // Es la línea que separa "limpiar basura" de "perder una venta".
    expect(esIdReal(UUID)).toBe(true);
  });
});
