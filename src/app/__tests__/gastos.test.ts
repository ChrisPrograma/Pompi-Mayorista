/**
 * Tests de los gastos operativos.
 *
 * Lo que se prueba acá es que la plata que sale se cuente una sola vez, que un
 * gasto anulado deje de costar, y que el campo del importe no pueda armar un
 * número que no es el que él tipeó — que es el mismo cuidado que hubo que
 * tener con el campo de cantidad después del bug de "cargo 6 y quedan 60".
 */

import { describe, expect, it } from 'vitest';
import { pesos } from '../../domain/money.ts';
import {
  CATEGORIAS, MAX_PESOS, categoria, centavosDeMonto, porCategoria, textoDeMonto,
  totalDeGastos, vale,
} from '../../ui/gastos.ts';
import { actividades, filtrarActividades } from '../../ui/actividad.ts';
import {
  anularGasto, aplicar, estadoVacio, registrarGasto, type Ctx, type EstadoApp,
} from '../estado.ts';
import { idsSecuenciales } from '../semilla.ts';

const HOY = '2026-09-28T14:00:00.000Z';
const ctx = (p = 'g'): Ctx => ({ nuevoId: idsSecuenciales(p), ahora: () => HOY });

describe('cargar un gasto', () => {
  it('queda una fila, con lo que él puso', () => {
    const c = ctx();
    const e = aplicar(estadoVacio('n1', 'l1'), registrarGasto(estadoVacio('n1', 'l1'), {
      montoCent: pesos(15_000), categoria: 'combustible', medio: 'efectivo',
      nota: 'Nafta YPF viaje a Corrientes',
    }, c));

    expect(e.gastos).toHaveLength(1);
    const g = e.gastos[0]!;
    expect(g.montoCent).toBe(pesos(15_000));
    expect(g.categoria).toBe('combustible');
    expect(g.medio).toBe('efectivo');
    expect(g.nota).toBe('Nafta YPF viaje a Corrientes');
    expect(g.anuladaEn).toBeUndefined();
  });

  it('la nota es opcional, y una nota en blanco no se guarda', () => {
    /*
     * Obligarlo a escribir algo en cada carga rápida es la forma más segura de
     * que en un mes deje de cargar gastos. Un gasto sin nota vale infinitamente
     * más que un gasto que no se cargó.
     */
    const c = ctx();
    const e0 = estadoVacio('n1', 'l1');
    const sinNota = aplicar(e0, registrarGasto(e0, {
      montoCent: pesos(3000), categoria: 'empaque', medio: 'efectivo',
    }, c));
    const enBlanco = aplicar(e0, registrarGasto(e0, {
      montoCent: pesos(3000), categoria: 'empaque', medio: 'efectivo', nota: '   ',
    }, c));

    expect(sinNota.gastos[0]!.nota).toBeUndefined();
    expect(enBlanco.gastos[0]!.nota).toBeUndefined();
  });

  it('no se puede cargar un gasto de cero, ni de menos, ni de nada', () => {
    const c = ctx();
    const e = estadoVacio('n1', 'l1');
    const args = { categoria: 'flete' as const, medio: 'efectivo' as const };

    expect(() => registrarGasto(e, { ...args, montoCent: 0 }, c)).toThrow();
    expect(() => registrarGasto(e, { ...args, montoCent: -500 }, c)).toThrow();
    // `undefined <= 0` es false y habría pasado: es el agujero que tenía
    // `altaProducto` y que dejaba crear productos sin precio.
    expect(() => registrarGasto(e, { ...args, montoCent: undefined as unknown as number }, c)).toThrow();
    expect(() => registrarGasto(e, { ...args, montoCent: NaN }, c)).toThrow();
  });

  it('se puede cargar un gasto de ayer', () => {
    // Se acordó del ticket al otro día. Si la app lo obliga a ponerlo con la
    // fecha de hoy, el mes cierra mal.
    const c = ctx();
    const e0 = estadoVacio('n1', 'l1');
    const e = aplicar(e0, registrarGasto(e0, {
      montoCent: pesos(8000), categoria: 'flete', medio: 'efectivo',
      fecha: '2026-09-27T10:00:00.000Z',
    }, c));

    expect(e.gastos[0]!.fecha).toBe('2026-09-27T10:00:00.000Z');
  });
});

