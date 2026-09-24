/**
 * Tests de regresión del bug de las cantidades.
 *
 * EL CASO REAL: cargaba 6 unidades y quedaban 60; cargaba 55 y quedaban 550. No
 * había ninguna multiplicación en el código — era texto que se pegaba al cero
 * que el campo ya mostraba, porque en un campo `type="number"` de teléfono
 * `select()` no selecciona nada y lo tipeado se inserta donde cayó el dedo.
 *
 * Estos tests fijan las dos mitades: que el campo no pueda volver a pegar texto,
 * y que la plata que sale de una cantidad sea exacta — 6 y 55 incluidos.
 */

import { describe, expect, it } from 'vitest';
import { pesos } from '../../domain/money.ts';
import {
  MAX_UNIDADES, acotar, alEnfocar, textoDeCantidad, textoParaMostrar, valorDeCantidad,
} from '../../ui/cantidad.ts';
import { vistaHoy } from '../../ui/vistas.ts';
import {
  altaCliente, altaProducto, aplicar, estadoVacio, vender, type Ctx, type EstadoApp,
} from '../estado.ts';
import { idsSecuenciales } from '../semilla.ts';

describe('el campo de cantidad no puede pegar texto', () => {
  it('en cero el campo va VACÍO, que es lo que evita el bug', () => {
    /*
     * La defensa de fondo: si no hay nada escrito, no hay nada a lo que pegarse,
     * caiga donde caiga el cursor. Con un "0" dibujado, tocar a la izquierda y
     * escribir 6 daba "60".
     */
    expect(textoParaMostrar(0)).toBe('');
    expect(textoParaMostrar(6)).toBe('6');
    expect(textoParaMostrar(55)).toBe('55');
  });

  it('escribir 6 sobre un campo vacío da 6, no 60', () => {
    expect(valorDeCantidad(textoDeCantidad('6'))).toBe(6);
  });

  it('escribir 55 sobre un campo vacío da 55, no 550 ni 5500', () => {
    expect(valorDeCantidad(textoDeCantidad('55'))).toBe(55);
  });

  it('y si igual llegara pegado, los ceros de adelante no cuentan', () => {
    // "06" es lo que sale si el cursor cae DESPUÉS del cero. Son 6, no 6 con un
    // cero que después se convierte en otra cosa.
    expect(valorDeCantidad(textoDeCantidad('06'))).toBe(6);
    expect(valorDeCantidad(textoDeCantidad('0055'))).toBe(55);
    expect(textoDeCantidad('007')).toBe('7');
  });

  it('solo dígitos: ni coma, ni menos, ni la "e" de los campos numéricos', () => {
    /*
     * Un campo `type="number"` acepta "e", "+", "-" y el separador decimal, y
     * cada uno de esos es una forma distinta de que una cantidad termine siendo
     * otra cosa. Acá no entra ninguno.
     */
    expect(textoDeCantidad('5e3')).toBe('53');
    expect(textoDeCantidad('-4')).toBe('4');
    expect(textoDeCantidad('1,5')).toBe('15');
    expect(textoDeCantidad('1.5')).toBe('15');
    expect(textoDeCantidad('abc')).toBe('');
  });

  it('al TOCAR el campo queda vacío, aunque ya tenga un número', () => {
    /*
     * La segunda mitad del bug: con un 6 cargado, tocar a la izquierda y escribir
     * 55 daba "556". Vaciando al entrar, lo que escribe siempre reemplaza.
     */
    expect(alEnfocar()).toBe('');
    expect(valorDeCantidad(textoDeCantidad(alEnfocar() + '55'))).toBe(55);
  });

  it('escribir un 0 vale: es como saca un producto del pedido', () => {
    expect(textoDeCantidad('0')).toBe('0');
    expect(valorDeCantidad('0')).toBe(0);
  });

  it('vacío es "todavía nada", no cero', () => {
    // Si vacío fuera cero, borrar para corregir sacaría el producto del pedido
    // en el medio de la corrección.
    expect(valorDeCantidad('')).toBe(null);
  });

  it('nunca se guarda una cantidad negativa ni con decimales', () => {
    expect(acotar(-3, 0)).toBe(0);
    expect(acotar(7.9, 0)).toBe(7);
    expect(acotar(3, 0, 2)).toBe(2);           // respeta el máximo cuando hay
    expect(acotar(999_999_999, 0)).toBe(MAX_UNIDADES);
  });
});

// ---------------------------------------------------------------------------

const HOY = '2026-09-24T14:00:00.000Z';
const ctx = (p = 'k'): Ctx => ({ nuevoId: idsSecuenciales(p), ahora: () => HOY });

