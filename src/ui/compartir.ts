/**
 * Sacar texto de la app: compartirlo o bajarlo.
 *
 * Es el mismo problema que el del comprobante, con una diferencia importante: el
 * comprobante es una imagen y esto es TEXTO. Una lista de sesenta productos como
 * imagen es ilegible en un teléfono, no se puede buscar y no se puede copiar; en
 * texto, el comercio busca "collar" en el chat y lo encuentra.
 *
 * Tres caminos, en orden de preferencia, porque no todos existen en todos lados:
 * el menú de compartir del sistema, el portapapeles, y bajar un archivo.
 */

export type ResultadoTexto = 'compartido' | 'copiado' | 'descargado' | 'cancelado' | 'falló';

/** Baja un texto como archivo. Es el plan B de todo lo demás. */
export const bajarTexto = (nombre: string, contenido: string, tipo: string): void => {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sin esto el blob queda en memoria hasta que se cierre la pestaña.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

/**
 * Comparte un texto largo.
 *
 * En el celular abre el menú de siempre y va directo a WhatsApp. En una
 * computadora, donde eso casi nunca existe, lo copia al portapapeles — que es
 * más útil que bajar un .txt, porque lo pega directo en WhatsApp Web. Si ninguna
 * de las dos anda, baja el archivo.
 */
export const compartirTexto = async (
  texto: string,
  titulo: string,
  nombreArchivo: string,
): Promise<ResultadoTexto> => {
  const nav = navigator as Navigator & {
    share?: (datos: { title?: string; text?: string }) => Promise<void>;
  };

  if (nav.share) {
    try {
      await nav.share({ title: titulo, text: texto });
      return 'compartido';
    } catch (e) {
      // Cerrar el menú sin elegir nada tira AbortError: decidió no mandarlo, y
      // eso no es un error que haya que mostrarle ni motivo para bajar nada.
      if (e instanceof Error && e.name === 'AbortError') return 'cancelado';
    }
  }

  try {
    await navigator.clipboard.writeText(texto);
    return 'copiado';
  } catch {
    // Sin permiso de portapapeles (pasa fuera de https): queda el archivo.
  }

  try {
    bajarTexto(nombreArchivo, texto, 'text/plain;charset=utf-8');
    return 'descargado';
  } catch {
    return 'falló';
  }
};
