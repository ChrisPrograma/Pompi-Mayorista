import { describe, expect, it } from 'vitest';
import { formatear, pesos, porCantidad, redondearA, sumar, MoneyError } from '../money.ts';
import {
  costoPromedio,
  costoUltimo,
  precioPorMarkup,
  sugerirPrecio,
  PrecioError,
} from '../precios.ts';
import type { CompraItem } from '../types.ts';

describe('dinero en enteros', () => {
  it('convierte pesos a centavos sin error de punto flotante', () => {
    expect(pesos(3200)).toBe(320000);
    expect(pesos(0.1) + pesos(0.2)).toBe(pesos(0.3)); // el clásico 0.1+0.2 !== 0.3
  });

  it('un total de venta con muchas líneas da exacto', () => {
    const lineas = [
      porCantidad(pesos(1700), 48),
      porCantidad(pesos(5500), 20),
      porCantidad(pesos(2400), 30),
      porCantidad(pesos(12500), 6),
    ];
    expect(sumar(...lineas)).toBe(pesos(1700 * 48 + 5500 * 20 + 2400 * 30 + 12500 * 6));
  });

  it('rechaza importes que no sean enteros de centavos', () => {
    expect(() => sumar(1.5)).toThrow(MoneyError);
  });

  it('redondea al múltiplo comercial', () => {
    expect(redondearA(pesos(3576), pesos(100))).toBe(pesos(3600));
    expect(redondearA(pesos(3524), pesos(100))).toBe(pesos(3500));
    expect(redondearA(pesos(3576), pesos(50))).toBe(pesos(3600));
  });

  it('formatea en pesos argentinos', () => {
    expect(formatear(pesos(148500)).replace(/ /g, ' ')).toMatch(/148\.500/);
  });
});

describe('sugerencia de precio', () => {
  it('mantiene el margen cuando sube el costo', () => {
    // Collar: costaba $1.900, se vendía a $3.200 (margen 40,6%).
    // Llega a $2.150.
    const s = sugerirPrecio({
      precioVigenteCent: pesos(3200),
      costoAnteriorCent: pesos(1900),
      costoNuevoCent: pesos(2150),
    });

    expect(s.precioSugeridoCent).toBe(pesos(3600));
    expect(s.margenAnterior).toBeCloseTo(0.40625, 5);
    // El margen que se le muestra es el de DESPUÉS del redondeo, no el teórico.
    expect(s.margenResultante).toBeCloseTo((360000 - 215000) / 360000, 5);
  });

  it('el margen resultante nunca queda por debajo de lo razonable por el redondeo', () => {
    const s = sugerirPrecio({
      precioVigenteCent: pesos(12500),
      costoAnteriorCent: pesos(7800),
      costoNuevoCent: pesos(8900),
    });
    expect(s.precioSugeridoCent).toBe(pesos(14300));
    expect(s.margenResultante).toBeGreaterThan(0.3);
  });

  it('nunca sugiere un precio por debajo del costo nuevo', () => {
    const s = sugerirPrecio({
      precioVigenteCent: pesos(1000),
      costoAnteriorCent: pesos(950),
      costoNuevoCent: pesos(3000),
      redondeoCent: pesos(1000),
    });
    expect(s.precioSugeridoCent).toBeGreaterThanOrEqual(pesos(3000));
  });

  it('rechaza costos o precios inválidos en vez de devolver cualquier cosa', () => {
    expect(() =>
      sugerirPrecio({ precioVigenteCent: pesos(1000), costoAnteriorCent: 0, costoNuevoCent: pesos(500) }),
    ).toThrow(PrecioError);
  });

  it('el markup sirve para productos nuevos, sin margen histórico', () => {
    expect(precioPorMarkup(pesos(2150), 1.7)).toBe(pesos(3700));
  });
});

describe('los tres costos', () => {
  const fechas: Record<string, string> = {
    'c-1': '2026-05-02T00:00:00Z',
    'c-2': '2026-07-11T00:00:00Z',
    'c-3': '2026-09-13T00:00:00Z',
  };
  const fechaDeCompra = (id: string) => fechas[id];

  const items: CompraItem[] = [
    { id: 'i1', compraId: 'c-1', productoId: 'p1', cantidad: 100, costoUnitarioCent: pesos(1600) },
    { id: 'i2', compraId: 'c-2', productoId: 'p1', cantidad: 60, costoUnitarioCent: pesos(1900) },
    { id: 'i3', compraId: 'c-3', productoId: 'p1', cantidad: 40, costoUnitarioCent: pesos(2150) },
  ];

  it('el último costo es el de reposición: sirve para fijar el precio de venta', () => {
    expect(costoUltimo(items, fechaDeCompra, 'p1')).toBe(pesos(2150));
  });

  it('el promedio ponderado es más bajo: sirve para valuar lo que tiene guardado', () => {
    const esperado = Math.round(
      (100 * pesos(1600) + 60 * pesos(1900) + 40 * pesos(2150)) / 200,
    );
    expect(costoPromedio(items, 'p1')).toBe(esperado);
    expect(costoPromedio(items, 'p1')!).toBeLessThan(costoUltimo(items, fechaDeCompra, 'p1')!);
  });

  it('devuelve null si nunca se compró, en vez de asumir cero', () => {
    expect(costoUltimo(items, fechaDeCompra, 'inexistente')).toBeNull();
    expect(costoPromedio(items, 'inexistente')).toBeNull();
  });
});
