/**
 * Tests de lo que SALE de la app y del borrador de la venta.
 *
 * El primer grupo es el más importante de todo el proyecto en términos de daño
 * posible: la lista de precios se manda por WhatsApp y de ahí va a donde sea. Si
 * un día lleva el costo, el cliente se entera de cuánto gana él con cada
 * producto, y eso no se puede deshacer con una actualización.
 *
 * Por eso los tests no preguntan "¿está bien formateada?", preguntan
 * "¿aparece en algún lado un número que no debería estar?".
 */

import { describe, expect, it } from 'vitest';
import { formatear, pesos } from '../../domain/money.ts';
import {
  COLUMNAS, conBom, listaDePreciosTexto, nombreDeArchivo, planillaCsv,
  type FilaDePlanilla, type LineaDeLista,
} from '../../ui/exportar.ts';
import {
  DIAS_DE_VIDA, borrarBorrador, guardarBorrador, leerBorrador, type Guardarropa,
} from '../../ui/borrador.ts';

const NEGOCIO = 'Pompi Mayorista';
const FECHA = 'martes 22 de septiembre';

const LINEAS: LineaDeLista[] = [
  { codigo: '1179', nombre: 'Pretal Plateado', precioCent: pesos(6500) },
  { codigo: '205', nombre: 'Pelota de goma', precioCent: pesos(1800) },
  { nombre: 'Correa sin código', precioCent: pesos(4100) },
];

describe('la lista de precios que se comparte', () => {
  it('lleva código, nombre y precio de venta', () => {
    const texto = listaDePreciosTexto(LINEAS, NEGOCIO, FECHA);

    expect(texto).toContain('Pompi Mayorista');
    expect(texto).toContain(FECHA);
    expect(texto).toContain(`1179 · Pretal Plateado: ${formatear(pesos(6500))}`);
    expect(texto).toContain(`205 · Pelota de goma: ${formatear(pesos(1800))}`);
    expect(texto).toContain('3 productos');
  });

  it('NO puede llevar el costo, porque no lo recibe', () => {
    /*
     * El control de fondo, y el motivo por el que la función toma `LineaDeLista`
     * y no `ProductoVista`: el costo no está en los datos que entran. Si alguien
     * quisiera filtrarlo a la lista tendría que cambiar el tipo, y este test le
     * avisa. Acá se simula el intento: se le pasan costos adentro del objeto y
     * se verifica que no salgan por ningún lado.
     */
    const conCostoEscondido = LINEAS.map((l) => ({
      ...l,
      costoCent: pesos(4000),
      margen: 0.38,
      enStock: 27,
    })) as LineaDeLista[];

    const texto = listaDePreciosTexto(conCostoEscondido, NEGOCIO, FECHA);

    expect(texto).not.toContain(formatear(pesos(4000)));   // el costo
    expect(texto).not.toContain('4000');
    expect(texto).not.toContain('0.38');
    expect(texto).not.toContain('27');                     // el stock
    expect(texto.toLowerCase()).not.toContain('costo');
    expect(texto.toLowerCase()).not.toContain('ganancia');
    expect(texto.toLowerCase()).not.toContain('margen');
    expect(texto.toLowerCase()).not.toContain('stock');
  });

  it('cada renglón tiene exactamente un importe: el precio de venta', () => {
    /*
     * Contar los "$" del renglón es la forma más directa de asegurar que no se
     * coló un segundo número de plata al lado del precio.
     */
    const texto = listaDePreciosTexto(LINEAS, NEGOCIO, FECHA);
    const renglones = texto.split('\n').filter((r) => r.includes('$'));

    expect(renglones).toHaveLength(3);
    for (const r of renglones) {
      expect(r.split('$')).toHaveLength(2);   // un solo signo por renglón
    }
  });

  it('ordena por código numérico y deja al final los que no tienen', () => {
    const texto = listaDePreciosTexto(LINEAS, NEGOCIO, FECHA);
    const orden = texto.split('\n').filter((r) => r.includes('$'));

    expect(orden[0]).toContain('205');        // 205 antes que 1179, numérico
    expect(orden[1]).toContain('1179');
    expect(orden[2]).toContain('Correa sin código');
  });

  it('con un solo producto, dice producto y no productos', () => {
    expect(listaDePreciosTexto([LINEAS[0]!], NEGOCIO, FECHA)).toContain('1 producto\n');
  });
});

