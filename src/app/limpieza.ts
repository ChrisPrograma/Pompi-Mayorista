/**
 * Sacar de la base local los datos de ejemplo de versiones viejas.
 *
 * ARCHIVO APARTE, Y NO ADENTRO DE `semilla.ts`, A PROPÓSITO.
 *
 * Si la app importara cualquier cosa de `semilla.ts`, el empaquetador se lleva
 * el catálogo entero de ejemplo al bundle: doce productos, ocho comercios, sus
 * precios y sus ventas. Código muerto que igual se descarga en el celular, y —
 * peor — la puerta abierta a que algún día alguien lo llame sin querer. La regla
 * es simple y acá queda escrita: **la app no importa los datos de ejemplo. Punto.**
 *
 * Esto hace falta porque hasta el 16/09/2026 la app se sembraba sola al abrir.
 * Esos datos quedaron guardados en el navegador de cualquiera que la haya usado,
 * y como nunca subieron a Supabase, no se pueden borrar desde el servidor: la
 * única forma de sacarlos es reconocerlos acá.
 */

/**
 * Un id de verdad: uuid con guiones, como los que genera `uuidv7()`.
 *
 * ESTA ES LA PRUEBA QUE IMPORTA, y es mejor que mirar el nombre o el negocio.
 *
 * Los datos de ejemplo usan ids escritos a mano: `p1`, `c3`, `v2`, `s-0014`.
 * Los reales son uuid, en el aparato y en el servidor — y no por convención: las
 * columnas `id` de Postgres son de tipo `uuid` y **no pueden** contener `p1`. O
 * sea que esta prueba no puede confundir un dato real con uno de ejemplo, ni al
 * revés, aunque los dos estén mezclados en la misma lista.
 */
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const soloReales = <T extends { id: string }>(filas: T[]): T[] =>
  filas.filter((f) => ES_UUID.test(f.id));

/** Forma mínima que necesita la limpieza. Evita depender de `EstadoApp` entero. */
interface Limpiable {
  negocioId: string;
  productos: { id: string }[];
  clientes: { id: string }[];
  proveedores: { id: string }[];
  precios: { id: string }[];
  movimientos: { id: string }[];
  compras: { id: string }[];
  ventas: { id: string }[];
  pagos: { id: string }[];
  sugerencias: { id: string }[];
}

const COLECCIONES = [
  'productos', 'clientes', 'proveedores', 'precios', 'movimientos',
  'compras', 'ventas', 'pagos', 'sugerencias',
] as const;

/** ¿El negocio entero es de ejemplo? */
export const esDatosDeEjemplo = (e: { negocioId: string }): boolean =>
  !ES_UUID.test(e.negocioId);

/**
 * Saca los datos de ejemplo de un estado guardado.
 *
 * Tres respuestas, y la del medio es la que arregla el caso feo:
 *
 * - `null` — el negocio entero es de ejemplo. Se tira todo.
 * - un estado NUEVO — había filas de ejemplo mezcladas con reales. Quedan las reales.
 * - **el mismo objeto** que entró — no había nada que sacar. Quien llama compara
 *   por referencia (`limpio !== guardado`) y así no reescribe la base al pedo en
 *   cada apertura.
 *
 * El caso del medio no es teórico: al unir lo que baja del servidor con lo del
 * aparato, el negocio pasa a ser el del servidor —un uuid— mientras las filas de
 * ejemplo siguen abajo. Mirando solo el `negocioId`, la marca desaparece y los
 * comercios inventados quedan adentro para siempre, indistinguibles de los
 * reales. Es exactamente lo que hay que evitar: él tiene que poder confiar en
 * que lo que ve en la pantalla es su negocio y nada más.
 */
export const sinDatosDeEjemplo = <T extends Limpiable>(e: T): T | null => {
  if (esDatosDeEjemplo(e)) return null;

  const limpio = {
    ...e,
    productos: soloReales(e.productos),
    clientes: soloReales(e.clientes),
    proveedores: soloReales(e.proveedores),
    precios: soloReales(e.precios),
    movimientos: soloReales(e.movimientos),
    compras: soloReales(e.compras),
    ventas: soloReales(e.ventas),
    pagos: soloReales(e.pagos),
    sugerencias: soloReales(e.sugerencias),
  };

  const saco = COLECCIONES.some((k) => limpio[k].length !== e[k].length);
  return saco ? limpio : e;
};
