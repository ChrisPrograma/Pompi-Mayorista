/**
 * Tests del feed de actividad.
 *
 * Lo que se prueba acá es que la tira de movimientos diga la verdad: que el
 * orden sea el de los hechos —no el del arreglo que los contiene—, que una
 * anulación aparezca el día que se anuló y no el día de la venta, que filtrar
 * por "Ventas" no devuelva ventas anuladas, y que agrupar por día no parta un
 * día en dos encabezados.
 *
 * El inicio muestra solo tres de estas filas. Si el orden está mal, las tres que
 * ve son las equivocadas.
 */

import { describe, expect, it } from 'vitest';
import { pesos } from '../../domain/money.ts';
import {
  EN_EL_INICIO, POR_PAGINA_ACTIVIDAD, actividades, agruparPorDia, buscarActividades,
  filtrarActividades, momentoDe,
} from '../../ui/actividad.ts';
import { cuantasPaginas, paginaDe } from '../../ui/paginado.ts';
import {
  altaCliente, altaProducto, altaProveedor, anularCompra, anularVenta, aplicar, cobrar,
  entrarMercaderia, estadoVacio, vender, type Ctx, type EstadoApp,
} from '../estado.ts';
import { idsSecuenciales } from '../semilla.ts';

/** Un contexto con reloj movible: cada hecho se registra cuando corresponde. */
const reloj = (prefijo: string) => {
  let ahora = '2026-09-20T13:00:00.000Z';
  const ctx: Ctx = { nuevoId: idsSecuenciales(prefijo), ahora: () => ahora };
  return { ctx, en: (iso: string) => { ahora = iso; } };
};

/** Un comercio, un proveedor y dos productos. */
const armar = () => {
  const { ctx, en } = reloj('a');
  let e: EstadoApp = estadoVacio('n1', 'l1');
  e = aplicar(e, altaCliente(e, { nombre: 'Veterinaria del Norte' }, ctx));
  e = aplicar(e, altaCliente(e, { nombre: 'Pet Shop Huellitas' }, ctx));
  e = aplicar(e, altaProveedor(e, { nombre: 'Distribuidora Once' }, ctx));
  e = aplicar(e, altaProducto(e, { nombre: 'Pretal Plateado', precioCent: pesos(6500) }, ctx));
  return {
    ctx, en, e,
    norte: e.clientes[0]!.id,
    huellitas: e.clientes[1]!.id,
    once: e.proveedores[0]!.id,
    pretal: e.productos[0]!.id,
  };
};

// ---------------------------------------------------------------------------

