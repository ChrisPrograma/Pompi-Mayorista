/**
 * El corte en páginas de las listas del inicio.
 *
 * Vive en un archivo `.ts` aparte y no adentro de `componentes.tsx` por un
 * motivo práctico: el runner de tests que usa el proyecto sin instalar nada
 * (`node --experimental-strip-types`) no sabe leer JSX, así que nada que esté en
 * un `.tsx` se puede testear. La regla que queda para el futuro es simple — la
 * lógica pura va en `.ts`, el componente que la dibuja en `.tsx`.
 */

/** Cuántos ítems entran en una página de las listas del inicio. */
export const POR_PAGINA = 10;

/**
 * Corta una lista en la página que corresponde.
 *
 * Si la página quedó más allá del final —pasa al cambiar de rango: estaba en la
 * página 3 de "mes" y "semana" tiene una sola— devuelve la última que existe en
 * vez de una lista vacía. Una lista vacía ahí parecería que no hay nada, que es
 * la peor respuesta posible a un cambio de filtro.
 */
export const paginaDe = <T>(lista: T[], pagina: number, porPagina: number): T[] => {
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const n = Math.min(Math.max(0, pagina), paginas - 1);
  return lista.slice(n * porPagina, (n + 1) * porPagina);
};

/** Cuántas páginas tiene una lista. Menos de dos, el paginado no se dibuja. */
export const cuantasPaginas = (total: number, porPagina: number): number =>
  Math.max(1, Math.ceil(total / porPagina));
