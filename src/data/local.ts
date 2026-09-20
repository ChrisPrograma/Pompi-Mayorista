/**
 * Base local (IndexedDB).
 *
 * Guarda el mismo log que maneja la app: colecciones de solo-agregar. Por eso
 * todo se escribe con `guardarMuchos` — reescribir una fila con el mismo id es
 * idempotente y un reintento nunca duplica.
 *
 * Mientras no hay señal, esta base es la fuente de verdad. Cuando la cola de
 * salida sube todo, el servidor tiene exactamente lo mismo.
 */

import { BaseLocal, hayIndexedDB, type DefinicionTabla } from './idb.ts';
import { PARAMETROS_DEFAULT, type EstadoApp } from '../app/estado.ts';
import { esIdReal } from '../app/limpieza.ts';
import { idsAfectados, type AlmacenCola, type ItemCola } from './outbox.ts';

const TABLAS: DefinicionTabla[] = [
  { nombre: 'productos', clave: 'id', indices: ['proveedorId'] },
  { nombre: 'clientes', clave: 'id', indices: ['diaVisita'] },
  { nombre: 'proveedores', clave: 'id' },
  { nombre: 'precios', clave: 'id', indices: ['productoId'] },
  { nombre: 'movimientos', clave: 'id', indices: ['productoId', 'fecha'] },
  { nombre: 'compras', clave: 'id', indices: ['proveedorId', 'fecha'] },
  { nombre: 'ventas', clave: 'id', indices: ['clienteId', 'fecha'] },
  { nombre: 'pagos', clave: 'id', indices: ['clienteId', 'fecha'] },
  { nombre: 'sugerencias', clave: 'id', indices: ['estado'] },
  { nombre: 'cola', clave: 'id', indices: ['estado'] },
  { nombre: 'config', clave: 'clave' },
];

export const base = new BaseLocal('pompi', 1, TABLAS);

type Config = { clave: string; valor: unknown };

/** Lee todo el log y arma el estado de la app. */
export const cargarEstado = async (): Promise<EstadoApp | null> => {
  if (!hayIndexedDB()) return null;

  const [negocioId, listaId, parametros] = await Promise.all([
    base.uno<Config>('config', 'negocioId'),
    base.uno<Config>('config', 'listaId'),
    base.uno<Config>('config', 'parametros'),
  ]);
  if (!negocioId || !listaId) return null;

  const [productos, clientes, proveedores, precios, movimientos, compras, ventas, pagos, sugerencias] =
    await Promise.all([
      base.todos<EstadoApp['productos'][number]>('productos'),
      base.todos<EstadoApp['clientes'][number]>('clientes'),
      base.todos<EstadoApp['proveedores'][number]>('proveedores'),
      base.todos<EstadoApp['precios'][number]>('precios'),
      base.todos<EstadoApp['movimientos'][number]>('movimientos'),
      base.todos<EstadoApp['compras'][number]>('compras'),
      base.todos<EstadoApp['ventas'][number]>('ventas'),
      base.todos<EstadoApp['pagos'][number]>('pagos'),
      base.todos<EstadoApp['sugerencias'][number]>('sugerencias'),
    ]);

  return {
    negocioId: negocioId.valor as string,
    listaId: listaId.valor as string,
    productos, clientes, proveedores, precios, movimientos, compras, ventas, pagos, sugerencias,
    parametros: (parametros?.valor as EstadoApp['parametros']) ?? PARAMETROS_DEFAULT,
  };
};

/** Vuelca el estado completo. Se usa en la carga inicial y después de sincronizar. */
export const guardarEstado = async (e: EstadoApp): Promise<void> => {
  if (!hayIndexedDB()) return;
  await Promise.all([
    base.guardarMuchos<Config>('config', [
      { clave: 'negocioId', valor: e.negocioId },
      { clave: 'listaId', valor: e.listaId },
      { clave: 'parametros', valor: e.parametros },
    ]),
    base.guardarMuchos('productos', e.productos),
    base.guardarMuchos('clientes', e.clientes),
    base.guardarMuchos('proveedores', e.proveedores),
    base.guardarMuchos('precios', e.precios),
    base.guardarMuchos('movimientos', e.movimientos),
    base.guardarMuchos('compras', e.compras),
    base.guardarMuchos('ventas', e.ventas),
    base.guardarMuchos('pagos', e.pagos),
    base.guardarMuchos('sugerencias', e.sugerencias),
  ]);
};

/** Lo que todavía va a reintentarse solo. */
const PENDIENTES = ['pendiente', 'enviando'];

/**
 * Lo que el indicador de "sin subir" tiene que contar.
 *
 * Incluye `error` a propósito. Una operación que falló para siempre es
 * exactamente la que él MÁS necesita ver: es una venta que dio por hecha y que
 * el servidor no tiene. Contando solo las pendientes, el cartel decía "0 sin
 * subir" con una venta perdida adentro de la cola — justo lo contrario de lo que
 * promete el comentario de `outbox.ts`.
 */
const SIN_SUBIR = ['pendiente', 'enviando', 'error'];

