/**
 * Test de la descarga contra un servidor de mentira.
 *
 * El otro archivo prueba la conversión y la unión, que son funciones puras. Este
 * prueba la parte que de verdad habla por la red: qué URL se pide, qué
 * encabezados van, y sobre todo **la paginación**.
 *
 * La paginación es la razón principal de este archivo. PostgREST puede venir
 * configurado con un tope de mil filas por respuesta. Sin pedir de a páginas, el
 * día que `movimientos_stock` pase las mil filas la app bajaría las primeras mil
 * y no diría absolutamente nada: el stock quedaría mal y no habría ningún error
 * que mirar. Ese es el tipo de bug que no se encuentra probando a mano con cinco
 * productos cargados, así que se prueba acá.
 */

import { describe, expect, it } from 'vitest';
import { descargarEstado } from '../descarga.ts';

const NEGOCIO = '11111111-1111-1111-1111-111111111111';
const LISTA = '22222222-2222-2222-2222-222222222222';

/** Una sesión guardada y vigente, para que `tokenVigente()` devuelva el token. */
const conSesion = () => {
  const datos = new Map<string, string>([['pompi.sesion', JSON.stringify({
    accessToken: 'token-de-prueba',
    refreshToken: 'refresh',
    venceEn: Date.now() + 3_600_000,
    usuarioId: 'u1',
    email: 'chris@example.com',
  })]]);
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => datos.set(k, v),
    removeItem: (k: string) => datos.delete(k),
  };
};

interface Pedido { tabla: string; select: string | null; range: string | undefined }

/**
 * Un PostgREST de mentira que respeta el encabezado `Range`, como el de verdad.
 * `filas` dice qué devuelve cada tabla.
 */
const servidorFalso = (filas: Record<string, unknown[]>) => {
  const pedidos: Pedido[] = [];

  const fetchFalso = async (url: string, opciones: { headers: Record<string, string> }) => {
    const u = new URL(url, 'https://ejemplo.supabase.co');
    const tabla = u.pathname.replace('/rest/v1/', '');
    const rango = opciones.headers.Range;
    pedidos.push({ tabla, select: u.searchParams.get('select'), range: rango });

    const [desde, hasta] = (rango ?? '0-999').split('-').map(Number);
    const todas = filas[tabla] ?? [];
    const pagina = todas.slice(desde, hasta + 1);

    return {
      ok: true,
      status: 206,
      json: async () => pagina,
      text: async () => JSON.stringify(pagina),
    };
  };

  (globalThis as Record<string, unknown>).fetch = fetchFalso;
  return pedidos;
};

const base = () => ({
  negocios: [{ id: NEGOCIO, nombre: 'Pompi Mascotas' }],
  listas_precio: [{ id: LISTA, nombre: 'Mayorista', es_default: true }],
  parametros: [] as unknown[],
  productos: [] as unknown[],
  clientes: [] as unknown[],
  proveedores: [] as unknown[],
  precios_venta: [] as unknown[],
  movimientos_stock: [] as unknown[],
  compras: [] as unknown[],
  ventas: [] as unknown[],
  pagos_cliente: [] as unknown[],
  sugerencias_precio: [] as unknown[],
});

describe('la descarga contra el servidor', () => {
  it('pide las doce tablas y arma el estado', async () => {
    conSesion();
    const datos = base();
    datos.clientes = [{ id: 'c1', negocio_id: NEGOCIO, nombre: 'Huellitas', activo: true }];
    const pedidos = servidorFalso(datos);

    const r = await descargarEstado();

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.negocioId).toBe(NEGOCIO);
    expect(r.estado.clientes[0].nombre).toBe('Huellitas');

    const tablas = new Set(pedidos.map((p) => p.tabla));
    for (const t of Object.keys(datos)) expect(tablas.has(t)).toBe(true);
  });

  it('las compras y las ventas se piden con sus renglones adentro', async () => {
    conSesion();
    const pedidos = servidorFalso(base());
    await descargarEstado();

    expect(pedidos.find((p) => p.tabla === 'ventas')?.select).toBe('*,venta_items(*)');
    expect(pedidos.find((p) => p.tabla === 'compras')?.select).toBe('*,compra_items(*)');
  });

  it('baja TODAS las filas aunque el servidor corte de a mil', async () => {
    conSesion();
    const datos = base();
    // 2500 movimientos: tres páginas. Un año de trabajo real pasa esto de largo.
    datos.movimientos_stock = Array.from({ length: 2500 }, (_, i) => ({
      id: `m${i}`, negocio_id: NEGOCIO, producto_id: 'p1', ubicacion: 'deposito',
      cantidad: 1, tipo: 'compra', fecha: '2026-09-16T01:40:00+00:00',
    }));
    const pedidos = servidorFalso(datos);

    const r = await descargarEstado();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.movimientos).toHaveLength(2500);

    const rangos = pedidos.filter((p) => p.tabla === 'movimientos_stock').map((p) => p.range);
    expect(rangos).toEqual(['0-999', '1000-1999', '2000-2999']);
  });

  it('una tabla que entra justo en una página no pide una página de más', async () => {
    conSesion();
    const datos = base();
    datos.clientes = Array.from({ length: 1000 }, (_, i) => ({
      id: `c${i}`, negocio_id: NEGOCIO, nombre: `Comercio ${i}`, activo: true,
    }));
    const pedidos = servidorFalso(datos);

    const r = await descargarEstado();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.clientes).toHaveLength(1000);
    // Mil justas: hay que preguntar de nuevo, porque desde acá no se distingue
    // "mil y se acabó" de "mil y hay más". La segunda vuelve vacía y ahí corta.
    expect(pedidos.filter((p) => p.tabla === 'clientes')).toHaveLength(2);
  });

  it('el token de la sesión viaja en Authorization, no la clave del proyecto', async () => {
    conSesion();
    let cabeceras: Record<string, string> = {};
    (globalThis as Record<string, unknown>).fetch = async (
      _u: string, o: { headers: Record<string, string> },
    ) => {
      cabeceras = o.headers;
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
    };

    await descargarEstado();
    // Es lo que hace que RLS sepa QUIÉN pregunta. Con la clave anon acá, el
    // servidor no lo reconoce y devuelve cero filas: una app vacía sin error.
    expect(cabeceras.Authorization).toBe('Bearer token-de-prueba');
  });

  it('sin negocio avisa, en vez de mostrar una app vacía', async () => {
    conSesion();
    const datos = base();
    datos.negocios = [];
    servidorFalso(datos);

    const r = await descargarEstado();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('sin-negocio');
  });

  it('si la red falla lo dice como falta de señal, no como cuenta vacía', async () => {
    conSesion();
    (globalThis as Record<string, unknown>).fetch = async () => {
      throw new Error('Failed to fetch');
    };

    const r = await descargarEstado();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('sin-senal');
  });
});
