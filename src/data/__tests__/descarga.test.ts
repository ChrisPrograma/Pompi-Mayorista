/**
 * Tests de la descarga inicial.
 *
 * No prueban que "baje bien": prueban que **bajar no rompa ni borre nada** de lo
 * que hay en el dispositivo. Los cuatro casos del medio son situaciones reales de
 * la calle — carga sin señal, edición sin subir, precio recién cambiado, compra
 * recién entrada — donde una unión ingenua le haría desaparecer trabajo hecho.
 */

import { describe, expect, it } from 'vitest';
import { armarEstado, iso, unir, type FilasServidor } from '../descarga.ts';
import { PARAMETROS_DEFAULT, type EstadoApp } from '../../app/estado.ts';
import type { PrecioVenta, SugerenciaPrecio } from '../../domain/types.ts';

const NEGOCIO = '11111111-1111-1111-1111-111111111111';
const LISTA = '22222222-2222-2222-2222-222222222222';

const vacias = (): FilasServidor => ({
  negocios: [{ id: NEGOCIO, nombre: 'Pompi Mascotas' }],
  listas: [{ id: LISTA, nombre: 'Mayorista', es_default: true }],
  parametros: [],
  productos: [], clientes: [], proveedores: [], precios: [],
  movimientos: [], compras: [], ventas: [], pagos: [], sugerencias: [],
});

const estadoVacio = (): EstadoApp => ({
  negocioId: NEGOCIO, listaId: LISTA,
  productos: [], clientes: [], proveedores: [], precios: [],
  movimientos: [], compras: [], ventas: [], pagos: [], sugerencias: [],
  parametros: PARAMETROS_DEFAULT,
});

const precio = (p: Partial<PrecioVenta> & { id: string }): PrecioVenta => ({
  productoId: 'prod', listaId: LISTA, precioCent: 100_000,
  vigenteDesde: '2026-09-01T10:00:00.000Z', vigenteHasta: null, origen: 'manual', ...p,
});

const sugerencia = (s: Partial<SugerenciaPrecio> & { id: string }): SugerenciaPrecio => ({
  productoId: 'prod', listaId: LISTA,
  costoAnteriorCent: 50_000, costoNuevoCent: 60_000,
  precioVigenteCent: 100_000, precioSugeridoCent: 120_000,
  baseCalculo: 'margen', estado: 'pendiente', creadaEn: '2026-09-10T10:00:00.000Z', ...s,
});

// ---------------------------------------------------------------------------

describe('fechas del servidor', () => {
  it('se normalizan al mismo formato que genera el dispositivo', () => {
    // Toda la app ordena fechas comparando textos. Mezclar "+00:00" con "Z"
    // invierte el orden de dos filas del mismo segundo, y de ahí sale un costo
    // mal tomado sin ningún error a la vista.
    expect(iso('2026-09-16T01:40:00+00:00')).toBe('2026-09-16T01:40:00.000Z');
    expect(iso('2026-09-15T22:40:00-03:00')).toBe('2026-09-16T01:40:00.000Z');
  });

  it('una fecha sin hora se deja como está', () => {
    // `fecha_acreditacion` es un `date`. Pasarla por toISOString la correría un día.
    expect(iso('2026-09-16')).toBe('2026-09-16');
  });

  it('el orden entre una fecha del servidor y una del dispositivo queda bien', () => {
    const delServidor = iso('2026-09-16T01:40:00+00:00');
    const delAparato = '2026-09-16T01:40:00.500Z';
    expect(delServidor < delAparato).toBe(true);   // sin normalizar daba al revés
  });
});

describe('armar el estado con lo que bajó', () => {
  it('convierte nombres de columna y arma las ventas con sus renglones', () => {
    const f = vacias();
    f.productos = [{
      id: 'p1', negocio_id: NEGOCIO, nombre: 'Collar', variante: null,
      categoria: 'accesorios', proveedor_id: null, unidad: 'unidad',
      sugerido_en_vehiculo: 4, activo: true,
    }];
    f.ventas = [{
      id: 'v1', negocio_id: NEGOCIO, cliente_id: 'c1', fecha: '2026-09-16T01:40:00+00:00',
      total_cent: 74_000, cobrado_cent: 0, forma_pago: 'cuenta',
      venta_items: [{
        id: 'vi1', venta_id: 'v1', producto_id: 'p1', cantidad: 2,
        precio_unitario_cent: 37_000, costo_unitario_cent: 20_000,
      }],
    }];

    const e = armarEstado(f)!;
    expect(e.negocioId).toBe(NEGOCIO);
    expect(e.productos[0]).toEqual({
      id: 'p1', negocioId: NEGOCIO, nombre: 'Collar', unidad: 'unidad',
      activo: true, categoria: 'accesorios', sugeridoEnVehiculo: 4,
    });
    // Un null de la base no se convierte en la cadena "null" ni en undefined explícito.
    expect('variante' in e.productos[0]).toBe(false);
    expect(e.ventas[0].items).toHaveLength(1);
    expect(e.ventas[0].items[0].precioUnitarioCent).toBe(37_000);
    expect(e.ventas[0].fecha).toBe('2026-09-16T01:40:00.000Z');
  });

  it('sin negocio devuelve null en vez de un estado vacío', () => {
    // Pasa de verdad: cuenta creada que no pudo reclamar el negocio porque ya
    // tiene dueño. RLS le muestra cero filas en todo. Abrir la app como si eso
    // fueran sus datos sería mentirle.
    const f = vacias();
    f.negocios = [];
    expect(armarEstado(f)).toBeNull();
  });

  it('un precio abierto sigue abierto', () => {
    const f = vacias();
    f.precios = [{
      id: 'pr1', producto_id: 'p1', lista_id: LISTA, precio_cent: 37_000,
      vigente_desde: '2026-09-01T10:00:00+00:00', vigente_hasta: null, origen: 'manual',
    }];
    expect(armarEstado(f)!.precios[0].vigenteHasta).toBeNull();
  });
});