describe('el feed junta todo en una sola tira', () => {
  it('mezcla ventas, cobros e ingresos en orden, del más nuevo al más viejo', () => {
    const a = armar();
    let { e } = a;

    a.en('2026-09-22T11:00:00.000Z');
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId: a.once,
      items: [{ productoId: a.pretal, cantidad: 10, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'contado',
    }, a.ctx));

    a.en('2026-09-22T14:00:00.000Z');
    e = aplicar(e, vender(e, {
      clienteId: a.norte, items: [{ productoId: a.pretal, cantidad: 2 }],
      formaPago: 'cuenta', cobradoCent: 0,
    }, a.ctx));

    a.en('2026-09-22T17:00:00.000Z');
    e = aplicar(e, cobrar(e, { clienteId: a.norte, montoCent: pesos(13_000), medio: 'efectivo' }, a.ctx));

    const feed = actividades(e);
    expect(feed.map((x) => x.tipo)).toEqual(['cobro', 'venta', 'ingreso']);
    expect(feed.map((x) => x.conQuien)).toEqual([
      'Veterinaria del Norte', 'Veterinaria del Norte', 'Distribuidora Once',
    ]);
  });

  it('la plata va marcada para dónde: lo que entra y lo que sale', () => {
    /*
     * Un ingreso de mercadería es plata que SALE. En los tres bloques viejos eso
     * se leía por el título de la sección; en una tira sola, si no lo dice la
     * fila, las dos cosas se ven iguales.
     */
    const a = armar();
    let { e } = a;

    e = aplicar(e, entrarMercaderia(e, {
      proveedorId: a.once,
      items: [{ productoId: a.pretal, cantidad: 10, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'contado',
    }, a.ctx));
    a.en('2026-09-20T15:00:00.000Z');
    e = aplicar(e, vender(e, {
      clienteId: a.norte, items: [{ productoId: a.pretal, cantidad: 2 }],
      formaPago: 'efectivo', cobradoCent: pesos(13_000),
    }, a.ctx));

    const feed = actividades(e);
    expect(feed[0]!.direccion).toBe('entra');   // la venta
    expect(feed[1]!.direccion).toBe('sale');    // el ingreso
  });

  it('el cobro dice de qué comercio vino y por qué medio', () => {
    const a = armar();
    let e = aplicar(a.e, cobrar(a.e, {
      clienteId: a.huellitas, montoCent: pesos(5000), medio: 'transferencia',
    }, a.ctx));

    const cobro = actividades(e)[0]!;
    expect(cobro.conQuien).toBe('Pet Shop Huellitas');
    expect(cobro.detalle).toBe('Te pagó una deuda');
    expect(cobro.estado).toBe('transferencia');
    expect(cobro.montoCent).toBe(pesos(5000));
  });

  it('el inicio se queda con las tres más nuevas', () => {
    const a = armar();
    let { e } = a;
    for (let i = 0; i < 6; i++) {
      a.en(`2026-09-2${i}T12:00:00.000Z`);
      e = aplicar(e, cobrar(e, { clienteId: a.norte, montoCent: pesos(1000 + i), medio: 'efectivo' }, a.ctx));
    }

    const primeras = actividades(e).slice(0, EN_EL_INICIO);
    expect(primeras).toHaveLength(3);
    // Las de los días 25, 24 y 23: las últimas tres que hizo.
    expect(primeras.map((x) => x.montoCent)).toEqual([pesos(1005), pesos(1004), pesos(1003)]);
  });

  it('dos hechos del mismo segundo salen siempre en el mismo orden', () => {
    /*
     * Sin desempate, el orden lo decide cómo quedó el arreglo y la lista se
     * reacomoda sola entre un dibujado y el siguiente. Con dos comercios
     * cobrando en el mismo instante, el orden tiene que ser estable.
     */
    const a = armar();
    let { e } = a;
    e = aplicar(e, cobrar(e, { clienteId: a.norte, montoCent: pesos(100), medio: 'efectivo' }, a.ctx));
    e = aplicar(e, cobrar(e, { clienteId: a.huellitas, montoCent: pesos(200), medio: 'efectivo' }, a.ctx));

    const unaVez = actividades(e).map((x) => x.clave);
    const otraVez = actividades(e).map((x) => x.clave);
    expect(unaVez).toEqual(otraVez);
  });
});

// ---------------------------------------------------------------------------

describe('una anulación es un hecho aparte, con su propia fecha', () => {
  /** Vende el 21 y anula el 24. */
  const ventaAnulada = () => {
    const a = armar();
    let { e } = a;
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId: a.once,
      items: [{ productoId: a.pretal, cantidad: 10, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'contado',
    }, a.ctx));

    a.en('2026-09-21T14:00:00.000Z');
    e = aplicar(e, vender(e, {
      clienteId: a.norte, items: [{ productoId: a.pretal, cantidad: 2 }],
      formaPago: 'efectivo', cobradoCent: pesos(13_000),
    }, a.ctx));
    const ventaId = e.ventas[0]!.id;

    a.en('2026-09-24T10:00:00.000Z');
    e = aplicar(e, anularVenta(e, ventaId, a.ctx));
    return { e, ventaId };
  };

  it('la venta queda el día que se vendió y la anulación el día que se anuló', () => {
    const { e, ventaId } = ventaAnulada();
    const feed = actividades(e);

    const anulacion = feed.find((x) => x.tipo === 'anulacion')!;
    const venta = feed.find((x) => x.tipo === 'venta')!;

    expect(anulacion.cuando).toBe('2026-09-24T10:00:00.000Z');
    expect(venta.cuando).toBe('2026-09-21T14:00:00.000Z');
    // Y la anulación va primero, porque es más reciente.
    expect(feed.indexOf(anulacion)).toBeLessThan(feed.indexOf(venta));
    // Las dos abren la misma venta: es el mismo comprobante.
    expect(anulacion.destino).toEqual({ que: 'venta', id: ventaId });
    expect(venta.destino).toEqual({ que: 'venta', id: ventaId });
  });

  it('las dos filas tienen claves distintas, aunque salgan de la misma venta', () => {
    // Si compartieran clave, React dibujaría cualquiera de las dos en los dos
    // lugares.
    const { e } = ventaAnulada();
    const claves = actividades(e).map((x) => x.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('la venta anulada queda marcada y sin dirección: no entró esa plata', () => {
    const { e } = ventaAnulada();
    const venta = actividades(e).find((x) => x.tipo === 'venta')!;
    expect(venta.anulada).toBe(true);
    expect(venta.direccion).toBe(null);
    expect(venta.estado).toBe('anulada');
  });

  it('la anulación dice de qué día era lo que se anuló', () => {
    const { e } = ventaAnulada();
    const anulacion = actividades(e).find((x) => x.tipo === 'anulacion')!;
    expect(anulacion.detalle).toContain('21/09');
    expect(anulacion.estado).toBe('se anuló');
  });

  it('un ingreso anulado hace lo mismo, y abre el ingreso', () => {
    const a = armar();
    let { e } = a;
    a.en('2026-09-21T09:00:00.000Z');
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId: a.once,
      items: [{ productoId: a.pretal, cantidad: 10, costoUnitarioCent: pesos(4000) }],
      condicionPago: 'contado',
    }, a.ctx));
    const compraId = e.compras[0]!.id;

    a.en('2026-09-23T16:00:00.000Z');
    e = aplicar(e, anularCompra(e, compraId, a.ctx));

    const feed = actividades(e);
    const anulacion = feed.find((x) => x.tipo === 'anulacion')!;
    expect(anulacion.destino).toEqual({ que: 'ingreso', id: compraId });
    expect(anulacion.cuando).toBe('2026-09-23T16:00:00.000Z');
    expect(feed.find((x) => x.tipo === 'ingreso')!.anulada).toBe(true);
  });
});