/** Las tablas de datos. Sin `cola` ni `config`: esas dos no son datos del negocio. */
const DATOS = [
  'productos', 'clientes', 'proveedores', 'precios',
  'movimientos', 'compras', 'ventas', 'pagos', 'sugerencias',
];

/**
 * Borra todos los datos del negocio guardados en este aparato.
 *
 * Único uso legítimo: tirar los datos de ejemplo que dejaron las versiones
 * viejas de la app. Hasta el 16/09/2026 la app se sembraba sola con Pet Shop
 * Huellitas y Forrajería El Ceibo, y esos comercios inventados quedaron
 * guardados en el navegador de cualquiera que la haya abierto. Como nunca
 * subieron a Supabase, no hay forma de sacarlos desde el otro lado: hay que
 * borrarlos acá.
 *
 * De la cola de salida saca SOLO las operaciones de los datos de ejemplo, y por
 * el mismo criterio de id que el resto de la limpieza. Lo que tenga id de verdad
 * se queda esperando su turno: si hay una venta sin subir, sigue esperando.
 */
export const vaciarDatosLocales = async (): Promise<void> => {
  if (!hayIndexedDB()) return;
  await Promise.all(DATOS.map((t) => base.vaciar(t)));
  await limpiarColaDeEjemplo();
  await Promise.all([
    base.borrar('config', 'negocioId'),
    base.borrar('config', 'listaId'),
    // De cuando los datos de ejemplo se marcaban en vez de reconocerse por el id.
    base.borrar('config', 'esSemilla'),
  ]);
};

/**
 * Saca de la cola las operaciones de los datos de ejemplo.
 *
 * ESTO APARECIÓ EN PRODUCCIÓN, no en un test: después de la limpieza quedaron
 * **16 operaciones `guardar_producto` con ids `p1`, `p10`, `p11`…**, en estado
 * `error`, con nueve intentos cada una y siempre la misma respuesta de Postgres:
 *
 *     22P02  invalid input syntax for type uuid: "p1"
 *
 * Son la prueba de que los datos de ejemplo nunca pudieron llegar al servidor
 * —la columna `id` es de tipo `uuid` y no acepta `p1`, por más veces que se
 * reintente—, pero quedaban para siempre en el aparato haciendo que el cartel
 * dijera "16 operaciones sin subir" en una app recién limpiada. Un cartel de
 * alarma permanente por algo que no existe es peor que no tener cartel.
 *
 * Solo se descartan las de id que no es uuid: son exactamente las que el
 * servidor rechaza de entrada y siempre va a rechazar. Una operación real nunca
 * entra en ese filtro, así que esto no puede perder una venta.
 *
 * Se llama en CADA apertura, y no solo cuando hay datos de ejemplo que borrar.
 * Tiene que ser así: en un aparato donde la limpieza de datos ya corrió, las
 * filas de ejemplo ya no están pero estas operaciones sí, y nadie volvería a
 * pasar a buscarlas. Devuelve cuántas sacó, para poder verlo en la bitácora.
 */
export const limpiarColaDeEjemplo = async (): Promise<number> => {
  if (!hayIndexedDB()) return 0;
  const items = await base.todos<ItemCola>('cola').catch(() => [] as ItemCola[]);
  const deEjemplo = items.filter((i) => !esIdReal(i.id));
  await Promise.all(deEjemplo.map((i) => base.borrar('cola', i.id)));
  return deEjemplo.length;
};

/**
 * Los ids que todavía esperan en la cola.
 *
 * Lo usa la descarga: una fila que está en la cola es más nueva que la del
 * servidor —todavía no se la mandamos— y no se pisa con lo que baje. Sin esto,
 * abrir la app sin señal justo después de corregir el nombre de un comercio le
 * devolvería el nombre viejo a la pantalla, aunque la corrección siguiera
 * guardada y terminara subiendo bien. Un dato que "se desarregla solo" es la
 * forma más rápida de que deje de confiar en el sistema.
 */
export const idsEnCola = async (): Promise<Set<string>> => {
  if (!hayIndexedDB()) return new Set();
  const items = await base.todos<ItemCola>('cola').catch(() => [] as ItemCola[]);
  // `idsAfectados` y no `i.id`: una anulación lleva id propio y protege también
  // a la compra que anula. Ver el comentario en `outbox.ts`.
  return new Set(items.flatMap((i) => idsAfectados(i.op)));
};

/** La cola de salida, respaldada en IndexedDB. */
export const almacenCola: AlmacenCola = {
  async agregar(item) {
    await base.guardar('cola', item);
  },
  async pendientes(ahoraIso) {
    if (!hayIndexedDB()) return [];
    const todos = await base.porIndice<ItemCola>('cola', 'estado', PENDIENTES);
    return todos
      .filter((i) => !i.reintentarDesde || i.reintentarDesde <= ahoraIso)
      .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  },
  async actualizar(id, cambios) {
    await base.modificar<ItemCola>('cola', id, cambios);
  },
  async quitar(id) {
    await base.borrar('cola', id);
  },
  async contarPendientes() {
    if (!hayIndexedDB()) return 0;
    return base.contarPorIndice('cola', 'estado', SIN_SUBIR);
  },
};
