/**
 * Tests de "ordenar por".
 *
 * Un orden mal hecho es de los errores más difíciles de ver: no tira ninguna
 * excepción, no deja ningún dato mal guardado, la pantalla se dibuja perfecta.
 * Simplemente muestra las cosas en la secuencia equivocada, y eso recién se nota
 * cuando alguien busca algo y no está donde esperaba.
 *
 * Los dos casos que más importan acá son los bordes: qué pasa con los que NO
 * tienen el dato por el que se ordena, y qué pasa con los empates.
 */

import { describe, expect, it } from 'vitest';
import {
  buscarClientes, buscarProductos, buscarProveedores,
  ordenarClientes, ordenarProductos, ordenarProveedores,
} from '../../ui/orden.ts';
import type { ProductoVista, ProveedorVista, DeudaVista } from '../../ui/vistas.ts';
import type { Cliente } from '../../domain/types.ts';

const prod = (p: Partial<ProductoVista> & { id: string; nombre: string }): ProductoVista => ({
  precioCent: 100_000, costoCent: null, gananciaCent: null, margen: null,
  enDeposito: 0, enVehiculo: 0, historial: [], ...p,
});

const cli = (c: Partial<Cliente> & { id: string; nombre: string }): Cliente =>
  ({ negocioId: 'n', activo: true, ...c });

const prov = (p: Partial<ProveedorVista> & { id: string; nombre: string }): ProveedorVista =>
  ({ deboCent: 0, productos: 0, ...p });

const nombres = <T extends { nombre: string }>(l: T[]) => l.map((x) => x.nombre);

describe('ordenar productos', () => {
  it('por código, numérico y no alfabético', () => {
    // Es la diferencia que importa: alfabéticamente "101" va antes que "9",
    // y en la planilla del cliente el 9 viene primero.
    const l = [prod({ id: 'a', nombre: 'A', codigo: '101' }), prod({ id: 'b', nombre: 'B', codigo: '9' })];
    expect(ordenarProductos(l, 'codigo').map((p) => p.codigo)).toEqual(['9', '101']);
  });

  it('los productos sin código van al final', () => {
    const l = [
      prod({ id: 'a', nombre: 'Sin código' }),
      prod({ id: 'b', nombre: 'Con código', codigo: '110' }),
    ];
    expect(nombres(ordenarProductos(l, 'codigo'))).toEqual(['Con código', 'Sin código']);
  });

  it('por precio, del más caro al más barato', () => {
    const l = [
      prod({ id: 'a', nombre: 'Barato', precioCent: 100_000 }),
      prod({ id: 'b', nombre: 'Caro', precioCent: 900_000 }),
    ];
    expect(nombres(ordenarProductos(l, 'precio'))).toEqual(['Caro', 'Barato']);
  });

  it('los productos SIN precio van al final, no al principio', () => {
    /*
     * Este es el que justifica el helper `porNumeroDesc`.
     *
     * Para ordenar de mayor a menor es tentador invertir los argumentos de un
     * comparador ascendente. Eso funciona para los números, pero también invierte
     * dónde caen los vacíos: los productos sin precio se irían arriba de todo,
     * justo en la pantalla donde él busca lo más caro.
     */
    const l = [
      prod({ id: 'a', nombre: 'Sin precio', precioCent: null }),
      prod({ id: 'b', nombre: 'Barato', precioCent: 50_000 }),
      prod({ id: 'c', nombre: 'Caro', precioCent: 500_000 }),
    ];
    expect(nombres(ordenarProductos(l, 'precio'))).toEqual(['Caro', 'Barato', 'Sin precio']);
  });

  it('por rubro, y dentro del rubro por nombre', () => {
    const l = [
      prod({ id: 'a', nombre: 'Zeta', categoria: 'collar' }),
      prod({ id: 'b', nombre: 'Alfa', categoria: 'collar' }),
      prod({ id: 'c', nombre: 'Beta', categoria: 'juguete' }),
    ];
    expect(nombres(ordenarProductos(l, 'rubro'))).toEqual(['Alfa', 'Zeta', 'Beta']);
  });

  it('alfabético sin distinguir acentos ni mayúsculas', () => {
    /*
     * Los dos casos que una comparación cruda de textos se equivoca:
     *
     *  - "Ábaco" vs "banana": el código de "Á" es 193 y el de "b" es 98, así que
     *    una comparación cruda pondría "banana" primero.
     *  - "Zapato" vs "ancla": "Z" es 90 y "a" es 97, así que una comparación
     *    cruda pondría todas las mayúsculas antes que las minúsculas.
     *
     * Con `localeCompare` en español las dos salen como las leería una persona.
     */
    const l = [
      prod({ id: 'a', nombre: 'Zapato' }),
      prod({ id: 'b', nombre: 'banana' }),
      prod({ id: 'c', nombre: 'Ábaco' }),
      prod({ id: 'd', nombre: 'ancla' }),
    ];
    expect(nombres(ordenarProductos(l, 'nombre')))
      .toEqual(['Ábaco', 'ancla', 'banana', 'Zapato']);
  });

  it('no altera la lista original', () => {
    // `Array.sort` muta. Estas listas vienen del estado de la app.
    const l = [prod({ id: 'a', nombre: 'Zeta' }), prod({ id: 'b', nombre: 'Alfa' })];
    ordenarProductos(l, 'nombre');
    expect(nombres(l)).toEqual(['Zeta', 'Alfa']);
  });
});