// ---------------------------------------------------------------------------

/** Una venta viva, una anulada, un cobro y un ingreso. */
const conDeTodo = () => {
  const a = armar();
  let { e } = a;

  e = aplicar(e, entrarMercaderia(e, {
    proveedorId: a.once,
    items: [{ productoId: a.pretal, cantidad: 20, costoUnitarioCent: pesos(4000) }],
    condicionPago: 'contado',
  }, a.ctx));

  a.en('2026-09-21T14:00:00.000Z');
  e = aplicar(e, vender(e, {
    clienteId: a.norte, items: [{ productoId: a.pretal, cantidad: 2 }],
    formaPago: 'efectivo', cobradoCent: pesos(13_000),
  }, a.ctx));

  a.en('2026-09-22T14:00:00.000Z');
  e = aplicar(e, vender(e, {
    clienteId: a.huellitas, items: [{ productoId: a.pretal, cantidad: 3 }],
    formaPago: 'efectivo', cobradoCent: pesos(19_500),
  }, a.ctx));
  const aAnular = e.ventas[1]!.id;

  a.en('2026-09-23T09:00:00.000Z');
  e = aplicar(e, cobrar(e, { clienteId: a.norte, montoCent: pesos(5000), medio: 'efectivo' }, a.ctx));

  a.en('2026-09-24T10:00:00.000Z');
  e = aplicar(e, anularVenta(e, aAnular, a.ctx));

  return { e, feed: actividades(e) };
};

