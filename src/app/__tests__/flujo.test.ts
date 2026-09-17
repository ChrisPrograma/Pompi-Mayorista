/**
 * Tests de flujo completo: las acciones del usuario sobre el estado real.
 *
 * Cubren el recorrido que hace en un día — cargar el auto, vender, cobrar,
 * entrar mercadería, decidir sobre los precios — y verifican que cada una
 * agregue filas y no pise ninguna.
 */

import { describe, expect, it } from 'vitest';
import { pesos } from '../../domain/money.ts';
import { calcularStock } from '../../domain/stock.ts';
import { saldoCliente } from '../../domain/saldos.ts';
import {
  altaCliente,
  aplicar,
  aplicarSugerencias,
  cargarAuto,
  clienteParecido,
  cobrar,
  costoDe,
  descartarSugerencias,
  entrarMercaderia,
  historialPrecios,
  precioDe,
  vender,
  type Ctx,
} from '../estado.ts';
import { construirSemilla, idsSecuenciales, semillaConDiaEnCurso } from '../semilla.ts';
import { vistaAuto, vistaDeudas, vistaHoy, vistaNumeros, vistaParaVender } from '../../ui/vistas.ts';

const HOY = '2026-09-15T14:00:00.000Z'; // un martes
const ctx = (): Ctx => ({ nuevoId: idsSecuenciales('t'), ahora: () => HOY });

describe('vender', () => {
  it('baja el stock del auto y deja el precio y el costo congelados', () => {
    const e0 = construirSemilla(HOY);
    const antes = calcularStock(e0.movimientos).get('p1')!.vehiculo;

    const e1 = aplicar(e0, vender(e0, {
      clienteId: 'c1',
      items: [{ productoId: 'p1', cantidad: 10 }],
      formaPago: 'efectivo',
    }, ctx()));

    expect(calcularStock(e1.movimientos).get('p1')!.vehiculo).toBe(antes - 10);
    // El depósito no se toca: vende de lo que lleva arriba del auto.
    expect(calcularStock(e1.movimientos).get('p1')!.deposito)
      .toBe(calcularStock(e0.movimientos).get('p1')!.deposito);

    const linea = e1.ventas.at(-1)!.items[0];
    expect(linea.precioUnitarioCent).toBe(precioDe(e0, 'p1'));
    expect(linea.costoUnitarioCent).toBe(costoDe(e0, 'p1'));
  });

  it('una venta a cuenta suma deuda; una en efectivo no', () => {
    const e0 = construirSemilla(HOY);
    const antes = saldoCliente('c6', e0.ventas, e0.pagos, HOY).saldoCent;

    const aCuenta = aplicar(e0, vender(e0, {
      clienteId: 'c6', items: [{ productoId: 'p3', cantidad: 2 }], formaPago: 'cuenta',
    }, ctx()));
    expect(saldoCliente('c6', aCuenta.ventas, aCuenta.pagos, HOY).saldoCent)
      .toBe(antes + pesos(12500) * 2);

    const contado = aplicar(e0, vender(e0, {
      clienteId: 'c6', items: [{ productoId: 'p3', cantidad: 2 }], formaPago: 'efectivo',
    }, ctx()));
    expect(saldoCliente('c6', contado.ventas, contado.pagos, HOY).saldoCent).toBe(antes);
  });

  it('no deja vender un producto sin precio vigente', () => {
    const e0 = construirSemilla(HOY);
    const sinPrecio = { ...e0, precios: e0.precios.filter((p) => p.productoId !== 'p1') };
    expect(() =>
      vender(sinPrecio, { clienteId: 'c1', items: [{ productoId: 'p1', cantidad: 1 }], formaPago: 'efectivo' }, ctx()),
    ).toThrow(/precio vigente/i);
  });
});

