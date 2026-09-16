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
import type { AlmacenCola, ItemCola } from './outbox.ts';

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

const PENDIENTES = ['pendiente', 'enviando'];

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
    return base.contarPorIndice('cola', 'estado', PENDIENTES);
  },
};