describe('el filtro por tipo', () => {
  it('"Todos" no esconde nada', () => {
    const { feed } = conDeTodo();
    // venta viva + venta anulada + su anulación + cobro + ingreso
    expect(filtrarActividades(feed, 'todos')).toHaveLength(5);
  });

  it('"Ventas" deja solo las ventas que valen — las anuladas no se vendieron', () => {
    const { feed } = conDeTodo();
    const ventas = filtrarActividades(feed, 'ventas');
    expect(ventas).toHaveLength(1);
    expect(ventas[0]!.conQuien).toBe('Veterinaria del Norte');
    expect(ventas.every((x) => !x.anulada)).toBe(true);
  });

  it('"Cobros" e "Ingresos" hacen lo suyo y nada más', () => {
    const { feed } = conDeTodo();
    expect(filtrarActividades(feed, 'cobros').map((x) => x.tipo)).toEqual(['cobro']);
    expect(filtrarActividades(feed, 'ingresos').map((x) => x.tipo)).toEqual(['ingreso']);
  });

  it('"Anulados" muestra el lío completo: la anulación Y la venta que quedó anulada', () => {
    /*
     * A medias no sirve: si toca "Anulados" es porque quiere revisar qué
     * deshizo, y para eso necesita ver las dos puntas.
     */
    const { feed } = conDeTodo();
    const anulados = filtrarActividades(feed, 'anulados');
    expect(anulados).toHaveLength(2);
    expect(anulados.map((x) => x.tipo).sort()).toEqual(['anulacion', 'venta']);
    expect(anulados.every((x) => x.anulada)).toBe(true);
  });

  it('filtrar no reordena', () => {
    const { feed } = conDeTodo();
    const filtrado = filtrarActividades(feed, 'todos');
    expect(filtrado.map((x) => x.cuando)).toEqual(feed.map((x) => x.cuando));
  });
});

