/**
 * Transporte contra el backend (Supabase / PostgREST).
 *
 * Son llamadas HTTP a la API que Postgres ya expone, así que se resuelven con
 * `fetch` y sesenta líneas en vez de sumar el cliente oficial (~120 kB). En una
 * app que tiene que abrir rápido en un celular viejo, eso importa.
 *
 * Cada operación de la cola se mapea a una función SQL de
 * `db/migrations/003_funciones.sql`. Todas reciben el id generado en el
 * dispositivo, así que reenviar la misma operación no duplica nada.
 */

import type { Operacion, Transporte } from './outbox.ts';

/**
 * `import.meta.env` lo define Vite. Con otro bundler, o si el archivo se abre
 * fuera de un build, no existe — y leerlo directo tira una excepción que deja la
 * app en blanco. Se lee a la defensiva: sin configuración, la app funciona
 * igual, guardando todo en el dispositivo.
 */
const entorno = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});

const URL_BASE = entorno.VITE_SUPABASE_URL;
const CLAVE = entorno.VITE_SUPABASE_ANON_KEY;

/** ¿Hay backend configurado? La interfaz lo usa para no prometer sincronización. */
export const hayBackend = (): boolean => Boolean(URL_BASE && CLAVE);

export class ErrorServidor extends Error {
  constructor(mensaje: string, readonly status?: number) {
    super(mensaje);
    this.name = 'ErrorServidor';
  }
}

const cabeceras = (extra: Record<string, string> = {}): Record<string, string> => ({
  'Content-Type': 'application/json',
  apikey: CLAVE ?? '',
  Authorization: `Bearer ${CLAVE ?? ''}`,
  ...extra,
});

const pedir = async (ruta: string, cuerpo: unknown, extra?: Record<string, string>) => {
  const res = await fetch(`${URL_BASE}${ruta}`, {
    method: 'POST',
    headers: cabeceras(extra),
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) {
    // Un 4xx es un dato mal formado: la cola no lo reintenta para siempre.
    throw new ErrorServidor(await res.text().catch(() => res.statusText), res.status);
  }
};

/** Llama a una función SQL. */
const rpc = (fn: string, args: Record<string, unknown>) => pedir(`/rest/v1/rpc/${fn}`, args);

/** Inserta o reemplaza una fila por su id. */
const upsert = (tabla: string, fila: Record<string, unknown>) =>
  pedir(`/rest/v1/${tabla}`, fila, {
    Prefer: 'resolution=merge-duplicates,return=minimal',
  });

export const transporte: Transporte = {
  async enviar(op: Operacion) {
    if (!hayBackend()) throw new ErrorServidor('Backend sin configurar');

    switch (op.tipo) {
      case 'registrar_venta':
        return rpc('registrar_venta', { p_id: op.id, ...op.payload });
      case 'registrar_compra':
        return rpc('registrar_compra', { p_id: op.id, ...op.payload });
      case 'trasladar_stock':
        return rpc('trasladar_stock', { p_id: op.id, ...op.payload });
      case 'cambiar_precio':
        return rpc('cambiar_precio', { p_id: op.id, ...op.payload });
      case 'aplicar_sugerencia':
        return rpc('aplicar_sugerencia', { p_sugerencia_id: op.id, ...op.payload });
      case 'registrar_pago_cliente':
        return upsert('pagos_cliente', { id: op.id, ...op.payload });
      case 'registrar_pago_proveedor':
        return upsert('pagos_proveedor', { id: op.id, ...op.payload });
      case 'alta_cliente':
        return upsert('clientes', { id: op.id, ...op.payload });
      case 'alta_producto':
        return upsert('productos', { id: op.id, ...op.payload });
    }
  },
};
