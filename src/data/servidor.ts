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
  /** Ver la nota en `outbox.ts`: sin propiedad de parámetro, para poder testear. */
  status?: number;
  constructor(mensaje: string, status?: number) {
    super(mensaje);
    this.name = 'ErrorServidor';
    this.status = status;
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

/**
 * Cuántas filas se piden por vez al bajar una tabla.
 *
 * PostgREST puede estar configurado con un tope de filas por respuesta, y el
 * valor por defecto de ese tope es justamente 1000. Pidiendo de a mil y
 * siguiendo mientras vengan mil llenas, la descarga funciona igual con tope y
 * sin tope. Sin esto, el día que `movimientos_stock` pase las mil filas la app
 * bajaría las primeras mil y **no diría nada**: el stock quedaría mal calculado
 * sin ningún error a la vista. Es exactamente el tipo de falla que hay que
 * cerrar antes de que haya datos reales adentro.
 */
const PAGINA = 1000;

/**
 * Baja una tabla entera. Es el único GET del sistema.
 *
 * No lleva filtro por negocio a propósito: el filtro lo pone RLS del lado del
 * servidor (`004_rls.sql`), y un filtro del lado del navegador sería una
 * promesa que el navegador no puede cumplir.
 */
export const traer = async <T>(tabla: string, select = '*'): Promise<T[]> => {
  const token = await tokenVigente();
  if (!token) throw new ErrorServidor('Sin sesión: no se puede descargar');

  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=${encodeURIComponent(select)}`, {
      headers: cabeceras(token, {
        'Range-Unit': 'items',
        Range: `${desde}-${desde + PAGINA - 1}`,
      }),
    });
    if (!res.ok) {
      throw new ErrorServidor(await res.text().catch(() => res.statusText), res.status);
    }
    const pagina = (await res.json()) as T[];
    filas.push(...pagina);
    if (pagina.length < PAGINA) return filas;
  }
};

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
      return 'Tu cuenta quedó creada, pero este mail todavía no tiene permiso para entrar. '
        + 'Pedile al dueño que lo agregue desde Mi cuenta → Quién puede entrar.';
    }
    // Sin señal justo en este momento: la app abre igual y se reintenta al entrar.
    return null;
  }
};

/**
 * Usuarios autorizados a entrar al negocio.
 *
 * Hasta la migración 007 el sistema tenía UN dueño y la puerta se cerraba
 * después del primero. Ahora el dueño mantiene una lista de mails invitados, y
 * `reclamar_negocio()` deja pasar a quien esté en ella.
 *
 * POR QUÉ NO SE ABRE PARA CUALQUIERA: la app vive en una dirección pública. Si
 * entrara cualquiera que se registre, la URL sería la llave del negocio — la
 * deuda de todos los comercios a la vista, y con permiso de cargar ventas.
 */
export interface UsuarioAutorizado {
  email: string;
  rol: 'dueno' | 'vendedor';
  /** Cuándo entró por primera vez. Vacío = invitado que todavía no se registró. */
  usadoEn?: string;
}

export const traerAutorizados = async (): Promise<UsuarioAutorizado[]> => {
  if (!hayBackend()) return [];
  const filas = await traer<Record<string, unknown>>('usuarios_autorizados', 'email,rol,usado_en');
  return filas
    .map((f) => ({
      email: String(f.email),
      rol: (f.rol === 'dueno' ? 'dueno' : 'vendedor') as UsuarioAutorizado['rol'],
      ...(f.usado_en ? { usadoEn: String(f.usado_en) } : {}),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
};

/** Invita a un mail. Es idempotente: repetirlo solo actualiza el rol. */
export const autorizarUsuario = (email: string, rol: UsuarioAutorizado['rol'] = 'vendedor') =>
  rpc('autorizar_usuario', { p_email: email.trim().toLowerCase(), p_rol: rol });

/**
 * Le saca el permiso a un mail.
 *
 * Saca a la persona de la lista y, si ya había entrado, también del negocio. Lo
 * que NO hace es borrar nada de lo que cargó: sus ventas y sus cobros siguen
 * siendo hechos que pasaron. Es la REGLA 0 de siempre.
 */
export const quitarAutorizacion = (email: string) =>
  rpc('quitar_autorizacion', { p_email: email.trim().toLowerCase() });

export const transporte: Transporte = {
  async enviar(op: Operacion) {
    if (!hayBackend()) throw new ErrorServidor('Backend sin configurar');

    switch (op.tipo) {
      case 'registrar_venta':
        return rpc('registrar_venta', { p_id: op.id, ...op.payload });
      case 'registrar_compra':
        return rpc('registrar_compra', { p_id: op.id, ...op.payload });
      // El p_id de la compra viaja en el payload: esta operación tiene id propio.
      case 'anular_compra':
        return rpc('anular_compra', op.payload);
      case 'anular_venta':
        return rpc('anular_venta', op.payload);
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