describe('ordenar comercios', () => {
  const deudas: DeudaVista[] = [
    { clienteId: 'a', nombre: 'A', saldoCent: 1000, dias: 3, antiguedad: 'reciente' },
    { clienteId: 'b', nombre: 'B', saldoCent: 1000, dias: 40, antiguedad: 'muy_atrasado' },
  ];

  it('por deuda más vieja primero, y los que no deben al final', () => {
    const l = [
      cli({ id: 'c', nombre: 'No debe' }),
      cli({ id: 'a', nombre: 'Debe hace 3' }),
      cli({ id: 'b', nombre: 'Debe hace 40' }),
    ];
    expect(nombres(ordenarClientes(l, 'deuda', 'desc', deudas)))
      .toEqual(['Debe hace 40', 'Debe hace 3', 'No debe']);
  });

  it('por ubicación, con los sin ubicación al final', () => {
    const l = [
      cli({ id: 'a', nombre: 'Sin zona' }),
      cli({ id: 'b', nombre: 'De Morón', zona: 'Morón' }),
      cli({ id: 'c', nombre: 'De Castelar', zona: 'Castelar' }),
    ];
    expect(nombres(ordenarClientes(l, 'ubicacion')))
      .toEqual(['De Castelar', 'De Morón', 'Sin zona']);
  });
});

describe('ordenar proveedores', () => {
  it('por deuda más vieja primero, y los que no deben al final', () => {
    const l = [
      prov({ id: 'a', nombre: 'Sin deuda' }),
      prov({ id: 'b', nombre: 'Deuda nueva', deudaDesde: '2026-09-10T10:00:00.000Z' }),
      prov({ id: 'c', nombre: 'Deuda vieja', deudaDesde: '2026-06-01T10:00:00.000Z' }),
    ];
    expect(nombres(ordenarProveedores(l, 'deuda')))
      .toEqual(['Deuda vieja', 'Deuda nueva', 'Sin deuda']);
  });

  it('por ubicación', () => {
    const l = [
      prov({ id: 'a', nombre: 'Once', zona: 'Once' }),
      prov({ id: 'b', nombre: 'Avellaneda', zona: 'Avellaneda' }),
    ];
    expect(nombres(ordenarProveedores(l, 'ubicacion'))).toEqual(['Avellaneda', 'Once']);
  });
});

