/**
 * El día, en la hora de acá.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * Todas las fechas se guardan en formato ISO y en UTC: `2026-09-20T01:38:00.000Z`.
 * Eso está bien y no se toca — es lo único que ordena igual en el teléfono y en
 * Postgres, y lo que hace que una venta hecha sin señal se ubique en el lugar
 * correcto del historial cuando sube.
 *
 * Lo que estaba mal era preguntar "¿esto es de hoy?" comparando los primeros
 * diez caracteres de ese texto. Esos diez caracteres son el día **en UTC**, y
 * Argentina está tres horas atrás. O sea que a las 21:00 de acá ya es el día
 * siguiente allá, y una venta de las 21:30 del sábado se contaba como del
 * domingo: "Cobré hoy" se le ponía en cero mientras todavía estaba vendiendo.
 *
 * Acá el día se calcula en la zona de Buenos Aires. El instante guardado no
 * cambia; cambia con qué calendario se lo mira.
 *
 * POR QUÉ UNA ZONA FIJA Y NO LA DEL APARATO
 *
 * Podría usarse la zona del teléfono, y en la práctica daría igual. Pero si
 * alguna vez entra desde una computadora mal configurada, o desde el celular de
 * un empleado con la hora en otro lado, los números del negocio cambiarían según
 * el aparato. El negocio está en un solo lugar, así que el día también.
 */

export const ZONA = 'America/Argentina/Buenos_Aires';

/*
 * `formatToParts` y no `format` a propósito: el texto que arma `format` depende
 * del locale (en es-AR sale "20/9/2026", en en-CA "2026-09-20"), y acá hace
 * falta un formato fijo para poder comparar y ordenar. Las partes vienen
 * siempre con el mismo nombre, se junten como se junten.
 */
const partes = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const leer = (iso: string) => {
  const p = partes.formatToParts(new Date(iso));
  const v = (tipo: string) => p.find((x) => x.type === tipo)?.value ?? '';
  return {
    anio: v('year'),
    mes: v('month'),
    dia: v('day'),
    // A las 00, algunos motores devuelven "24" con hour12:false. Es un caso real.
    hora: v('hour') === '24' ? '00' : v('hour'),
    minuto: v('minute'),
  };
};

/** El día calendario de acá, como `2026-09-20`. Ordena y compara como texto. */
export const diaLocal = (iso: string): string => {
  const { anio, mes, dia } = leer(iso);
  return `${anio}-${mes}-${dia}`;
};

/** La hora de acá, como `21:30`. Es lo que se muestra al lado de cada venta. */
export const horaLocal = (iso: string): string => {
  const { hora, minuto } = leer(iso);
  return `${hora}:${minuto}`;
};

/** ¿Los dos instantes caen en el mismo día de acá? */
export const mismoDiaLocal = (a: string, b: string): boolean => diaLocal(a) === diaLocal(b);

/**
 * Cuántos días calendario pasaron entre dos instantes, contados acá.
 *
 * Calendario y no "cada 24 horas", que es la otra forma de hacerlo y la que da
 * respuestas raras: una venta del lunes a las 23 y una mirada el martes a las 8
 * son nueve horas, pero para cualquiera que lleve una cuenta corriente eso es
 * "de ayer", un día. Se cuenta como lo contaría él.
 *
 * El mediodía UTC como ancla evita que el horario de verano —si alguna vez
 * vuelve— corra un día para un lado o para el otro.
 */
export const diasCalendario = (desdeIso: string, hastaIso: string): number => {
  const aMedioDia = (iso: string) => Date.parse(`${diaLocal(iso)}T12:00:00.000Z`);
  const d = Math.round((aMedioDia(hastaIso) - aMedioDia(desdeIso)) / 86_400_000);
  return d < 0 ? 0 : d;
};

/**
 * El día de acá, corrido N días, como `2026-09-14`. Para el gráfico de la
 * semana. Se ancla al mediodía por el mismo motivo que arriba.
 */
export const diaLocalDesplazado = (iso: string, dias: number): string => {
  const base = Date.parse(`${diaLocal(iso)}T12:00:00.000Z`);
  return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
};

/** El día de la semana (0 domingo) del día de acá. */
export const diaDeSemanaLocal = (iso: string): number =>
  new Date(`${diaLocal(iso)}T12:00:00.000Z`).getUTCDay();

/** Cómo lo escribe él: "domingo, 20 de septiembre". */
export const fechaLarga = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-AR', {
    timeZone: ZONA,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

/** "20/09/2026, 21:30" — para el comprobante. */
export const fechaYHora = (iso: string): string => {
  const { anio, mes, dia } = leer(iso);
  return `${dia}/${mes}/${anio}, ${horaLocal(iso)}`;
};

/** "20/09" — para listas donde la fecha acompaña pero no es lo principal. */
export const fechaCorta = (iso: string): string => {
  const { mes, dia } = leer(iso);
  return `${dia}/${mes}`;
};
