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
import { CLAVE_ANON, hayBackend, URL_BASE } from './entorno.ts';
import { tokenVigente } from './sesion.ts';

export { hayBackend } from './entorno.ts';

export class ErrorServidor extends Error {
  constructor(mensaje: string, readonly status?: number) {
    super(mensaje);
    this.name = 'ErrorServidor';
  }
}

/**
 * `apikey` identifica al proyecto; `Authorization` identifica a la PERSONA.
 *
 * Esa diferencia es todo el sistema de seguridad: las políticas de
 * `004_rls.sql` deciden qué filas se ven según `auth.uid()`, que sale del token
 * de la sesión. Mandando la clave `anon` en `Authorization` —como estaba antes
 * de que existiera el ingreso— el servidor no sabe quién pregunta y no devuelve
 * ni acepta nada. Eso es correcto, no un error a esquivar.
 */
const cabeceras = (token: string, extra: Record<string, string> = {}): Record<string, string> => ({
  'Content-Type': 'application/json',
  apikey: CLAVE_ANON,
  Authorization: `Bearer ${token}`,
  ...extra,
});

const pedir = async (ruta: string, cuerpo: unknown, extra?: Record<string, string>) => {
  const token = await tokenVigente();
  if (!token) {
    // Sin sesión utilizable no se intenta la llamada. La cola reintenta sola
    // cuando vuelva la señal o cuando él vuelva a entrar.
    throw new ErrorServidor('Sin sesión: la operación queda en la cola');
  }

  const res = await fetch(`${URL_BASE}${ruta}`, {
    method: 'POST',
    headers: cabeceras(token, extra),
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

/**
 * Asociar al usuario recién registrado con el negocio.
 *
 * Quién se queda con el negocio lo decide Postgres, no el navegador: el primero
 * que llama a esta función se lo queda, y después la función rechaza a todos los
 * demás. Ver `db/migrations/006_reclamar_negocio.sql`.
 *
 * Devuelve el mensaje de error listo para mostrar, o null si salió bien.
 */
export const reclamarNegocio = async (): Promise<string | null> => {
  if (!hayBackend()) return null;
  try {
    await rpc('reclamar_negocio', {});
    return null;
  } catch (e) {
    const mensaje = e instanceof ErrorServidor ? e.message : '';
    if (mensaje.includes('ya tiene due')) {
      return 'Este sistema ya tiene dueño. Tu cuenta quedó creada pero sin acceso: '
        + 'pedile al que administra la app que te dé permiso.';
    }
    // Sin señal justo en este momento: la app abre igual y se reintenta al entrar.
    return null;
  }
};

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
      // `merge-duplicates` hace que alta y edición sean la misma llamada: si el
      // id ya está, reemplaza la fila. Por eso reenviar un alta no duplica nada
      // y una edición que se fue sin señal se aplica igual cuando vuelve.
      case 'guardar_cliente':
        return upsert('clientes', { id: op.id, ...op.payload });
      case 'guardar_producto':
        return upsert('productos', { id: op.id, ...op.payload });
      case 'guardar_proveedor':
        return upsert('proveedores', { id: op.id, ...op.payload });
    }
  },
};
