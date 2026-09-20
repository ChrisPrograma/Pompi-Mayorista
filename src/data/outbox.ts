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
 *
 * Las `guardar_*` son la excepción declarada, y conviene entender por qué no
 * rompe nada. Mandan la fila entera del catálogo, no un delta: el nombre o el
 * teléfono de un comercio no es una suma de hechos, es un dato que vale o no
 * vale. Si dos dispositivos editan el mismo comercio, gana el último — y eso es
 * lo correcto, porque no hay nada que sumar entre "Huellitas" y "Pet Shop
 * Huellitas". Lo que nunca viaja así es el libro mayor: stock, precios, ventas,
 * compras y pagos siguen yendo como deltas o como filas nuevas.
 */

import type { Uuid } from '../domain/types.ts';

/** Las operaciones que el dispositivo puede encolar. Todas idempotentes por `id`. */
export type Operacion =
  | { tipo: 'registrar_venta'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'registrar_compra'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'registrar_pago_cliente'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'registrar_pago_proveedor'; id: Uuid; payload: Record<string, unknown> }
  /*
   * Ya no se genera ninguna: el traslado casa → auto se fue en la 009. Se deja
   * porque un aparato que estuvo sin señal puede tener una esperando en la cola,
   * y si el tipo no existiera se quedaría trabada para siempre.
   */
  | { tipo: 'trasladar_stock'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'cambiar_precio'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'aplicar_sugerencia'; id: Uuid; payload: Record<string, unknown> }
  /** Catálogo. Sirven para el alta y para la edición: es la misma fila por id. */
  | { tipo: 'guardar_cliente'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'guardar_producto'; id: Uuid; payload: Record<string, unknown> }
  | { tipo: 'guardar_proveedor'; id: Uuid; payload: Record<string, unknown> };

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
  /*
   * Campos declarados a mano en vez de propiedades de parámetro
   * (`constructor(private almacen: ...)`).
   *
   * Esa forma abreviada es de las pocas cosas de TypeScript que NO se pueden
   * borrar con un simple quitado de tipos, y el runner nativo de Node —el que
   * usa `npm run test:node`, el camino para probar sin instalar nada— la
   * rechaza. Con la forma larga, este archivo se puede testear en los dos
   * runners. Son cuatro líneas de más a cambio de que la cola, que es la pieza
   * que no puede perder una venta, sea siempre testeable.
   */
  private almacen: AlmacenCola;
  private transporte: Transporte;
  private ahora: () => Date;

  constructor(
    almacen: AlmacenCola,
    transporte: Transporte,
    ahora: () => Date = () => new Date(),
  ) {
    this.almacen = almacen;
    this.transporte = transporte;
    this.ahora = ahora;
  }

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

        /*
         * Y se corta acá, sin seguir con las siguientes.
         *
         * La cola no es un conjunto de operaciones sueltas: es una secuencia, y
         * las de después dependen de las de antes. Si falla "guardar el comercio
         * nuevo" y la cola siguiera, "registrar la venta a ese comercio" llegaría
         * al servidor antes que el comercio y rebotaría por clave foránea. Ese
         * rebote es un 4xx, o sea un error PERMANENTE: la venta quedaría marcada
         * como imposible de subir cuando en realidad solo llegó temprano.
         *
         * Cortando, la venta simplemente espera su turno y sube en el próximo
         * intento. Es preferible una cola frenada y visible a un libro mayor con
         * agujeros.
         */
        break;
      }
    }

    return { enviadas, fallidas };
  }

  /** Para el indicador de "X operaciones sin subir". Nunca se oculta este estado. */
  sinSubir(): Promise<number> {
    return this.almacen.contarPendientes();
  }
}