describe('la planilla privada', () => {
  const FILAS: FilaDePlanilla[] = [
    {
      codigo: '1179', nombre: 'Pretal Plateado', rubro: 'Paseo',
      stock: 10, precioCent: pesos(6500), costoCent: pesos(4000),
    },
    { nombre: 'Sin nada', stock: 0, precioCent: null, costoCent: null },
  ];

  it('tiene las siete columnas pedidas, en orden', () => {
    expect([...COLUMNAS]).toEqual([
      'Código', 'Nombre', 'Rubro', 'Stock actual',
      'Precio de lista', 'Costo unitario', 'Valor total de stock',
    ]);
    expect(planillaCsv(FILAS).split('\r\n')[0]).toBe(COLUMNAS.join(';'));
  });

  it('acá SÍ va el costo y el valor del stock', () => {
    // Es la diferencia con la lista: esta planilla no se comparte, se baja.
    const fila = planillaCsv(FILAS).split('\r\n')[1]!;
    expect(fila).toBe('1179;Pretal Plateado;Paseo;10;6500;4000;40000');
  });

  it('lo que falta queda vacío, no en cero', () => {
    /*
     * Un cero en la columna de costo sería una afirmación —"me salió gratis"—
     * y encima sumaría al totalizar la columna en Excel. Vacío es "no lo sé".
     */
    expect(planillaCsv(FILAS).split('\r\n')[2]).toBe(';Sin nada;;0;;;');
  });

  it('un nombre con punto y coma no parte la fila', () => {
    const csv = planillaCsv([
      { nombre: 'Collar "chico"; rojo', stock: 2, precioCent: pesos(100), costoCent: pesos(50) },
    ]);
    expect(csv.split('\r\n')[1]).toBe(';"Collar ""chico""; rojo";;2;100;50;100');
  });

  it('los decimales van con coma, que es lo que entiende Excel en español', () => {
    const csv = planillaCsv([
      { nombre: 'Medio peso', stock: 1, precioCent: 150, costoCent: 50 },
    ]);
    expect(csv).toContain(';1,5;0,5;0,5');
  });

  it('el valor del stock no se calcula sobre un stock negativo', () => {
    const csv = planillaCsv([
      { nombre: 'En rojo', stock: -4, precioCent: pesos(100), costoCent: pesos(50) },
    ]);
    expect(csv.split('\r\n')[1]).toBe(';En rojo;;-4;100;50;0');
  });

  it('el archivo arranca con el BOM, o Excel rompe los acentos', () => {
    expect(conBom('a;b').charCodeAt(0)).toBe(0xFEFF);
  });

  it('el nombre del archivo no tiene acentos ni espacios', () => {
    expect(nombreDeArchivo('Pompi Mayorista', '2026-09-22', 'csv'))
      .toBe('Pompi-Mayorista-2026-09-22.csv');
  });
});

// ---------------------------------------------------------------------------

/** Un `localStorage` de mentira, para probar sin navegador. */
const guardarropa = (): Guardarropa & { datos: Map<string, string> } => {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => { datos.set(k, v); },
    removeItem: (k) => { datos.delete(k); },
  };
};

const AHORA = '2026-09-22T14:00:00.000Z';

describe('el borrador de la venta', () => {
  it('lo guardado se recupera igual', () => {
    /*
     * El caso del pedido: carga once productos, se va a mirar el stock, vuelve,
     * y el carrito tiene que estar como lo dejó.
     */
    const g = guardarropa();
    guardarBorrador({ clienteId: 'c1', items: { p1: 3, p2: 11 } }, AHORA, g);

    expect(leerBorrador(AHORA, g)).toEqual({
      clienteId: 'c1', items: { p1: 3, p2: 11 }, tocadoEn: AHORA,
    });
  });

  it('un pedido vacío BORRA el guardado en vez de guardar un carrito vacío', () => {
    const g = guardarropa();
    guardarBorrador({ clienteId: 'c1', items: { p1: 3 } }, AHORA, g);
    guardarBorrador({ clienteId: 'c1', items: { p1: 0 } }, AHORA, g);

    expect(leerBorrador(AHORA, g)).toBe(null);
    expect(g.datos.size).toBe(0);
  });

  it('sin comercio elegido no se guarda nada', () => {
    const g = guardarropa();
    guardarBorrador({ clienteId: null, items: { p1: 3 } }, AHORA, g);
    expect(leerBorrador(AHORA, g)).toBe(null);
  });

  it('vaciar el pedido lo borra', () => {
    const g = guardarropa();
    guardarBorrador({ clienteId: 'c1', items: { p1: 3 } }, AHORA, g);
    borrarBorrador(g);
    expect(leerBorrador(AHORA, g)).toBe(null);
  });

  it(`después de ${DIAS_DE_VIDA} días deja de ofrecerse`, () => {
    /*
     * Retomar el pedido de hace dos semanas no es ayudar: los precios cambiaron
     * y lo más probable es que esa venta ya se haya hecho por otro lado.
     */
    const g = guardarropa();
    guardarBorrador({ clienteId: 'c1', items: { p1: 3 } }, '2026-09-18T14:00:00.000Z', g);

    expect(leerBorrador('2026-09-20T14:00:00.000Z', g)).not.toBe(null);   // dos días
    expect(leerBorrador('2026-09-26T14:00:00.000Z', g)).toBe(null);       // ocho
  });

  it('un guardado corrupto no rompe nada: devuelve null', () => {
    /*
     * Un carrito a medio armar por un dato roto sería peor que ninguno, porque
     * terminaría en una venta mal anotada.
     */
    const g = guardarropa();
    for (const basura of ['no es json', '{}', '[]', '{"clienteId":"c1"}', 'null']) {
      g.datos.set('pompi.borrador.venta', basura);
      expect(leerBorrador(AHORA, g)).toBe(null);
    }
  });

  it('las cantidades que no son números positivos se descartan', () => {
    const g = guardarropa();
    g.datos.set('pompi.borrador.venta', JSON.stringify({
      clienteId: 'c1',
      items: { bueno: 4, cero: 0, negativo: -2, texto: 'tres', roto: NaN },
      tocadoEn: AHORA,
    }));

    expect(leerBorrador(AHORA, g)!.items).toEqual({ bueno: 4 });
  });

  it('sin lugar donde guardar, la app sigue andando', () => {
    // Modo privado, o el navegador con el almacenamiento bloqueado.
    expect(() => guardarBorrador({ clienteId: 'c1', items: { p1: 1 } }, AHORA, null)).not.toThrow();
    expect(() => borrarBorrador(null)).not.toThrow();
    expect(leerBorrador(AHORA, null)).toBe(null);
  });
});
