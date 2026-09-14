/**
 * UUID v7 — identificadores ordenables por tiempo.
 *
 * Implementación propia de 30 líneas en vez de una dependencia. Motivos:
 *
 * 1. Es el único id que genera la app, y va en CADA fila del libro mayor.
 *    Que una pieza tan central dependa de un paquete de terceros que puede
 *    cambiar, quedar sin mantenimiento o sumar peso no se justifica.
 * 2. La app tiene que abrir rápido en un celular viejo: cada kilobyte cuenta.
 *
 * Formato (RFC 9562): 48 bits de milisegundos desde 1970, 4 bits de versión (7),
 * 12 bits aleatorios, 2 bits de variante y 62 bits aleatorios.
 *
 * La consecuencia práctica del v7: el orden alfabético de los ids ES el orden
 * cronológico. En un libro mayor eso significa índices que no se fragmentan y
 * consultas por rango de fechas baratas.
 */

export const uuidv7 = (): string => {
  const ms = Date.now();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);

  // 48 bits de timestamp, big-endian.
  b[0] = Math.floor(ms / 2 ** 40) & 0xff;
  b[1] = Math.floor(ms / 2 ** 32) & 0xff;
  b[2] = Math.floor(ms / 2 ** 24) & 0xff;
  b[3] = Math.floor(ms / 2 ** 16) & 0xff;
  b[4] = Math.floor(ms / 2 ** 8) & 0xff;
  b[5] = ms & 0xff;

  b[6] = 0x70 | (b[6] & 0x0f); // versión 7
  b[8] = 0x80 | (b[8] & 0x3f); // variante RFC 4122

  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** Momento de creación codificado en un uuid v7. Útil para depurar sin abrir la fila. */
export const fechaDeUuid = (id: string): Date =>
  new Date(parseInt(id.replace(/-/g, '').slice(0, 12), 16));
