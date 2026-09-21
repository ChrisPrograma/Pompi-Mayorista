/**
 * Lo mínimo de Node para que los tests chequeen tipos SIN `npm install`.
 *
 * Solo `readFileSync`, y solo porque un test lee las pantallas para verificar
 * que cada paso del recorrido apunte a un `data-tour` que existe de verdad. No
 * es un reemplazo de `@types/node`: si algún día hace falta más superficie,
 * conviene agregar la dependencia y borrar este archivo.
 */

declare module 'node:fs' {
  export function readFileSync(ruta: string | URL, codificacion: 'utf8'): string;
}

interface ImportMeta {
  readonly url: string;
}
