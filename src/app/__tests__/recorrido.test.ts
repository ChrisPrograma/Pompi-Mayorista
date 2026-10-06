/**
 * Tests del recorrido guiado y de la puerta al comprobante.
 *
 * El recorrido es la primera pantalla que toca alguien que no sabe usar la app,
 * y es el que más fácil se desactualiza: nadie lo abre trabajando, así que puede
 * quedar meses describiendo funciones que ya no existen. Eso ya pasó una vez —
 * hablaba de "tres pasos" cuando hacía rato eran dos y del stock del auto
 * después de que se sacó—, y lo que sigue son los guardas para que no vuelva a
 * pasar en silencio.
 */

import { describe, expect, it } from 'vitest';
import { ANCLAS, RECORRIDO, SIN_PASO_PROPIO, tour } from '../../ui/recorrido.ts';
/*
 * La lista de verdad, importada — no copiada. Copiada, agregar una pantalla y
 * olvidarse de actualizarla deja este test pasando mientras miente.
 */
import { RUTAS } from '../../ui/rutas.ts';
import { ventasDelCliente } from '../../ui/vistas.ts';
import { estadoVacio, type EstadoApp } from '../estado.ts';
import { pesos, type Cent } from '../../domain/money.ts';
import type { Venta } from '../../domain/types.ts';


