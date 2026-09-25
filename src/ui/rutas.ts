/**
 * Las pantallas de la app, en una lista que existe en tiempo de ejecución.
 *
 * POR QUÉ ACÁ Y NO EN `pantallas.tsx`
 *
 * El tipo `Ruta` sale de esta lista (`export type Ruta = (typeof RUTAS)[number]`),
 * y no al revés. Un tipo se borra al compilar: no se puede recorrer, ni contar,
 * ni preguntarle si contiene algo. Un test que quiera comprobar que el recorrido
 * guiado no manda a una pantalla inexistente necesita la lista de verdad.
 *
 * Hasta acá ese test la tenía copiada adentro, y eso es exactamente lo que se
 * despega: agregar una pantalla y olvidarse de la copia deja el test pasando
 * mientras miente. Ahora hay una sola lista y el tipo sale de ella, así que
 * agregar una ruta es agregar una palabra acá.
 *
 * Va en un `.ts` y no en el `.tsx` de las pantallas porque el runner de tests de
 * Node no sabe leer JSX.
 */

export const RUTAS = [
  'hoy', 'actividad', 'vender', 'deudas', 'cosas',
  'productos', 'clientes', 'ingreso', 'proveedores', 'numeros',
] as const;

export type Ruta = (typeof RUTAS)[number];
