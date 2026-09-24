/**
 * La lógica del campo de cantidad, aparte del componente.
 *
 * EL BUG QUE ESTO ARREGLA
 *
 * El cliente cargaba 6 unidades y quedaban 60; cargaba 55 y quedaban 550. No era
 * una multiplicación en ningún lado: era **texto que se pegaba**.
 *
 * El campo mostraba `0` cuando la cantidad era cero. Al tocarlo, el código hacía
 * `select()` para que lo tipeado reemplazara ese cero. Eso funciona en Chrome de
 * escritorio y **no funciona en un campo `type="number"`** en varios navegadores
 * de teléfono: la especificación de HTML no define selección para los campos
 * numéricos, así que `select()` no hace nada y `selectionStart` devuelve `null`.
 * Resultado: el cursor queda donde cayó el dedo —en un campo de 46 px, muchas
 * veces a la izquierda del cero— y lo tipeado se INSERTA:
 *
 *     "0"  +  tocar a la izquierda  +  tipear "6"   →  "60"
 *     "0"  +  tocar a la izquierda  +  tipear "55"  →  "550"
 *
 * Por eso el número quedaba multiplicado por diez por cada dígito que escribía.
 *
 * LAS TRES DEFENSAS, Y POR QUÉ SON TRES
 *
 *  1. **En cero, el campo va VACÍO** (con el `0` como texto de fondo). Si no hay
 *     nada escrito, no hay nada a lo que pegarse: da igual dónde caiga el
 *     cursor.
 *  2. **Al tocar el campo se vacía**, aunque ya tenga un número. Es la misma
 *     idea aplicada al otro caso: corregir un 6 escribiendo 55 daba "556" si el
 *     cursor caía a la izquierda. Vaciando al entrar, lo que se escribe siempre
 *     reemplaza. Si toca el campo y se va sin escribir nada, vuelve el número
 *     que estaba: un campo en blanco es "no terminé", no "cero".
 *  3. **El campo es `type="text"` con teclado numérico**, no `type="number"`.
 *     Ahí `select()` sí está definido, desaparecen las flechitas, y no entran la
 *     `e`, el `+` ni la coma que un campo numérico acepta y esta app no quiere.
 *
 * Las dos primeras no dependen de que `select()` ande en el teléfono del
 * cliente, que es exactamente la apuesta que salió mal.
 */

/** Cuántas unidades se pueden cargar de un renglón. Ver `acotar`. */
export const MAX_UNIDADES = 99_999;

/**
 * Lo que queda escrito en el campo después de una tecla.
 *
 * Se queda SOLO con los dígitos: ni signo menos, ni coma, ni punto, ni la "e"
 * que los campos numéricos aceptan. Son unidades enteras y positivas.
 *
 * Los ceros de adelante se comen ("007" → "7") porque si no, el campo deja
 * escribir "0007" y el número que se ve no es el que se guarda. El cero SOLO se
 * conserva: escribir 0 es como él saca un producto del pedido.
 */
export const textoDeCantidad = (crudo: string): string => {
  const soloDigitos = crudo.replace(/[^0-9]/g, '');
  const sinCeros = soloDigitos.replace(/^0+(?=\d)/, '');
  // Se recorta acá también: sin esto, pegar veinte dígitos daría un número que
  // JavaScript ya no representa exacto.
  return sinCeros.slice(0, String(MAX_UNIDADES).length);
};

/** El número que corresponde a lo escrito. Vacío es "todavía nada", no cero. */
export const valorDeCantidad = (texto: string): number | null =>
  texto === '' ? null : Number(texto);

/** Recorta contra el mínimo y el máximo, así no hay forma de anotar negativos. */
export const acotar = (n: number, minimo: number, maximo?: number): number =>
  Math.max(minimo, Math.min(maximo ?? MAX_UNIDADES, Math.floor(n)));

/**
 * Qué mostrar en el campo cuando el usuario NO está escribiendo.
 *
 * La regla entera del arreglo, en una línea: **en cero, vacío**.
 */
export const textoParaMostrar = (valor: number): string => (valor === 0 ? '' : String(valor));

/**
 * Qué queda escrito al TOCAR el campo: nada.
 *
 * Existe como función para que el porqué esté acá y no perdido en el JSX, y para
 * poder testearlo. Ver la defensa 2 del comentario de arriba.
 */
export const alEnfocar = (): string => '';
