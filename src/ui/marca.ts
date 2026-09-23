/**
 * El nombre del negocio.
 *
 * Estaba como constante adentro de `App.tsx`, y ahí se quedó corto: lo necesitan
 * el encabezado, los comprobantes y ahora la lista de precios, que la arma
 * `pantallas.tsx`. Importarlo desde `App.tsx` haría un ciclo —App importa las
 * pantallas—, así que vive solo, en un archivo que no importa nada.
 *
 * El día que la app tenga más de un negocio, esto sale del estado y este archivo
 * desaparece. Hasta entonces, un solo lugar donde cambiarlo.
 */
export const NEGOCIO = 'Pompi Mayorista';