describe('unir lo que bajó con lo que había', () => {
  it('lo que existe solo en el dispositivo no se borra', () => {
    // La venta de la vereda que todavía no subió. Borrarla porque el servidor
    // "no la tiene" es perder plata.
    const local = { ...estadoVacio(), clientes: [
      { id: 'c-local', negocioId: NEGOCIO, nombre: 'Kiosco nuevo', activo: true },
    ] };
    const unido = unir(local, estadoVacio(), new Set());
    expect(unido.clientes.map((c) => c.id)).toEqual(['c-local']);
  });

  it('el servidor pisa lo local cuando ya lo conoce', () => {
    const local = { ...estadoVacio(), clientes: [
      { id: 'c1', negocioId: NEGOCIO, nombre: 'Huellitas', activo: true },
    ] };
    const remoto = { ...estadoVacio(), clientes: [
      { id: 'c1', negocioId: NEGOCIO, nombre: 'Pet Shop Huellitas', activo: true },
    ] };
    expect(unir(local, remoto, new Set()).clientes[0].nombre).toBe('Pet Shop Huellitas');
  });

  it('pero NO pisa lo que todavía está en la cola', () => {
    // Corrigió el nombre sin señal. Si el servidor ganara, la corrección se le
    // borraría de la pantalla aunque siguiera guardada y terminara subiendo.
    const local = { ...estadoVacio(), clientes: [
      { id: 'c1', negocioId: NEGOCIO, nombre: 'Pet Shop Huellitas', activo: true },
    ] };
    const remoto = { ...estadoVacio(), clientes: [
      { id: 'c1', negocioId: NEGOCIO, nombre: 'Huellitas', activo: true },
    ] };
    expect(unir(local, remoto, new Set(['c1'])).clientes[0].nombre).toBe('Pet Shop Huellitas');
  });

  it('un precio que el dispositivo ya cerró no se vuelve a abrir', () => {
    // Cambió el precio sin señal: acá la fila vieja quedó cerrada y la nueva
    // abierta, pero el servidor todavía manda la vieja abierta. Pisándola habría
    // dos precios vigentes del mismo producto y la app no sabría cuál cobrar.
    const local = { ...estadoVacio(), precios: [
      precio({ id: 'pr-vieja', precioCent: 100_000, vigenteHasta: '2026-09-15T10:00:00.000Z' }),
      precio({ id: 'pr-nueva', precioCent: 120_000, vigenteDesde: '2026-09-15T10:00:00.000Z' }),
    ] };
    const remoto = { ...estadoVacio(), precios: [precio({ id: 'pr-vieja', precioCent: 100_000 })] };

    const unido = unir(local, remoto, new Set(['pr-nueva']));
    const vigentes = unido.precios.filter((p) => p.vigenteHasta === null);
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0].precioCent).toBe(120_000);
  });

  it('una sugerencia ya resuelta no vuelve a aparecer pendiente', () => {
    const local = { ...estadoVacio(), sugerencias: [
      sugerencia({ id: 's1', estado: 'aplicada', resueltaEn: '2026-09-15T10:00:00.000Z' }),
    ] };
    const remoto = { ...estadoVacio(), sugerencias: [sugerencia({ id: 's1' })] };
    expect(unir(local, remoto, new Set()).sugerencias[0].estado).toBe('aplicada');
  });

  it('la sugerencia del dispositivo y la del servidor no se duplican', () => {
    // Las sugerencias nacen en los dos lados con ids distintos: la arma el
    // dispositivo al entrar mercadería y la vuelve a armar `registrar_compra`
    // con gen_random_uuid(). Sin esta regla vería dos veces el mismo cartel de
    // "subió el costo de X".
    const local = { ...estadoVacio(), sugerencias: [sugerencia({ id: 's-local' })] };
    const remoto = { ...estadoVacio(), sugerencias: [sugerencia({ id: 's-servidor' })] };

    const unido = unir(local, remoto, new Set());
    expect(unido.sugerencias).toHaveLength(1);
    expect(unido.sugerencias[0].id).toBe('s-servidor');
  });

  it('una sugerencia local de OTRO producto sí se conserva', () => {
    const local = { ...estadoVacio(), sugerencias: [
      sugerencia({ id: 's-local', productoId: 'otro' }),
    ] };
    const remoto = { ...estadoVacio(), sugerencias: [sugerencia({ id: 's-servidor' })] };
    expect(unir(local, remoto, new Set()).sugerencias).toHaveLength(2);
  });

  it('el negocio y la lista los define siempre el servidor', () => {
    const local = { ...estadoVacio(), negocioId: 'viejo', listaId: 'vieja' };
    const unido = unir(local, estadoVacio(), new Set());
    expect(unido.negocioId).toBe(NEGOCIO);
    expect(unido.listaId).toBe(LISTA);
  });

  it('sin nada local, queda tal cual lo que bajó', () => {
    const remoto = estadoVacio();
    expect(unir(null, remoto, new Set())).toBe(remoto);
  });
});