describe('alta de comercios', () => {
  it('con el nombre alcanza: el resto es opcional', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, altaCliente(e0, { nombre: '  Pet Shop La Plaza  ' }, ctx()));
    const nuevo = e1.clientes.at(-1)!;

    expect(e1.clientes).toHaveLength(e0.clientes.length + 1);
    expect(nuevo.nombre).toBe('Pet Shop La Plaza');   // recortado
    expect(nuevo.activo).toBe(true);
    expect(nuevo.zona).toBeUndefined();
    expect(nuevo.diaVisita).toBeUndefined();
  });

  it('guarda zona y día de visita cuando los cargan', () => {
    const e0 = construirSemilla(HOY);
    const e1 = aplicar(e0, altaCliente(e0,
      { nombre: 'Vet. del Parque', zona: 'Ciudadela', diaVisita: 4 }, ctx()));
    const nuevo = e1.clientes.at(-1)!;

    expect(nuevo.zona).toBe('Ciudadela');
    expect(nuevo.diaVisita).toBe(4);
  });

  it('un comercio nuevo aparece en la ruta del día que le tocó', () => {
    const e0 = construirSemilla(HOY);            // HOY es martes (día 2)
    const e1 = aplicar(e0, altaCliente(e0,
      { nombre: 'Forrajería Nueva', zona: 'Padua', diaVisita: 2 }, ctx()));

    const enRuta = vistaHoy(e1, HOY).ruta.map((r) => r.nombre);
    expect(enRuta).toContain('Forrajería Nueva');
  });

  it('se le puede vender apenas queda cargado', () => {
    let e = construirSemilla(HOY);
    e = aplicar(e, altaCliente(e, { nombre: 'Pet Shop Recién Abierto' }, ctx()));
    const nuevo = e.clientes.at(-1)!;

    e = aplicar(e, vender(e, {
      clienteId: nuevo.id,
      items: [{ productoId: 'p1', cantidad: 5 }],
      formaPago: 'cuenta',
    }, ctx()));

    const deuda = vistaDeudas(e, HOY).lista.find((d) => d.clienteId === nuevo.id);
    expect(deuda?.saldoCent).toBe(pesos(3200) * 5);
  });

  it('rechaza un nombre vacío en vez de crear un comercio sin nombre', () => {
    const e0 = construirSemilla(HOY);
    expect(() => altaCliente(e0, { nombre: '   ' }, ctx())).toThrow(/nombre/i);
  });

  it('avisa si ya hay un comercio con ese nombre, sin bloquearlo', () => {
    const e0 = construirSemilla(HOY);
    expect(clienteParecido(e0, 'pet shop huellitas')!.id).toBe('c1');
    expect(clienteParecido(e0, '  Mascotas del Oeste ')!.id).toBe('c2');
    expect(clienteParecido(e0, 'Forrajería Inexistente')).toBeNull();
  });

  it('un alta repetida por un reintento no duplica el comercio', () => {
    const e0 = construirSemilla(HOY);
    const r = altaCliente(e0, { nombre: 'Pet Shop Doble' }, ctx());
    const e1 = aplicar(aplicar(e0, r), r);        // el mismo resultado, dos veces
    expect(e1.clientes.filter((c) => c.nombre === 'Pet Shop Doble')).toHaveLength(1);
  });
});

describe('cobrar', () => {
  it('baja el saldo del cliente sin tocar la venta original', () => {
    const e0 = construirSemilla(HOY);
    const ventaOriginal = { ...e0.ventas.find((v) => v.clienteId === 'c3')! };
    const antes = saldoCliente('c3', e0.ventas, e0.pagos, HOY).saldoCent;

    const e1 = aplicar(e0, cobrar(e0, {
      clienteId: 'c3', montoCent: pesos(10000), medio: 'efectivo',
    }, ctx()));

    expect(saldoCliente('c3', e1.ventas, e1.pagos, HOY).saldoCent).toBe(antes - pesos(10000));
    // La venta quedó exactamente igual: el cobro es una fila nueva.
    expect(e1.ventas.find((v) => v.id === ventaOriginal.id)).toEqual(ventaOriginal);
  });
});

