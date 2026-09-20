/**
 * El comprobante que le manda al comercio por WhatsApp.
 *
 * POR QUÉ DIBUJADO A MANO Y NO CON html2canvas
 *
 * La forma habitual de hacer esto es armar la tarjeta en HTML y pasarla por
 * `html2canvas`. Acá no, por tres razones concretas:
 *
 *  1. Son ~200 kB de dependencia que viajan al teléfono de él en cada carga. El
 *     proyecto tiene DOS dependencias de producción (react y react-dom) y es una
 *     decisión tomada, no una casualidad.
 *  2. `html2canvas` reimplementa el motor de dibujo del navegador, así que se
 *     lleva mal con lo moderno: `color-mix`, variables de CSS en algunos casos,
 *     fuentes cargadas de afuera. Esta app usa las tres.
 *  3. El recibo es un encabezado, una lista y tres totales. Dibujarlo derecho
 *     son doscientas líneas que hacen exactamente lo que dicen, y el resultado
 *     sale idéntico en todos los teléfonos.
 *
 * NADA SE GUARDA
 *
 * La imagen se arma en el momento, se comparte y se descarta. No se sube a
 * Supabase ni se guarda en el aparato: el comprobante se puede volver a generar
 * en cualquier momento desde la venta, que sí está guardada. La cuenta de
 * Supabase es la gratuita y el almacenamiento es justamente lo que menos
 * conviene gastar.
 */

import { formatear, type Cent } from '../domain/money.ts';
import { fechaYHora } from '../domain/fechas.ts';

export interface LineaRecibo {
  codigo?: string;
  nombre: string;
  cantidad: number;
  precioUnitarioCent: Cent;
}

export interface DatosRecibo {
  negocio: string;
  cliente: string;
  fechaIso: string;
  lineas: LineaRecibo[];
  totalCent: Cent;
  pagadoCent: Cent;
  /** Lo que queda debiendo por ESTA venta. */
  saldoCent: Cent;
}

/*
 * Medidas del dibujo. Todo en unidades lógicas; al final se multiplica por
 * ESCALA para que no salga borroso.
 *
 * 720 de ancho es a propósito: WhatsApp recomprime lo que le mandás, y una
 * imagen más chica que el ancho de pantalla se ve mal. Con 720 × 2 el texto
 * queda nítido incluso después de que WhatsApp la toque.
 */
const ANCHO = 720;
const MARGEN = 44;
const ESCALA = 2;

const TINTA = '#12211C';
const TINTA_2 = '#44584F';
const TINTA_3 = '#6B7F76';
const LINEA = '#DCE5E0';
const MARCA = '#0E5A4A';
const DEUDA = '#B3541E';
const FONDO = '#FFFFFF';

/*
 * Fuentes del sistema y no las del sitio, a propósito. Un canvas dibuja con la
 * fuente que esté cargada EN ESE INSTANTE; si la tipografía del sitio todavía
 * está bajando, el navegador no avisa y el recibo sale con otra letra, más
 * angosta, y los importes se descolocan. Las del sistema están siempre.
 */