describe('anular un gasto', () => {
  const conGasto = () => {
    const c = ctx();
    const e0 = estadoVacio('n1', 'l1');
    const e = aplicar(e0, registrarGasto(e0, {
      montoCent: pesos(150_000), categoria: 'combustible', medio: 'efectivo', nota: 'Un cero de más',
    }, c));
    return { e, c, id: e.gastos[0]!.id };
  };

  it('la fila queda, marcada, y deja de costar', () => {
    const { e, c, id } = conGasto();
    expect(totalDeGastos(e.gastos)).toBe(pesos(150_000));

    const anulado = aplicar(e, anularGasto(e, id, c));
    expect(anulado.gastos).toHaveLength(1);          // no se borra
    expect(anulado.gastos[0]!.anuladaEn).toBe(HOY);
    expect(totalDeGastos(anulado.gastos)).toBe(0);   // no cuesta
    expect(vale(anulado.gastos[0]!)).toBe(false);
  });

  it('anular dos veces no mueve la fecha de anulación', () => {
    // Es la que ordena el bloque de anulados: si se moviera, un gasto anulado
    // hace dos semanas saltaría al principio por un reintento de la cola.
    const { e, c, id } = conGasto();
    const unaVez = aplicar(e, anularGasto(e, id, c));
    const otraVez = aplicar(unaVez, anularGasto(unaVez, id, {
      ...c, ahora: () => '2026-10-05T10:00:00.000Z',
    }));
    expect(otraVez.gastos[0]!.anuladaEn).toBe(HOY);
  });

  it('un gasto que no existe no se puede anular', () => {
    const { e, c } = conGasto();
    expect(() => anularGasto(e, 'no-existe', c)).toThrow();
  });
});

describe('el desglose por categoría', () => {
  const varios = () => {
    const c = ctx('v');
    let e: EstadoApp = estadoVacio('n1', 'l1');
    for (const [monto, cat] of [
      [60_000, 'combustible'], [20_000, 'combustible'],
      [40_000, 'flete'],
      [5000, 'empaque'],
    ] as const) {
      e = aplicar(e, registrarGasto(e, { montoCent: pesos(monto), categoria: cat, medio: 'efectivo' }, c));
    }
    return e;
  };

  it('suma por categoría y ordena de la que más se lleva a la que menos', () => {
    const d = porCategoria(varios().gastos);
    expect(d.map((x) => x.categoria.id)).toEqual(['combustible', 'flete', 'empaque']);
    expect(d[0]!.totalCent).toBe(pesos(80_000));
    expect(d[0]!.cuantos).toBe(2);
  });

  it('los porcentajes salen sobre el total', () => {
    const d = porCategoria(varios().gastos);
    expect(d[0]!.porcentaje).toBe(64);   // 80.000 de 125.000
    expect(d[1]!.porcentaje).toBe(32);   // 40.000
  });

  it('las categorías sin nada no aparecen', () => {
    // Una fila en cero no informa y empuja para abajo las que sí importan.
    expect(porCategoria(varios().gastos)).toHaveLength(3);
  });

  it('sin gastos no hay desglose ni división por cero', () => {
    expect(porCategoria([])).toEqual([]);
    expect(totalDeGastos([])).toBe(0);
  });

  it('lo anulado no entra en el desglose', () => {
    const c = ctx('a');
    let e = varios();
    e = aplicar(e, anularGasto(e, e.gastos[0]!.id, c));
    const d = porCategoria(e.gastos);
    expect(d[0]!.categoria.id).toBe('flete');       // combustible baja a 20.000
    expect(totalDeGastos(e.gastos)).toBe(pesos(65_000));
  });

  it('una categoría desconocida cae en "Otros" en vez de romper la pantalla', () => {
    // Puede llegar de un servidor más nuevo que este aparato.
    expect(categoria('lo-que-sea' as never).id).toBe('otros');
    expect(CATEGORIAS).toHaveLength(5);
  });
});