describe('cargar el auto', () => {
  it('mueve del depósito al vehículo sin cambiar el total', () => {
    const e0 = construirSemilla(HOY);
    const totalAntes = calcularStock(e0.movimientos).get('p13')!.total;

    const { faltantes } = vistaAuto(e0);
    const p13 = faltantes.find((f) => f.productoId === 'p13')!;
    expect(p13.aCargar).toBeGreaterThan(0);

    const e1 = aplicar(e0, cargarAuto(e0, [{ productoId: 'p13', cantidad: p13.aCargar }], ctx()));
    const s = calcularStock(e1.movimientos).get('p13')!;

    expect(s.vehiculo).toBe(p13.enVehiculo + p13.aCargar);
    expect(s.total).toBe(totalAntes); // no se creó ni se destruyó mercadería
  });

  it('después de cargar todo lo sugerido, no queda faltante', () => {
    const e0 = construirSemilla(HOY);
    const { faltantes } = vistaAuto(e0);
    const e1 = aplicar(e0, cargarAuto(e0,
      faltantes.map((f) => ({ productoId: f.productoId, cantidad: f.aCargar })), ctx()));
    expect(vistaAuto(e1).totalACargar).toBe(0);
  });
});

describe('entrar mercadería y decidir precios', () => {
  it('sube el stock del depósito y deja una sugerencia por cada costo que subió', () => {
    const e0 = construirSemilla(HOY);
    const depAntes = calcularStock(e0.movimientos).get('p1')!.deposito;

    const e1 = aplicar(e0, entrarMercaderia(e0, {
      proveedorId: 'v1',
      items: [
        { productoId: 'p1', cantidad: 36, costoUnitarioCent: pesos(2150) }, // sube
        { productoId: 'p2', cantidad: 12, costoUnitarioCent: pesos(2600) }, // igual
      ],
      condicionPago: 'cuenta',
    }, ctx()));

    expect(calcularStock(e1.movimientos).get('p1')!.deposito).toBe(depAntes + 36);

    const pendientes = e1.sugerencias.filter((s) => s.estado === 'pendiente');
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].productoId).toBe('p1');
    expect(pendientes[0].precioSugeridoCent).toBe(pesos(3600));

    // Y hasta que él decida, el precio NO cambió.
    expect(precioDe(e1, 'p1')).toBe(pesos(3200));
  });

  it('aplicar la sugerencia abre un precio nuevo y cierra el anterior', () => {
    let e = construirSemilla(HOY);
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId: 'v1',
      items: [{ productoId: 'p1', cantidad: 36, costoUnitarioCent: pesos(2150) }],
      condicionPago: 'cuenta',
    }, ctx()));

    const historialAntes = historialPrecios(e, 'p1').length;
    const sug = e.sugerencias.find((s) => s.estado === 'pendiente')!;

    e = aplicar(e, aplicarSugerencias(e, [sug.id], ctx()));

    expect(precioDe(e, 'p1')).toBe(pesos(3600));
    const h = historialPrecios(e, 'p1');
    expect(h).toHaveLength(historialAntes + 1);
    // Exactamente uno vigente, el resto cerrados: la regla del índice único.
    expect(h.filter((p) => p.vigenteHasta === null)).toHaveLength(1);
    expect(h.filter((p) => p.precioCent === pesos(3200))[0].vigenteHasta).not.toBeNull();
    expect(e.sugerencias.find((s) => s.id === sug.id)!.estado).toBe('aplicada');
  });

  it('descartarla deja el precio como estaba y no vuelve a molestar', () => {
    let e = construirSemilla(HOY);
    e = aplicar(e, entrarMercaderia(e, {
      proveedorId: 'v1',
      items: [{ productoId: 'p1', cantidad: 10, costoUnitarioCent: pesos(2150) }],
      condicionPago: 'contado',
    }, ctx()));
    const sug = e.sugerencias.find((s) => s.estado === 'pendiente')!;

    e = aplicar(e, descartarSugerencias(e, [sug.id], ctx()));

    expect(precioDe(e, 'p1')).toBe(pesos(3200));
    expect(e.sugerencias.filter((s) => s.estado === 'pendiente')).toHaveLength(0);
  });

  it('el margen cae si NO actualiza el precio: es la plata que pierde sin darse cuenta', () => {
    const e0 = construirSemilla(HOY);
    const precio = precioDe(e0, 'p1')!;
    const margenAntes = (precio - costoDe(e0, 'p1')!) / precio;

    const e1 = aplicar(e0, entrarMercaderia(e0, {
      proveedorId: 'v1',
      items: [{ productoId: 'p1', cantidad: 36, costoUnitarioCent: pesos(2150) }],
      condicionPago: 'cuenta',
    }, ctx()));

    const margenDespues = (precio - costoDe(e1, 'p1')!) / precio;
    expect(margenDespues).toBeLessThan(margenAntes);
  });
});

