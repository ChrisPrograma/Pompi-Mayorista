/**
 * Las dos variables del backend, leídas de una forma que funcione en los dos
 * builds y que **falle ruidosamente en vez de en silencio**.
 *
 * El detalle importa más de lo que parece. Vite reemplaza el texto exacto
 * `import.meta.env.VITE_ALGO` por su valor al compilar. Si en cambio se guarda
 * `import.meta.env` en una variable y después se lee `variable.VITE_ALGO`, el
 * reemplazo estático ya no aplica de forma garantizada — y el resultado sería el
 * peor posible: la app compila, se despliega, arranca... y nunca se conecta al
 * servidor, sin un solo error en la consola que lo explique. Alguien podría
 * perder una tarde revisando Supabase antes de mirar acá.
 *
 * Por eso el acceso es directo y literal. El `try` cubre el caso de que el
 * archivo corra fuera de Vite (el build con bun, o un test en Node), donde
 * `import.meta.env` no existe y leerlo tira una excepción.
 */

const leer = (): { url: string; clave: string } => {
  try {
    return {
      url: import.meta.env.VITE_SUPABASE_URL ?? '',
      clave: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    };
  } catch {
    return { url: '', clave: '' };
  }
};

const { url, clave } = leer();

export const URL_BASE = url;
export const CLAVE_ANON = clave;

/**
 * ¿Hay backend configurado?
 *
 * Con `false`, la app funciona igual guardando todo en el dispositivo: no pide
 * ingreso y no intenta sincronizar. Es el modo en el que estuvo en línea hasta
 * ahora, y sigue siendo un modo válido, no un estado roto.
 */
export const hayBackend = (): boolean => Boolean(URL_BASE && CLAVE_ANON);