const FUENTE = (peso: number, tam: number) =>
  `${peso} ${tam}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

/** Corta un texto que no entra y le pone puntos suspensivos. */
const recortar = (ctx: CanvasRenderingContext2D, texto: string, ancho: number): string => {
  if (ctx.measureText(texto).width <= ancho) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > ancho) t = t.slice(0, -1);
  return `${t}…`;
};

/*
 * `roundRect` es nuevo: está en todos los navegadores actuales, pero no en un
 * iPhone que no se actualiza desde hace un par de años. Si no está, va un
 * rectángulo común — se ve un poco menos redondeado y nada más. Un comprobante
 * que no se genera sería mucho peor que uno con las esquinas en punta.
 */
const caja = (ctx: CanvasRenderingContext2D, x: number, y: number, ancho: number, alto: number, radio: number) => {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, ancho, alto, radio);
    ctx.fill();
    return;
  }
  ctx.fillRect(x, y, ancho, alto);
};

const linea = (ctx: CanvasRenderingContext2D, y: number) => {
  ctx.strokeStyle = LINEA;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGEN, y + 0.5);
  ctx.lineTo(ANCHO - MARGEN, y + 0.5);
  ctx.stroke();
};

/**
 * Cuánto mide el recibo. Se calcula antes de dibujar porque el alto depende de
 * cuántos productos tenga la venta, y un canvas no crece solo.
 */
const altoDe = (d: DatosRecibo): number =>
  // El último sumando es el pie: la cápsula del estado y el "gracias" debajo.
  // Con menos, los dos quedaban en el mismo renglón, uno al lado del otro.
  200 + d.lineas.length * 58 + (d.saldoCent > 0 ? 3 : 2) * 44 + 180;

/** Dibuja el recibo y devuelve el canvas. */
export const dibujarRecibo = (d: DatosRecibo): HTMLCanvasElement => {
  const alto = altoDe(d);
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO * ESCALA;
  canvas.height = alto * ESCALA;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador no puede generar la imagen');
  ctx.scale(ESCALA, ESCALA);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, ANCHO, alto);

  // ---- encabezado ---------------------------------------------------------
  ctx.fillStyle = MARCA;
  ctx.fillRect(0, 0, ANCHO, 8);

  let y = 76;
  ctx.fillStyle = MARCA;
  ctx.font = FUENTE(800, 34);
  ctx.fillText(d.negocio, MARGEN, y);

  y += 34;
  ctx.fillStyle = TINTA_3;
  ctx.font = FUENTE(500, 19);
  ctx.fillText(fechaYHora(d.fechaIso), MARGEN, y);

  y += 40;
  ctx.fillStyle = TINTA_3;
  ctx.font = FUENTE(600, 16);
  ctx.fillText('COMPROBANTE PARA', MARGEN, y);

  y += 32;
  ctx.fillStyle = TINTA;
  ctx.font = FUENTE(700, 26);
  ctx.fillText(recortar(ctx, d.cliente, ANCHO - MARGEN * 2), MARGEN, y);

  y += 26;
  linea(ctx, y);

  // ---- productos ----------------------------------------------------------
  const derecha = ANCHO - MARGEN;
  y += 36;

  for (const l of d.lineas) {
    const subtotal = l.precioUnitarioCent * l.cantidad;

    // El subtotal se dibuja primero para saber cuánto lugar queda para el nombre.
    ctx.textAlign = 'right';
    ctx.fillStyle = TINTA;
    ctx.font = FUENTE(700, 21);
    const anchoSubtotal = ctx.measureText(formatear(subtotal)).width;
    ctx.fillText(formatear(subtotal), derecha, y);

    ctx.textAlign = 'left';
    let x = MARGEN;

    // El código va en una cápsula gris, como en la lista de productos.
    if (l.codigo) {
      ctx.font = FUENTE(700, 15);
      const ancho = ctx.measureText(l.codigo).width + 16;
      ctx.fillStyle = '#EDF3F0';
      caja(ctx, x, y - 16, ancho, 22, 6);
      ctx.fillStyle = TINTA_2;
      ctx.fillText(l.codigo, x + 8, y);
      x += ancho + 10;
    }

    ctx.fillStyle = TINTA;
    ctx.font = FUENTE(600, 21);
    ctx.fillText(recortar(ctx, l.nombre, derecha - x - anchoSubtotal - 24), x, y);

    // Segundo renglón: cuántas y a cuánto cada una.
    ctx.fillStyle = TINTA_3;
    ctx.font = FUENTE(500, 17);
    ctx.fillText(`${l.cantidad} × ${formatear(l.precioUnitarioCent)}`, MARGEN, y + 24);

    y += 58;
  }

  y -= 14;
  linea(ctx, y);
  y += 40;

  // ---- totales ------------------------------------------------------------
  const fila = (etiqueta: string, valor: string, destacada: boolean, color = TINTA) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = destacada ? TINTA : TINTA_2;
    ctx.font = FUENTE(destacada ? 700 : 500, destacada ? 22 : 20);
    ctx.fillText(etiqueta, MARGEN, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.font = FUENTE(800, destacada ? 28 : 22);
    ctx.fillText(valor, derecha, y);
    y += 44;
  };

  fila('Total', formatear(d.totalCent), true);
  fila('Pagó', formatear(d.pagadoCent), false, MARCA);
  if (d.saldoCent > 0) fila('Queda debiendo', formatear(d.saldoCent), false, DEUDA);

  // ---- estado -------------------------------------------------------------
  y += 4;
  const estado =
    d.saldoCent <= 0 ? 'PAGADO' : d.pagadoCent > 0 ? 'PAGO PARCIAL' : 'QUEDA EN CUENTA';
  const colorEstado = d.saldoCent <= 0 ? MARCA : DEUDA;

  ctx.textAlign = 'left';
  ctx.font = FUENTE(800, 18);
  const anchoEstado = ctx.measureText(estado).width + 34;
  ctx.fillStyle = colorEstado;
  ctx.globalAlpha = 0.12;
  caja(ctx, MARGEN, y, anchoEstado, 40, 20);
  ctx.globalAlpha = 1;
  ctx.fillStyle = colorEstado;
  ctx.fillText(estado, MARGEN + 17, y + 26);

  // ---- pie ----------------------------------------------------------------
  ctx.textAlign = 'center';
  ctx.fillStyle = TINTA_3;
  ctx.font = FUENTE(500, 16);
  ctx.fillText('Gracias por tu compra', ANCHO / 2, alto - 28);

  return canvas;
};

/** El recibo como archivo PNG, listo para compartir. */
export const reciboComoArchivo = (d: DatosRecibo): Promise<File> =>
  new Promise((resolver, rechazar) => {
    const canvas = dibujarRecibo(d);
    canvas.toBlob((blob) => {
      if (!blob) return rechazar(new Error('No se pudo generar la imagen'));
      const limpio = d.cliente.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
      const dia = d.fechaIso.slice(0, 10);
      resolver(new File([blob], `comprobante-${limpio || 'venta'}-${dia}.png`, { type: 'image/png' }));
    }, 'image/png');
  });

export type ResultadoCompartir = 'compartido' | 'descargado' | 'cancelado';

/**
 * Compartir el comprobante.
 *
 * Primero intenta la forma buena: `navigator.share` con el archivo adentro, que
 * en un celular abre el menú de siempre y deja elegir WhatsApp. Eso no existe en
 * una computadora de escritorio ni en algunos navegadores, así que el plan B es
 * bajar el archivo — desde ahí lo arrastra a WhatsApp Web.
 *
 * `canShare` con el archivo y no solo `share`: hay navegadores que tienen
 * `share` para texto pero no aceptan archivos, y en esos la llamada falla
 * después de abrir el menú, que es la peor forma de fallar.
 *
 * Importante para quien toque esto: el archivo tiene que estar generado ANTES de
 * llamar a `share`. Safari exige que la llamada salga del toque del usuario, y
 * si en el medio hay un `await` largo, cancela. Por eso `alCompartir` recibe el
 * archivo ya hecho y no los datos.
 */
export const compartirArchivo = async (archivo: File, titulo: string): Promise<ResultadoCompartir> => {
  const nav = navigator as Navigator & {
    canShare?: (datos: { files?: File[] }) => boolean;
    share?: (datos: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };

  if (nav.share && nav.canShare?.({ files: [archivo] })) {
    try {
      await nav.share({ files: [archivo], title: titulo, text: titulo });
      return 'compartido';
    } catch (e) {
      // Cerrar el menú sin elegir nada tira AbortError. No es un error que
      // haya que mostrarle: decidió no mandarlo.
      if (e instanceof Error && e.name === 'AbortError') return 'cancelado';
      // Cualquier otra cosa sí es una falla de verdad: se baja el archivo.
    }
  }

  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sin esto, el blob queda en memoria hasta que se cierre la pestaña.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'descargado';
};
