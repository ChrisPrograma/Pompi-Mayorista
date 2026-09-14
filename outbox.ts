/**
 * Cola de salida (outbox).
 *
 * Él vende parado en la vereda, sin señal. Todo lo que hace se escribe primero
 * en el dispositivo y se sube cuando hay red.
 *
 * POR QUÉ ESTO SON 150 LÍNEAS Y NO UN MOTOR DE SINCRONIZACIÓN:
 * como el modelo es append-only, todas las escrituras son INSERT. Dos inserts no
 * entran en conflicto: se aplican en cualquier orden y el resultado es el mismo.
 * Si uno llega dos veces, la clave primaria lo rechaza. No hay nada que resolver.
 *
 * La única operación que no es un insert simple (cambiar un precio: cerrar una
 * fila y abrir otra) se resuelve del lado del servidor, en una transacción.
 * Por eso acá solo hay una cola, no un algoritmo de merge.
 *
 * REGLA: nunca se envía un estado ("vehiculo = 44"). Siempre un delta
 * ("−3 del vehiculo"). Un estado pisa lo que hizo otro dispositivo; un delta no.
 */

import type { Uuid } from '../domain/types.ts';

/** Las operaciones que el dispositivo puede encolar. Todas idempotentes por `id`. */
export type Operacion =
  | { tipo: 'registrar_venta'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'registrar_compra'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'registrar_pago_cliente'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'registrar_pago_proveedor'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'trasladar_stock'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'cambiar_precio'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'aplicar_sugerencia'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'alta_cliente'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'alta_producto'; id: Uuid; payload: Record<string, unknown> };

export type EstadoItem = 'pendiente' | 'enviando' | 'error';

export interface ItemCola {
  /** Mismo id que la entidad que crea. Es lo que hace la operación idempotente. */
  id: Uuid;
  op: Operacion;
  estado: EstadoItem;
  intentos: number;
  creadoEn: string;
  ultimoError?: string;
  /** Momento a partir del cual se puede reintentar (backoff exponencial). */
  reintentarDesde?: string;
}

/** Lo mínimo que la cola necesita de la base local. Facilita testear sin IndexedDB. */
export interface AlmacenCola {
  agregar(item: ItemCola): Promise<void>;
  pendientes(ahoraIso: string): Promise<ItemCola[]>;
  actualizar(id: Uuid, cambios: Partial<ItemCola>): Promise<void>;
  quitar(id: Uuid): Promise<void>;
  contarPendientes(): Promise<number>;
}

/** Lo mínimo que la cola necesita del servidor. */
export interface Transporte {
  enviar(op: Operacion): Promise<void>;
}

const MAX_INTENTOS = 10;

/** Espera creciente entre reintentos: 2s, 4s, 8s… hasta 5 minutos. */
export const proximoIntento = (intentos: number, ahora: Date): string => {
  const segundos = Math.min(2 ** Math.max(1, intentos), 300);
  return new Date(ahora.getTime() + segundos * 1000).toISOString();
};

/**
 * Errores que no se arreglan reintentando: el dato está mal, no la red.
 * Estos NO se reintentan para siempre; se marcan para que el usuario los vea.
 */
export const esErrorPermanente = (err: unknown): boolean => {
  const status = (err as { status?: number })?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
};

export class Cola {
  constructor(
    private almacen: AlmacenCola,
    private transporte: Transporte,
    private ahora: () => Date = () => new Date(),
  ) {}

  /**
   * Encola una operación. Devuelve enseguida: la pantalla ya puede mostrar el
   * resultado como hecho, porque desde el punto de vista del usuario lo está.
   */
  async encolar(op: Operacion): Promise<void> {
    await this.almacen.agregar({
      id: op.id,
      op,
      estado: 'pendiente',
      intentos: 0,
      creadoEn: this.ahora().toISOString(),
    });
  }

  /**
   * Intenta subir todo lo pendiente, en orden de creación.
   * Se llama al recuperar conexión, al abrir la app y cada tanto.
   */
  async sincronizar(): Promise<{ enviadas: number; fallidas: number }> {
    const ahora = this.ahora();
    const items = await this.almacen.pendientes(ahora.toISOString());

    let enviadas = 0;
    let fallidas = 0;

    for (const item of items) {
      await this.almacen.actualizar(item.id, { estado: 'enviando' });
      try {
        await this.transporte.enviar(item.op);
        // Éxito: sale de la cola. El servidor ya tiene la fila con este id,
        // así que aunque se hubiera enviado dos veces no habría duplicado nada.
        await this.almacen.quitar(item.id);
        enviadas++;
      } catch (err) {
        fallidas++;
        const intentos = item.intentos + 1;
        const mensaje = err instanceof Error ? err.message : String(err);

        if (esErrorPermanente(err) || intentos >= MAX_INTENTOS) {
          // No se reintenta más. Queda visible para que el usuario lo revise:
          // nunca se descarta en silencio una operación que él dio por hecha.
          await this.almacen.actualizar(item.id, {
            estado: 'error',
            intentos,
            ultimoError: mensaje,
          });
        } else {
          await this.almacen.actualizar(item.id, {
            estado: 'pendiente',
            intentos,
            ultimoError: mensaje,
            reintentarDesde: proximoIntento(intentos, ahora),
          });
        }
      }
    }

    return { enviadas, fallidas };
  }

  /** Para el indicador de "X operaciones sin subir". Nunca se oculta este estado. */
  sinSubir(): Promise<number> {
    return this.almacen.contarPendientes();
  }
}