/** Un comercio y un producto a $6.500. */
const armar = () => {
  const c = ctx();
  let e: EstadoApp = estadoVacio('n1', 'l1');
  e = aplicar(e, altaCliente(e, { nombre: 'Veterinaria del Norte' }, c));
  e = aplicar(e, altaProducto(e, { nombre: 'Pretal Plateado', precioCent: pesos(6500) }, c));
  return { e, c, cliente: e.clientes[0]!.id, producto: e.productos[0]!.id };
};

describe('la plata que sale de una cantidad es exacta', () => {
  it('6 unidades de $6.500 son $39.000, no $390.000', () => {
    /*
     * El número del bug, con su plata al lado: con 60 unidades el total daba
     * $390.000 y él le habría cobrado eso a un comercio.
     */
    let { e, c, cliente, producto } = armar();
    e = aplicar(e, vender(e, {
      clienteId: cliente, items: [{ productoId: producto, cantidad: 6 }],
      forma: 'efectivo', cobradoCent: pesos(39_000),
    }, c));

    const venta = e.ventas[0]!;
    expect(venta.items[0]!.cantidad).toBe(6);
    expect(venta.items[0]!.precioUnitarioCent).toBe(pesos(6500));
    expect(venta.totalCent).toBe(pesos(39_000));
  });

  it('55 unidades de $6.500 son $357.500', () => {
    let { e, c, cliente, producto } = armar();
    e = aplicar(e, vender(e, {
      clienteId: cliente, items: [{ productoId: producto, cantidad: 55 }],
      forma: 'efectivo', cobradoCent: pesos(357_500),
    }, c));

    expect(e.ventas[0]!.totalCent).toBe(pesos(357_500));
    expect(e.ventas[0]!.items[0]!.cantidad).toBe(55);
  });

  it('el stock baja las unidades vendidas, ni una más', () => {
    // El otro lado del mismo error: 60 unidades vendidas dejaban el stock 54
    // unidades abajo de lo que correspondía.
    let { e, c, cliente, producto } = armar();
    e = aplicar(e, vender(e, {
      clienteId: cliente, items: [{ productoId: producto, cantidad: 6 }],
      forma: 'efectivo', cobradoCent: pesos(39_000),
    }, c));

    const movimientos = e.movimientos.filter((m) => m.productoId === producto);
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]!.cantidad).toBe(-6);
  });

  it('la cantidad NO pasa por la conversión a centavos', () => {
    /*
     * La confusión que el bug hacía sospechar. Los importes se guardan en
     * centavos enteros y las cantidades en unidades: si alguna vez alguien
     * pasara una cantidad por `pesos()`, seis unidades serían seiscientas.
     */
    let { e, c, cliente, producto } = armar();
    e = aplicar(e, vender(e, {
      clienteId: cliente, items: [{ productoId: producto, cantidad: 6 }],
      forma: 'efectivo', cobradoCent: pesos(39_000),
    }, c));

    expect(e.ventas[0]!.items[0]!.cantidad).toBe(6);
    expect(e.ventas[0]!.items[0]!.cantidad).not.toBe(600);
  });

  it('el resumen del día cuenta 6 productos y $39.000', () => {
    let { e, c, cliente, producto } = armar();
    e = aplicar(e, vender(e, {
      clienteId: cliente, items: [{ productoId: producto, cantidad: 6 }],
      forma: 'efectivo', cobradoCent: pesos(39_000),
    }, c));

    const v = vistaHoy(e, HOY);
    expect(v.ventasDeHoy[0]!.items).toBe(6);
    expect(v.vendidoHoyCent).toBe(pesos(39_000));
    expect(v.cobradoHoyCent).toBe(pesos(39_000));
  });

  it('dos renglones suman lo suyo y nada más', () => {
    const c = ctx('m');
    let e: EstadoApp = estadoVacio('n1', 'l1');
    e = aplicar(e, altaCliente(e, { nombre: 'Comercio' }, c));
    e = aplicar(e, altaProducto(e, { nombre: 'Pretal', precioCent: pesos(6500) }, c));
    e = aplicar(e, altaProducto(e, { nombre: 'Pelota', precioCent: pesos(1800) }, c));
    const [pretal, pelota] = e.productos.map((p) => p.id) as [string, string];

    const total = pesos(6 * 6500 + 55 * 1800);   // 39.000 + 99.000 = 138.000
    e = aplicar(e, vender(e, {
      clienteId: e.clientes[0]!.id,
      items: [
        { productoId: pretal, cantidad: 6 },
        { productoId: pelota, cantidad: 55 },
      ],
      forma: 'efectivo', cobradoCent: total,
    }, c));

    expect(e.ventas[0]!.totalCent).toBe(pesos(138_000));
    expect(e.ventas[0]!.items.map((i) => i.cantidad)).toEqual([6, 55]);
  });
});
