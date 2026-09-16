/**
 * Sesión contra Supabase Auth.
 *
 * Son tres llamadas HTTP y un objeto guardado en el dispositivo. El cliente
 * oficial de Supabase pesa ~120 kB y hace mucho más de lo que esta app necesita
 * (OAuth, magic links, realtime); acá alcanza con entrar, salir y renovar.
 *
 * DECISIÓN QUE GOBIERNA ESTE ARCHIVO: **sin señal, la app abre igual**.
 *
 * Esto no es un detalle de implementación, es el requisito número uno del
 * proyecto: él trabaja parado en la vereda, muchas veces sin datos. Una pantalla
 * de ingreso que necesite internet para dejarlo pasar le rompería el día.
 *
 * Por eso la sesión vive en `localStorage` y se lee sin tocar la red: si hay una
 * sesión guardada, entra. El token se renueva cuando hay señal, y si venció y no
 * se puede renovar, la app sigue funcionando con los datos del dispositivo — lo
 * único que no va a poder hacer es sincronizar, que es justamente lo que tampoco
 * podría hacer sin señal.
 */

import { CLAVE_ANON, URL_BASE } from './entorno.ts';

export interface Sesion {
  accessToken: string;
  refreshToken: string;
  /** Época en milisegundos en que vence el access token. */
  venceEn: number;
  usuarioId: string;
  email: string;
}

const CLAVE_GUARDADO = 'pompi.sesion';

/**
 * `localStorage` y no IndexedDB a propósito: la sesión hay que leerla de forma
 * sincrónica antes del primer render, para no mostrar la pantalla de ingreso por
 * un instante a alguien que ya estaba adentro. IndexedDB es asincrónico.
 */
export const sesionGuardada = (): Sesion | null => {
  try {
    const crudo = localStorage.getItem(CLAVE_GUARDADO);
    if (!crudo) return null;
    const s = JSON.parse(crudo) as Sesion;
    return s?.accessToken && s?.refreshToken ? s : null;
  } catch {
    // Modo incógnito, almacenamiento bloqueado, JSON corrupto: se entra de nuevo.
    return null;
  }
};

const guardar = (s: Sesion | null) => {
  try {
    if (s) localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(s));
    else localStorage.removeItem(CLAVE_GUARDADO);
  } catch { /* si no se puede guardar, la sesión dura lo que dure la pestaña */ }
};

export class ErrorIngreso extends Error {}


/** Traduce lo que devuelve Supabase a algo que se pueda leer sin saber inglés. */
const enCastellano = (status: number, cuerpo: string): string => {
  const texto = cuerpo.toLowerCase();
  if (texto.includes('invalid login credentials')) return 'El mail o la contraseña no son correctos.';
  if (texto.includes('already registered') || texto.includes('already been registered')) {
    return 'Ese mail ya tiene una cuenta. Probá entrar en vez de registrarte.';
  }
  if (texto.includes('password should be at least')) {
    return 'La contraseña es muy corta para el servidor. Usá al menos 8 caracteres.';
  }
  if (texto.includes('signups not allowed') || texto.includes('signup is disabled')) {
    return 'El registro está cerrado. Pedile al que administra la app que te cree la cuenta.';
  }
  if (texto.includes('unable to validate email') || texto.includes('invalid format')) {
    return 'Ese mail no parece un mail. Fijate que esté bien escrito.';
  }
  if (texto.includes('email not confirmed')) return 'Falta confirmar el mail. Revisá tu casilla.';
  if (texto.includes('over_email_send_rate') || status === 429) {
    return 'Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.';
  }
  if (status >= 500) return 'El servidor no responde. Probá en un rato.';
  return 'No se pudo entrar. Revisá los datos y probá de nuevo.';
};

const aSesion = (d: Record<string, unknown>): Sesion => ({
  accessToken: String(d.access_token),
  refreshToken: String(d.refresh_token),
  // 60 s de colchón: si falta menos que eso, se renueva antes de usarlo.
  venceEn: Date.now() + (Number(d.expires_in) || 3600) * 1000 - 60_000,
  usuarioId: String((d.user as Record<string, unknown> | undefined)?.id ?? ''),
  email: String((d.user as Record<string, unknown> | undefined)?.email ?? ''),
});