describe('el recorrido apunta a cosas que existen', () => {
  it('cada paso que destaca algo apunta a un ancla declarada', () => {
    /*
     * El trabajo pesado lo hace el TIPO: `destaca` es `Ancla`, y las pantallas
     * marcan con `tour('...')`, que recibe lo mismo. Un nombre mal escrito o una
     * marca borrada de una pantalla no compilan, así que este test es el cinturón
     * y el tipo son los tiradores.
     *
     * La versión anterior de este test leía los archivos de las pantallas con
     * `node:fs`. Andaba, pero metía Node en el chequeo de tipos de una app de
     * navegador y tiró abajo el deploy: el `tsc` de Vercel no tiene esos tipos.
     */
    const faltantes = RECORRIDO
      .map((p) => p.destaca)
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .filter((m) => !ANCLAS.includes(m));

    expect(faltantes).toEqual([]);
  });

  it('tour() produce el atributo que el recorrido busca en el DOM', () => {
    expect(tour('resumen')).toEqual({ 'data-tour': 'resumen' });
  });

  it('todos los pasos van a una pantalla que existe', () => {
    for (const p of RECORRIDO) expect(RUTAS).toContain(p.ruta);
  });

  it('ningún paso quedó sin título o sin texto', () => {
    for (const p of RECORRIDO) {
      expect(p.titulo.trim().length).toBeGreaterThan(0);
      expect(p.texto.trim().length).toBeGreaterThan(0);
    }
  });

  it('no habla de funciones que ya no están', () => {
    /*
     * El auto se fue en la 009 y "tres pasos" pasó a dos. Si alguna de esas dos
     * palabras vuelve a aparecer, es que se copió texto viejo.
     */
    const todo = RECORRIDO.map((p) => `${p.titulo} ${p.texto}`).join(' ').toLowerCase();
    expect(todo).not.toContain('auto');
    expect(todo).not.toContain('tres pasos');
    expect(todo).not.toContain('vehículo');
  });

  it('nombra las funciones que sí están', () => {
    /*
     * Una palabra por función que el cliente usa. No es un adorno: si alguien
     * saca una función y se olvida del recorrido, o al revés —agrega una y no la
     * cuenta—, esta lista es lo que lo pone en rojo.
     *
     * Se actualiza en el mismo lote que la función. Agregar acá una palabra de
     * algo que todavía no existe es tan malo como no agregarla cuando existe.
     */
    const todo = RECORRIDO.map((p) => `${p.titulo} ${p.texto}`).join(' ').toLowerCase();
    for (const palabra of [
      'comprobante',   // mandar el recibo por WhatsApp
      'anula',         // anular una venta o una entrada
      'corregir',      // corregir una entrada o un costo
      'parte',         // el cobro parcial
      'gasto',         // los gastos operativos
      'excel',         // exportar la planilla y los reportes
      'caja',          // la caja real, en Números
      'buscá',         // el buscador del pedido y de las listas
      'stock',         // el stock al lado de cada producto
      'sin señal',     // que funciona sin conexión
    ]) {
      expect(todo).toContain(palabra);
    }
  });

  it('cada pantalla está en el recorrido o exenta a propósito', () => {
    /*
     * EL GUARDA QUE PIDIÓ MACLARENS EL 01/10.
     *
     * Agregar una pantalla nueva y olvidarse del recorrido deja al cliente con
     * una función que no sabe que existe. Acá no se puede: o la pantalla tiene
     * un paso, o está declarada en `SIN_PASO_PROPIO` con el motivo escrito al
     * lado. Las dos salidas son válidas; lo que no es válido es no decidir.
     *
     * Lo que este test NO puede atrapar es una función nueva adentro de una
     * pantalla que ya tenía paso. Para eso está la regla 5 del encabezado de
     * `recorrido.ts` y la lista de palabras del test de arriba.
     */
    const visitadas = new Set(RECORRIDO.map((p) => p.ruta));
    const sinDecidir = RUTAS.filter(
      (r) => !visitadas.has(r) && !SIN_PASO_PROPIO.includes(r),
    );

    expect(sinDecidir).toEqual([]);
  });

  it('nadie quedó exento de más', () => {
    // Una pantalla exenta que además tiene paso es una lista que se despegó.
    const visitadas = new Set(RECORRIDO.map((p) => p.ruta));
    expect(SIN_PASO_PROPIO.filter((r) => visitadas.has(r))).toEqual([]);
  });

  it('todas las anclas declaradas se usan', () => {
    /*
     * Un ancla existe para que un paso la señale. Una declarada y nunca usada es
     * una marca puesta en una pantalla para un paso que después se borró, o —lo
     * que pasó con el capital y las dos salidas de Mis productos— una parte de
     * la app que el recorrido nunca llegó a contar.
     */
    const usadas = new Set(RECORRIDO.map((p) => p.destaca).filter(Boolean));
    expect(ANCLAS.filter((a) => !usadas.has(a))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

/**
 * Las ventas se arman a mano, como en `caballito.test.ts`: `ventasDelCliente`
 * solo mira `e.ventas`, y construirlas con el flujo real obligaría a cargar
 * producto, precio y stock para probar un orden y una resta.
 */
const venta = (
  id: string,
  clienteId: string,
  fecha: string,
  totalCent: Cent,
  cobradoCent: Cent,
  unidades: number,
  anuladaEn?: string,
): Venta => ({
  id,
  negocioId: 'n1',
  clienteId,
  fecha,
  totalCent,
  cobradoCent,
  formaPago: cobradoCent > 0 ? 'efectivo' : 'cuenta',
  items: [{
    id: `${id}-1`,
    ventaId: id,
    productoId: 'p1',
    cantidad: unidades,
    precioUnitarioCent: pesos(100),
    costoUnitarioCent: pesos(50),
  }],
  ...(anuladaEn ? { anuladaEn } : {}),
});

const con = (...ventas: Venta[]): EstadoApp => ({ ...estadoVacio('n1', 'l1'), ventas });

describe('las ventas de un comercio, para llegar al comprobante', () => {
  it('trae las suyas y no las de otro', () => {
    const e = con(
      venta('v1', 'c1', '2026-09-20T15:00:00.000Z', pesos(13000), pesos(13000), 2),
      venta('v2', 'c2', '2026-09-20T16:00:00.000Z', pesos(6500), pesos(6500), 1),
    );
    const suyas = ventasDelCliente(e, 'c1');
    expect(suyas).toHaveLength(1);
    expect(suyas[0]!.unidades).toBe(2);
  });

  it('la más nueva va primero', () => {
    const e = con(
      venta('vieja', 'c1', '2026-09-18T15:00:00.000Z', pesos(6500), 0, 1),
      venta('nueva', 'c1', '2026-09-20T15:00:00.000Z', pesos(19500), 0, 3),
    );
    expect(ventasDelCliente(e, 'c1').map((x) => x.id)).toEqual(['nueva', 'vieja']);
  });

  it('dice cuánto falta cobrar de cada una', () => {
    // Pago parcial: vendió 6.500 y le entregaron 4.000.
    const e = con(venta('v1', 'c1', '2026-09-20T15:00:00.000Z', pesos(6500), pesos(4000), 1));
    expect(ventasDelCliente(e, 'c1')[0]!.debeCent).toBe(pesos(2500));
  });

  it('una venta anulada se ve, marcada, y ya no debe nada', () => {
    /*
     * Se ve porque él tiene que poder revisar qué anuló. Y no debe nada porque
     * el sistema ya no se lo reclama: mostrar su saldo sería decir que ese
     * comercio debe una plata que nadie le va a cobrar. El detalle de la venta
     * es el que además decide no ofrecer el comprobante de una anulada.
     */
    const e = con(venta('v1', 'c1', '2026-09-20T15:00:00.000Z', pesos(6500), 0, 1, '2026-09-20T18:00:00.000Z'));
    const [x] = ventasDelCliente(e, 'c1');
    expect(x!.anulada).toBe(true);
    expect(x!.debeCent).toBe(0);
  });

  it('no trae más de las que se le piden', () => {
    const e = con(...Array.from({ length: 8 }, (_, i) =>
      venta(`v${i}`, 'c1', `2026-09-${10 + i}T15:00:00.000Z`, pesos(6500), pesos(6500), 1)));
    expect(ventasDelCliente(e, 'c1')).toHaveLength(6);
    expect(ventasDelCliente(e, 'c1', 3)).toHaveLength(3);
  });

  it('la fecha que muestra es la de acá, no la de UTC', () => {
    // 21:30 del sábado 19 en Buenos Aires, que en UTC ya es el domingo 20.
    const e = con(venta('v1', 'c1', '2026-09-20T00:30:00.000Z', pesos(6500), pesos(6500), 1));
    expect(ventasDelCliente(e, 'c1')[0]!.cuando).toBe('19/09 · 21:30');
  });
});