describe('las pantallas muestran lo que corresponde', () => {
  it('la pantalla de hoy suma lo cobrado y lo que está en la calle', () => {
    const e = semillaConDiaEnCurso(HOY);
    const v = vistaHoy(e, HOY);

    // Hoy hubo dos ventas: una en efectivo (cobrada) y una a cuenta (no).
    expect(v.ventasDeHoy).toHaveLength(2);
    expect(v.cobradoHoyCent).toBeGreaterThan(0);
    expect(v.vendidoHoyCent).toBeGreaterThan(v.cobradoHoyCent);
    expect(v.misiones.venta).toBe(true);
    expect(v.misiones.cobro).toBe(false);
  });

  it('la ruta del martes trae solo los clientes de ese día', () => {
    const v = vistaHoy(semillaConDiaEnCurso(HOY), HOY);
    expect(v.ruta.map((r) => r.clienteId).sort()).toEqual(['c1', 'c2', 'c3']);
    expect(v.ruta.find((r) => r.clienteId === 'c1')!.visitado).toBe(true);
  });

  it('las deudas salen ordenadas de más vieja a más nueva', () => {
    const { lista, totalCent } = vistaDeudas(construirSemilla(HOY), HOY);
    const dias = lista.map((d) => d.dias);
    expect(dias).toEqual([...dias].sort((a, b) => b - a));
    expect(lista[0].antiguedad).toBe('muy_atrasado');
    expect(totalCent).toBe(lista.reduce((a, d) => a + d.saldoCent, 0));
  });

  it('la alerta de hoy es la deuda más vieja pasada del umbral', () => {
    const v = vistaHoy(construirSemilla(HOY), HOY);
    expect(v.alertaDeuda!.clienteId).toBe('c4');
    expect(v.alertaDeuda!.dias).toBe(41);
  });

  it('solo se puede vender lo que está arriba del auto', () => {
    const e = construirSemilla(HOY);
    const vendibles = vistaParaVender(e);
    expect(vendibles.length).toBeGreaterThan(0);
    expect(vendibles.every((p) => p.enVehiculo > 0)).toBe(true);
  });

  it('los números del mes usan el costo congelado de cada venta', () => {
    const e = semillaConDiaEnCurso(HOY);
    const n = vistaNumeros(e, HOY, 30);

    expect(n.gananciaCent).toBe(n.ventasCent - n.costoCent);
    expect(n.margen).toBeGreaterThan(0);
    expect(n.ultimos7).toHaveLength(7);
    expect(n.ultimos7.at(-1)!.esHoy).toBe(true);
    expect(n.masVendidos.length).toBeGreaterThan(0);
    expect(n.masRentable).not.toBeNull();
  });

  it('una compra posterior no altera los números de las ventas ya hechas', () => {
    const e0 = semillaConDiaEnCurso(HOY);
    const antes = vistaNumeros(e0, HOY, 30);

    const e1 = aplicar(e0, entrarMercaderia(e0, {
      proveedorId: 'v1',
      items: e0.productos.map((p) => ({
        productoId: p.id, cantidad: 10, costoUnitarioCent: pesos(99999),
      })),
      condicionPago: 'cuenta',
    }, ctx()));

    const despues = vistaNumeros(e1, HOY, 30);
    expect(despues.gananciaCent).toBe(antes.gananciaCent);
    expect(despues.costoCent).toBe(antes.costoCent);
  });
});