const pedirToken = async (ruta: string, cuerpo: unknown): Promise<Sesion> => {
  const res = await fetch(`${URL_BASE}/auth/v1${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CLAVE_ANON },
    body: JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  if (!res.ok) throw new ErrorIngreso(enCastellano(res.status, texto));
  const s = aSesion(JSON.parse(texto) as Record<string, unknown>);
  guardar(s);
  return s;
};

export const entrar = (email: string, contrasena: string): Promise<Sesion> => {
  const mail = email.trim().toLowerCase();
  if (!mail || !contrasena) throw new ErrorIngreso('Faltan el mail o la contraseña.');
  return pedirToken('/token?grant_type=password', { email: mail, password: contrasena });
};

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

/**
 * Las reglas de la contraseña, en un solo lugar.
 *
 * MÍNIMO 8, y no 6. Dos razones, y la segunda es la que importa:
 *
 * 1. Supabase rechaza por debajo de 6 de todas formas: pedir menos no es una
 *    decisión que se pueda tomar, el servidor no lo acepta.
 * 2. Seis caracteres con letras y números son unas dos mil millones de
 *    combinaciones: una computadora común las prueba todas en minutos. Con ocho
 *    son unos tres millones de veces más. La diferencia entre una contraseña que
 *    se rompe sola y una que no son esos dos caracteres.
 *
 * Detrás de esto va a estar la plata que le deben a un tipo que trabaja en la
 * calle. Si hace falta bajarlo, se cambia `MINIMO` acá y nada más.
 */
const MINIMO = 8;

export const reglasContrasena = [
  { texto: `Al menos ${MINIMO} caracteres`, cumple: (c: string) => c.length >= MINIMO },
  { texto: 'Una mayúscula', cumple: (c: string) => /[A-ZÁÉÍÓÚÑ]/.test(c) },
  { texto: 'Un número', cumple: (c: string) => /[0-9]/.test(c) },
];

export const contrasenaValida = (c: string): boolean =>
  reglasContrasena.every((r) => r.cumple(c));

/**
 * Crear la cuenta.
 *
 * Supabase puede estar configurado para pedir confirmación por mail. En ese caso
 * la respuesta no trae `access_token`, y hay que avisarlo en vez de dejarlo
 * mirando una pantalla que no hace nada.
 */
export const registrarse = async (email: string, contrasena: string): Promise<Sesion> => {
  const mail = email.trim().toLowerCase();
  if (!mail.includes('@')) throw new ErrorIngreso('Ese mail no parece un mail.');
  if (!contrasenaValida(contrasena)) {
    throw new ErrorIngreso(`La contraseña necesita ${MINIMO} caracteres, una mayúscula y un número.`);
  }

  const res = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CLAVE_ANON },
    body: JSON.stringify({ email: mail, password: contrasena }),
  });
  const texto = await res.text();
  if (!res.ok) throw new ErrorIngreso(enCastellano(res.status, texto));

  const datos = JSON.parse(texto) as Record<string, unknown>;
  if (!datos.access_token) {
    throw new ErrorIngreso(
      'Cuenta creada. Te llegó un mail para confirmarla: abrilo y después entrá desde acá.',
    );
  }

  const s = aSesion(datos);
  guardar(s);
  return s;
};

export const salir = () => guardar(null);

/**
 * El token para firmar una llamada a la API.
 *
 * Devuelve `null` en vez de tirar error cuando no se puede renovar: quien llama
 * es la cola de salida, que ya sabe reintentar después. Un error acá no
 * arreglaría nada y dejaría la app en un estado raro.
 */
export const tokenVigente = async (): Promise<string | null> => {
  const s = sesionGuardada();
  if (!s) return null;
  if (Date.now() < s.venceEn) return s.accessToken;
  try {
    const nueva = await pedirToken('/token?grant_type=refresh_token', { refresh_token: s.refreshToken });
    return nueva.accessToken;
  } catch {
    // Sin señal el token no se renueva, y está bien: la cola espera.
    // Si el refresh fue rechazado de verdad, el 401 de la próxima llamada lo dirá.
    return null;
  }
};
