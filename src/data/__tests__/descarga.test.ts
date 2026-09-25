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
import type { MovimientoStock, PrecioVenta, SugerenciaPrecio } from '../../domain/types.ts';

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

// ---------------------------------------------------------------------------

/**
 * Tests del bug del capital: el movimiento de stock que se contaba dos veces.
 *
 * EL CASO REAL: el celular de Pablo marcaba 1765 unidades, su computadora 1268 y
 * el servidor 907. Los aparatos que solo bajan daban bien; los que cargan, nunca.
 *
 * La causa: el aparato arma el movimiento con su id y el servidor lo vuelve a
 * armar con `gen_random_uuid()`. Dos ids, dos filas, y "bajar no borra" las
 * conservaba las dos.
 */
const mov = (m: Partial<MovimientoStock> & { id: string }): MovimientoStock => ({
  negocioId: NEGOCIO, productoId: 'prod', ubicacion: 'deposito',
  cantidad: 10, tipo: 'compra', refTipo: 'compra', refId: 'compra-1',
  fecha: '2026-09-20T10:00:00.000Z', ...m,
});

/** Cuántas unidades ve la app: el stock es la suma del libro mayor. */
const unidades = (e: EstadoApp): number => e.movimientos.reduce((a, m) => a + m.cantidad, 0);