describe('el buscador del historial', () => {
  it('encuentra por comercio, sin acentos y por pedacito', () => {
    const { feed } = conDeTodo();
    expect(buscarActividades(feed, 'huel').every((x) => x.conQuien === 'Pet Shop Huellitas')).toBe(true);
    expect(buscarActividades(feed, 'huel')).toHaveLength(2);   // la venta anulada y su anulación
  });

  it('encuentra por proveedor', () => {
    const { feed } = conDeTodo();
    const r = buscarActividades(feed, 'once');
    expect(r).toHaveLength(1);
    expect(r[0]!.tipo).toBe('ingreso');
  });

  it('sin texto devuelve todo', () => {
    const { feed } = conDeTodo();
    expect(buscarActividades(feed, '   ')).toHaveLength(feed.length);
  });

  it('lo que no está no aparece', () => {
    const { feed } = conDeTodo();
    expect(buscarActividades(feed, 'zzzz')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('agrupado por día', () => {
  const etiquetar = (iso: string) => `día ${iso.slice(8, 10)}`;

  it('arma un grupo por día, en el orden en que venía', () => {
    const { feed } = conDeTodo();
    const grupos = agruparPorDia(feed, '2026-09-24T18:00:00.000Z', etiquetar);
    expect(grupos.map((g) => g.dia)).toEqual([
      '2026-09-24', '2026-09-23', '2026-09-22', '2026-09-21', '2026-09-20',
    ]);
    expect(grupos.reduce((a, g) => a + g.items.length, 0)).toBe(feed.length);
  });

  it('el día de hoy dice "Hoy" y el anterior "Ayer"', () => {
    const { feed } = conDeTodo();
    const grupos = agruparPorDia(feed, '2026-09-24T18:00:00.000Z', etiquetar);
    expect(grupos[0]!.etiqueta).toBe('Hoy');
    expect(grupos[1]!.etiqueta).toBe('Ayer');
    expect(grupos[2]!.etiqueta).toBe('día 22');
  });

  it('dos hechos del mismo día van al MISMO grupo, no a dos', () => {
    // Un encabezado repetido es la forma más fácil de que esto se vea roto.
    const a = armar();
    let { e } = a;
    a.en('2026-09-22T09:00:00.000Z');
    e = aplicar(e, cobrar(e, { clienteId: a.norte, montoCent: pesos(100), medio: 'efectivo' }, a.ctx));
    a.en('2026-09-22T19:00:00.000Z');
    e = aplicar(e, cobrar(e, { clienteId: a.norte, montoCent: pesos(200), medio: 'efectivo' }, a.ctx));

    const grupos = agruparPorDia(actividades(e), '2026-09-22T20:00:00.000Z', etiquetar);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.items).toHaveLength(2);
  });

  it('el día es el de acá, no el de UTC', () => {
    /*
     * A las 22 de Argentina ya es el día siguiente en UTC. Si el grupo se armara
     * con el texto ISO crudo, una venta de las 22 aparecería bajo la fecha de
     * mañana — y "Hoy" saldría vacío mientras él todavía está vendiendo.
     */
    const a = armar();
    a.en('2026-09-23T01:30:00.000Z');   // 22:30 del 22 en Buenos Aires
    const e = aplicar(a.e, cobrar(a.e, {
      clienteId: a.norte, montoCent: pesos(100), medio: 'efectivo',
    }, a.ctx));

    const grupos = agruparPorDia(actividades(e), '2026-09-23T02:00:00.000Z', etiquetar);
    expect(grupos[0]!.dia).toBe('2026-09-22');
    expect(grupos[0]!.etiqueta).toBe('Hoy');
  });

  it('una lista vacía no arma grupos', () => {
    expect(agruparPorDia([], '2026-09-24T18:00:00.000Z', etiquetar)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('cuándo pasó, en el inicio', () => {
  it('si es de hoy va la hora sola', () => {
    const a = armar();
    a.en('2026-09-24T17:30:00.000Z');   // 14:30 en Buenos Aires
    const e = aplicar(a.e, cobrar(a.e, {
      clienteId: a.norte, montoCent: pesos(100), medio: 'efectivo',
    }, a.ctx));

    expect(momentoDe(actividades(e)[0]!, '2026-09-24T20:00:00.000Z')).toBe('14:30');
  });

  it('si es de otro día va el día adelante: tres filas sueltas no ubican nada', () => {
    /*
     * El inicio muestra las tres últimas actividades y NO las agrupa por día.
     * Sin la fecha, una venta de la semana pasada se lee como de hoy.
     */
    const a = armar();
    a.en('2026-09-21T17:30:00.000Z');
    const e = aplicar(a.e, cobrar(a.e, {
      clienteId: a.norte, montoCent: pesos(100), medio: 'efectivo',
    }, a.ctx));

    expect(momentoDe(actividades(e)[0]!, '2026-09-24T20:00:00.000Z')).toBe('21/09 14:30');
  });
});

describe('paginado del historial', () => {
  const etiquetar = (iso: string) => `día ${iso.slice(8, 10)}`;

  /** 25 cobros repartidos en cinco días. */
  const muchos = () => {
    const a = armar();
    let { e } = a;
    for (let d = 20; d < 25; d++) {
      for (let h = 9; h < 14; h++) {
        a.en(`2026-09-${d}T${String(h).padStart(2, '0')}:00:00.000Z`);
        e = aplicar(e, cobrar(e, { clienteId: a.norte, montoCent: pesos(100), medio: 'efectivo' }, a.ctx));
      }
    }
    return actividades(e);
  };

  it('la primera página trae 20 y la segunda el resto', () => {
    const feed = muchos();
    expect(feed).toHaveLength(25);
    expect(paginaDe(feed, 0, POR_PAGINA_ACTIVIDAD)).toHaveLength(20);
    expect(paginaDe(feed, 1, POR_PAGINA_ACTIVIDAD)).toHaveLength(5);
    expect(cuantasPaginas(feed.length, POR_PAGINA_ACTIVIDAD)).toBe(2);
  });

  it('ninguna página queda con un encabezado de día sin filas debajo', () => {
    /*
     * Es lo que pasaría agrupando ANTES de paginar: el corte de página cae en el
     * medio de un día y el encabezado se queda arriba, solo.
     */
    const feed = muchos();
    for (const p of [0, 1]) {
      const grupos = agruparPorDia(paginaDe(feed, p, POR_PAGINA_ACTIVIDAD), '2026-09-25T20:00:00.000Z', etiquetar);
      expect(grupos.every((g) => g.items.length > 0)).toBe(true);
    }
  });

  it('las dos páginas juntas son el feed entero, sin repetir ni perder nada', () => {
    const feed = muchos();
    const juntas = [...paginaDe(feed, 0, POR_PAGINA_ACTIVIDAD), ...paginaDe(feed, 1, POR_PAGINA_ACTIVIDAD)];
    expect(juntas.map((x) => x.clave)).toEqual(feed.map((x) => x.clave));
  });
});