describe('invertir el orden', () => {
  it('Z–A da vuelta los nombres pero NO sube los vacíos', () => {
    /*
     * El caso que hay que cuidar al agregar la dirección.
     *
     * Invertir el resultado del comparador entero daría vuelta los nombres y
     * también dónde caen los que no tienen el dato: los productos sin código se
     * irían arriba de todo justo cuando alguien ordena por código. La dirección
     * tiene que invertir solo la comparación entre dos valores presentes.
     */
    const l = [
      prod({ id: 'a', nombre: 'Alfa', codigo: '1' }),
      prod({ id: 'b', nombre: 'Beta', codigo: '2' }),
      prod({ id: 'c', nombre: 'Sin código' }),
    ];
    expect(nombres(ordenarProductos(l, 'codigo', 'desc')))
      .toEqual(['Beta', 'Alfa', 'Sin código']);
  });

  it('precio ascendente: del más barato al más caro, y los sin precio al final', () => {
    const l = [
      prod({ id: 'a', nombre: 'Caro', precioCent: 900_000 }),
      prod({ id: 'b', nombre: 'Sin precio', precioCent: null }),
      prod({ id: 'c', nombre: 'Barato', precioCent: 100_000 }),
    ];
    expect(nombres(ordenarProductos(l, 'precio', 'asc')))
      .toEqual(['Barato', 'Caro', 'Sin precio']);
  });
});

describe('buscar', () => {
  const catalogo = [
    prod({ id: 'a', nombre: 'Collar reflectivo doble', codigo: '110', categoria: 'collares' }),
    prod({ id: 'b', nombre: 'Pelota de goma', codigo: '205', categoria: 'juguetes' }),
    prod({ id: 'c', nombre: 'Piedra sanitaria', codigo: '310', categoria: 'higiene' }),
  ];

  it('encuentra por código', () => {
    expect(nombres(buscarProductos(catalogo, '205'))).toEqual(['Pelota de goma']);
  });

  it('encuentra por un pedazo del nombre', () => {
    // Nadie escribe la palabra entera buscando en un celular.
    expect(nombres(buscarProductos(catalogo, 'refle'))).toEqual(['Collar reflectivo doble']);
  });

  it('encuentra por rubro', () => {
    expect(nombres(buscarProductos(catalogo, 'higiene'))).toEqual(['Piedra sanitaria']);
  });

  it('ignora acentos y mayúsculas', () => {
    const l = [cli({ id: 'a', nombre: 'Pet Shop', zona: 'Morón' })];
    expect(buscarClientes(l, 'MORON')).toHaveLength(1);
    expect(buscarClientes(l, 'morón')).toHaveLength(1);
  });

  it('con varias palabras, las busca todas aunque estén al revés', () => {
    expect(nombres(buscarProductos(catalogo, 'goma pelota'))).toEqual(['Pelota de goma']);
  });

  it('sin búsqueda devuelve la lista entera, y la MISMA referencia', () => {
    // Que sea la misma referencia evita que React vuelva a dibujar la lista
    // entera cada vez que se teclea y se borra.
    expect(buscarProductos(catalogo, '')).toBe(catalogo);
    expect(buscarProductos(catalogo, '   ')).toBe(catalogo);
  });

  it('lo que no está, no aparece', () => {
    expect(buscarProductos(catalogo, 'bicicleta')).toEqual([]);
  });

  it('proveedores: por nombre, ubicación o rubro', () => {
    const l = [
      prov({ id: 'a', nombre: 'Distribuidora Once', zona: 'Once', rubro: 'Collares' }),
      prov({ id: 'b', nombre: 'Juguetería Sur', zona: 'Avellaneda', rubro: 'Juguetes' }),
    ];
    expect(nombres(buscarProveedores(l, 'once'))).toEqual(['Distribuidora Once']);
    expect(nombres(buscarProveedores(l, 'avellaneda'))).toEqual(['Juguetería Sur']);
    expect(nombres(buscarProveedores(l, 'juguetes'))).toEqual(['Juguetería Sur']);
  });
});