describe('el movimiento de stock no se cuenta dos veces', () => {
  it('el del servidor reemplaza al provisorio del aparato, aunque tengan otro id', () => {
    /*
     * El corazón del bug. Diez unidades entraron UNA vez; el aparato tiene su
     * copia con id local y baja la del servidor con otro id. Tienen que quedar
     * diez, no veinte.
     */
    const local = { ...estadoVacio(), movimientos: [mov({ id: 'local-1' })] };
    const remoto = { ...estadoVacio(), movimientos: [mov({ id: 'servidor-1' })] };

    const unido = unir(local, remoto, new Set());
    expect(unido.movimientos).toHaveLength(1);
    expect(unido.movimientos[0]!.id).toBe('servidor-1');
    expect(unidades(unido)).toBe(10);
  });

  it('con varios renglones tampoco: una compra de tres productos son tres movimientos', () => {
    const local = { ...estadoVacio(), movimientos: [
      mov({ id: 'l1', productoId: 'p1', cantidad: 5 }),
      mov({ id: 'l2', productoId: 'p2', cantidad: 3 }),
      mov({ id: 'l3', productoId: 'p3', cantidad: 2 }),
    ] };
    const remoto = { ...estadoVacio(), movimientos: [
      mov({ id: 's1', productoId: 'p1', cantidad: 5 }),
      mov({ id: 's2', productoId: 'p2', cantidad: 3 }),
      mov({ id: 's3', productoId: 'p3', cantidad: 2 }),
    ] };

    const unido = unir(local, remoto, new Set());
    expect(unido.movimientos).toHaveLength(3);
    expect(unidades(unido)).toBe(10);
  });

  it('bajar dos veces seguidas no vuelve a sumar', () => {
    // La descarga corre en cada apertura. Si no fuera idempotente, el stock
    // crecería un poco cada vez que abre la app.
    const remoto = { ...estadoVacio(), movimientos: [mov({ id: 'servidor-1' })] };
    let estado = unir({ ...estadoVacio(), movimientos: [mov({ id: 'local-1' })] }, remoto, new Set());
    estado = unir(estado, remoto, new Set());
    estado = unir(estado, remoto, new Set());

    expect(estado.movimientos).toHaveLength(1);
    expect(unidades(estado)).toBe(10);
  });

  it('limpia los fantasmas que ya quedaron de antes', () => {
    /*
     * Lo que hace que esto no necesite ni migración ni que nadie borre nada: un
     * aparato que YA viene con las dos copias adentro queda limpio en la próxima
     * descarga.
     */
    const contaminado = { ...estadoVacio(), movimientos: [
      mov({ id: 'local-1' }), mov({ id: 'servidor-1' }),
    ] };
    expect(unidades(contaminado)).toBe(20);   // el número que veía Pablo

    const unido = unir(contaminado, { ...estadoVacio(), movimientos: [mov({ id: 'servidor-1' })] }, new Set());
    expect(unido.movimientos).toHaveLength(1);
    expect(unidades(unido)).toBe(10);
  });

  it('la anulación y la entrada son dos grupos, no uno', () => {
    /*
     * Una compra anulada tiene DOS juegos de movimientos con el mismo `refId`:
     * la entrada y el ajuste que la compensa. Agrupando solo por `refId`, el
     * ajuste del servidor borraría la entrada y el stock quedaría al revés.
     */
    const local = { ...estadoVacio(), movimientos: [
      mov({ id: 'l-entrada' }),
      mov({ id: 'l-ajuste', cantidad: -10, tipo: 'ajuste' }),
    ] };
    const remoto = { ...estadoVacio(), movimientos: [
      mov({ id: 's-entrada' }),
      mov({ id: 's-ajuste', cantidad: -10, tipo: 'ajuste' }),
    ] };

    const unido = unir(local, remoto, new Set());
    expect(unido.movimientos).toHaveLength(2);
    expect(unidades(unido)).toBe(0);
    expect(unido.movimientos.map((m) => m.id).sort()).toEqual(['s-ajuste', 's-entrada']);
  });

  it('si el servidor solo mandó la entrada, el ajuste local se conserva', () => {
    // La anulación se hizo sin señal y todavía no subió. Borrarla sería devolver
    // al stock mercadería que él ya sacó.
    const local = { ...estadoVacio(), movimientos: [
      mov({ id: 'l-entrada' }),
      mov({ id: 'l-ajuste', cantidad: -10, tipo: 'ajuste' }),
    ] };
    const remoto = { ...estadoVacio(), movimientos: [mov({ id: 's-entrada' })] };

    const unido = unir(local, remoto, new Set());
    expect(unido.movimientos.map((m) => m.id).sort()).toEqual(['l-ajuste', 's-entrada']);
    expect(unidades(unido)).toBe(0);
  });

  it('una compra que todavía no subió no se toca', () => {
    // Está en la cola: lo del aparato es más nuevo que lo que el servidor sabe.
    const local = { ...estadoVacio(), movimientos: [mov({ id: 'l1', refId: 'compra-nueva' })] };
    const remoto = estadoVacio();

    const unido = unir(local, remoto, new Set(['compra-nueva']));
    expect(unido.movimientos).toHaveLength(1);
    expect(unido.movimientos[0]!.id).toBe('l1');
  });

  it('con la compra en la cola, el servidor no pisa lo local', () => {
    /*
     * La cola reintenta: el servidor puede ya tener la compra mientras el
     * aparato todavía la da por pendiente. En ese rato gana lo local, y la
     * próxima descarga —con la cola ya vacía— deja la del servidor.
     */
    const local = { ...estadoVacio(), movimientos: [mov({ id: 'l1' })] };
    const remoto = { ...estadoVacio(), movimientos: [mov({ id: 's1' })] };

    const enCola = unir(local, remoto, new Set(['compra-1']));
    expect(enCola.movimientos.map((m) => m.id)).toEqual(['l1']);
    expect(unidades(enCola)).toBe(10);

    const yaSubida = unir(enCola, remoto, new Set());
    expect(yaSubida.movimientos.map((m) => m.id)).toEqual(['s1']);
    expect(unidades(yaSubida)).toBe(10);
  });

  it('una venta que el servidor no conoce se conserva entera', () => {
    // La regla vieja que NO hay que romper: bajar no borra.
    const local = { ...estadoVacio(), movimientos: [
      mov({ id: 'l-venta', cantidad: -4, tipo: 'venta', refTipo: 'venta', refId: 'venta-sin-subir' }),
    ] };
    const unido = unir(local, estadoVacio(), new Set());
    expect(unido.movimientos).toHaveLength(1);
    expect(unidades(unido)).toBe(-4);
  });

  it('un movimiento sin operación detrás se une por id, como antes', () => {
    const local = { ...estadoVacio(), movimientos: [
      mov({ id: 'suelto-local', refId: undefined, refTipo: undefined, tipo: 'ajuste' }),
    ] };
    const remoto = { ...estadoVacio(), movimientos: [
      mov({ id: 'suelto-servidor', refId: undefined, refTipo: undefined, tipo: 'ajuste' }),
    ] };

    const unido = unir(local, remoto, new Set());
    expect(unido.movimientos).toHaveLength(2);
  });

  it('las operaciones de OTRAS compras no se tocan', () => {
    const local = { ...estadoVacio(), movimientos: [
      mov({ id: 'l-a', refId: 'compra-a' }),
      mov({ id: 'l-b', refId: 'compra-b', cantidad: 7 }),
    ] };
    const remoto = { ...estadoVacio(), movimientos: [mov({ id: 's-a', refId: 'compra-a' })] };

    const unido = unir(local, remoto, new Set());
    expect(unido.movimientos.map((m) => m.id).sort()).toEqual(['l-b', 's-a']);
    expect(unidades(unido)).toBe(17);
  });
});