describe('el campo del importe', () => {
  it('solo dígitos y UNA coma', () => {
    expect(textoDeMonto('15000')).toBe('15000');
    expect(textoDeMonto('1500,50')).toBe('1500,50');
    // Un segundo separador no abre otro grupo: "12,50,30" son doce con cincuenta.
    expect(textoDeMonto('12,50,30')).toBe('12,50');
    expect(textoDeMonto('abc')).toBe('');
    expect(textoDeMonto('-500')).toBe('500');
    expect(textoDeMonto('5e3')).toBe('53');
  });

  it('el punto del teclado del teléfono se convierte en coma', () => {
    // En un teclado numérico de celular el separador que aparece es el punto, y
    // él escribe con coma. Sin esto, "1.500" se leería como mil quinientos.
    expect(textoDeMonto('1500.50')).toBe('1500,50');
  });

  it('dos decimales y ni uno más: son centavos', () => {
    expect(textoDeMonto('10,999')).toBe('10,99');
  });

  it('los ceros de adelante no cuentan', () => {
    expect(textoDeMonto('007')).toBe('7');
    expect(textoDeMonto('0')).toBe('0');
  });

  it('un importe absurdo se recorta', () => {
    expect(Number(textoDeMonto('999999999999'))).toBeLessThanOrEqual(MAX_PESOS);
  });

  it('convierte a centavos enteros, que es como se guarda toda la plata', () => {
    expect(centavosDeMonto('15000')).toBe(pesos(15_000));
    expect(centavosDeMonto('1500,50')).toBe(150_050);
    expect(centavosDeMonto('1500,5')).toBe(150_050);   // "5" son cincuenta centavos
    expect(centavosDeMonto('0,99')).toBe(99);
  });

  it('vacío es "todavía nada", no cero', () => {
    // Si vacío fuera cero, el botón de guardar se habilitaría con un gasto de $0.
    expect(centavosDeMonto('')).toBe(null);
    expect(centavosDeMonto(',')).toBe(null);
    expect(centavosDeMonto('0')).toBe(null);
  });
});

describe('el gasto en el feed de actividad', () => {
  const conTodo = () => {
    const c = ctx('f');
    let e: EstadoApp = estadoVacio('n1', 'l1');
    e = aplicar(e, registrarGasto(e, {
      montoCent: pesos(15_000), categoria: 'combustible', medio: 'efectivo',
      nota: 'Nafta YPF Corrientes',
    }, c));
    return e;
  };

  it('aparece como plata que SALE, con la nota adelante', () => {
    const a = actividades(conTodo())[0]!;
    expect(a.tipo).toBe('gasto');
    expect(a.direccion).toBe('sale');
    expect(a.conQuien).toBe('Nafta YPF Corrientes');
    expect(a.montoCent).toBe(pesos(15_000));
  });

  it('sin nota, manda la categoría', () => {
    const c = ctx('s');
    const e0 = estadoVacio('n1', 'l1');
    const e = aplicar(e0, registrarGasto(e0, {
      montoCent: pesos(4000), categoria: 'empaque', medio: 'efectivo',
    }, c));
    expect(actividades(e)[0]!.conQuien).toBe('Empaque');
  });

  it('tocarlo abre su ficha, que es de donde se anula', () => {
    const e = conTodo();
    expect(actividades(e)[0]!.destino).toEqual({ que: 'gasto', id: e.gastos[0]!.id });
  });

  it('la chapita "Gastos" lo aísla, y "Ventas" no lo muestra', () => {
    const feed = actividades(conTodo());
    expect(filtrarActividades(feed, 'gastos')).toHaveLength(1);
    expect(filtrarActividades(feed, 'ventas')).toHaveLength(0);
    expect(filtrarActividades(feed, 'ingresos')).toHaveLength(0);
  });

  it('anulado: la anulación es un hecho aparte, y el gasto queda tachado', () => {
    const c = ctx('x');
    let e = conTodo();
    e = aplicar(e, anularGasto(e, e.gastos[0]!.id, c));

    const feed = actividades(e);
    expect(feed).toHaveLength(2);
    expect(feed.find((x) => x.tipo === 'gasto')!.anulada).toBe(true);
    expect(feed.find((x) => x.tipo === 'gasto')!.direccion).toBe(null);
    expect(feed.find((x) => x.tipo === 'anulacion')!.detalle).toContain('Gasto del');
    // "Anulados" muestra las dos puntas: el gasto y su anulación.
    expect(filtrarActividades(feed, 'anulados')).toHaveLength(2);
    // Y "Gastos" ya no lo cuenta: no salió esa plata.
    expect(filtrarActividades(feed, 'gastos')).toHaveLength(0);
  });
});
