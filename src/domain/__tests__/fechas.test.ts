/**
 * Tests del día local.
 *
 * Es el tipo de error que no rompe nada y no avisa: la app abre, los números se
 * dibujan, y simplemente están mal a ciertas horas. Estos tests fijan los bordes
 * donde eso pasaba.
 */

import { describe, expect, it } from 'vitest';
import {
  diaLocal, diasCalendario, diaDeSemanaLocal, diaLocalDesplazado,
  fechaYHora, horaLocal, mismoDiaLocal,
} from '../fechas.ts';

describe('el día de acá, no el de UTC', () => {
  it('una venta de las 21:30 del sábado sigue siendo del sábado', () => {
    /*
     * El caso que motivó todo esto. Argentina está en UTC-3, así que las 21:30
     * del sábado 19 se guardan como 00:30 del domingo 20 en UTC. Mirando el
     * texto ISO, la venta era "de mañana" y el resumen del día se le ponía en
     * cero a las nueve de la noche, con el negocio abierto.
     */
    const sabado2130 = '2026-09-20T00:30:00.000Z';
    expect(diaLocal(sabado2130)).toBe('2026-09-19');
    expect(sabado2130.slice(0, 10)).toBe('2026-09-20'); // lo que se hacía antes
  });

  it('el día cambia a la medianoche de acá, no a las 21', () => {
    expect(diaLocal('2026-09-20T02:59:00.000Z')).toBe('2026-09-19'); // 23:59
    expect(diaLocal('2026-09-20T03:00:00.000Z')).toBe('2026-09-20'); // 00:00
  });

  it('dos ventas de la misma noche caen en el mismo día', () => {
    // 20:00 y 22:00 del sábado: la segunda cruza la medianoche UTC.
    expect(mismoDiaLocal('2026-09-19T23:00:00.000Z', '2026-09-20T01:00:00.000Z')).toBe(true);
  });

  it('la hora que se muestra es la de acá', () => {
    expect(horaLocal('2026-09-20T00:30:00.000Z')).toBe('21:30');
    expect(horaLocal('2026-09-20T03:00:00.000Z')).toBe('00:00'); // y no "24:00"
  });

  it('el comprobante lleva fecha y hora de acá', () => {
    expect(fechaYHora('2026-09-20T00:30:00.000Z')).toBe('19/09/2026, 21:30');
  });
});

describe('días de calendario', () => {
  it('de ayer a la tarde a hoy a la mañana es un día, no cero', () => {
    /*
     * Nueve horas de diferencia. Contando de a 24 horas daba 0 y la pantalla
     * decía "te debe hace 0 días" de algo de ayer. Él lo cuenta por calendario.
     */
    expect(diasCalendario('2026-09-18T20:00:00.000Z', '2026-09-19T11:00:00.000Z')).toBe(1);
  });

  it('el mismo día es cero', () => {
    expect(diasCalendario('2026-09-19T13:00:00.000Z', '2026-09-19T22:00:00.000Z')).toBe(0);
  });

  it('cuarenta y un días son cuarenta y uno', () => {
    expect(diasCalendario('2026-08-09T15:00:00.000Z', '2026-09-19T15:00:00.000Z')).toBe(41);
  });

  it('nunca da negativo', () => {
    expect(diasCalendario('2026-09-19T15:00:00.000Z', '2026-09-10T15:00:00.000Z')).toBe(0);
  });
});

describe('la semana del gráfico', () => {
  it('los siete días salen en orden y sin repetirse', () => {
    const hoy = '2026-09-20T02:00:00.000Z'; // 23:00 del sábado 19 acá
    const dias = Array.from({ length: 7 }, (_, i) => diaLocalDesplazado(hoy, i - 6));

    expect(dias).toEqual([
      '2026-09-13', '2026-09-14', '2026-09-15',
      '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19',
    ]);
    expect(new Set(dias).size).toBe(7);
  });

  it('el día de la semana es el de acá', () => {
    // Sábado 19 a las 23:00 de acá. En UTC ya es domingo.
    expect(diaDeSemanaLocal('2026-09-20T02:00:00.000Z')).toBe(6);
  });
});
