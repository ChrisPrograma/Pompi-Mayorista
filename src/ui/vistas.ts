/**
 * Modelos de vista: funciones puras que arman exactamente lo que cada pantalla
 * muestra, a partir del estado.
 *
 * Están separadas de los componentes de React a propósito: así toda la lógica
 * que decide qué ve el usuario se puede testear sin navegador, y los componentes
 * quedan reducidos a pintar. Si una pantalla muestra un número equivocado, el
 * bug está acá y hay un test que lo atrapa.
 */

import type { Cent } from '../domain/money.ts';
import { gananciaDelPeriodo } from '../domain/precios.ts';
import { clasificar, diasEntre, saldoCliente, type Antiguedad } from '../domain/saldos.ts';
import { calcularCarga, calcularStock } from '../domain/stock.ts';
import type { Uuid } from '../domain/types.ts';
import { costoDe, historialPrecios, precioDe, type EstadoApp } from '../app/estado.ts';

const mismoDia = (a: string, b: string): boolean => a.slice(0, 10) === b.slice(0, 10);

// ---------------------------------------------------------------------------
// Hoy
// ---------------------------------------------------------------------------

export interface DeudaVista {
  clienteId: Uuid;
  nombre: string;
  zona?: string;
  saldoCent: Cent;
  dias: number;
  antiguedad: Antiguedad;
}

export interface VistaHoy {
  cobradoHoyCent: Cent;
  vendidoHoyCent: Cent;
  enLaCalleCent: Cent;
  /** La deuda más vieja que pasó el umbral. Es la alerta que se muestra arriba. */
  alertaDeuda: DeudaVista | null;
  faltanEnAuto: number;
  ruta: { clienteId: Uuid; nombre: string; zona?: string; visitado: boolean; saldoCent: Cent }[];
  ventasDeHoy: { id: Uuid; cliente: string; hora: string; totalCent: Cent; cobrado: boolean; items: number }[];
  misiones: { venta: boolean; cobro: boolean; carga: boolean };
}

export const vistaHoy = (e: EstadoApp, hoyIso: string): VistaHoy => {
  const deudas = vistaDeudas(e, hoyIso);
  const diaSemana = new Date(hoyIso).getDay();

  const ventasHoy = e.ventas.filter((v) => mismoDia(v.fecha, hoyIso));
  const pagosHoy = e.pagos.filter((p) => mismoDia(p.fecha, hoyIso));

  const cobradoHoyCent =
    ventasHoy.reduce((a, v) => a + v.cobradoCent, 0) +
    pagosHoy.reduce((a, p) => a + p.montoCent, 0);

  const vencidas = deudas.lista.filter((d) => d.dias > e.parametros.diasMuyAtrasado);

  const ruta = e.clientes
    .filter((c) => c.activo && c.diaVisita === diaSemana)
    .map((c) => ({
      clienteId: c.id,
      nombre: c.nombre,
      zona: c.zona,
      visitado: ventasHoy.some((v) => v.clienteId === c.id),
      saldoCent: deudas.lista.find((d) => d.clienteId === c.id)?.saldoCent ?? 0,
    }));

  const carga = calcularCarga(e.productos, e.movimientos);

  return {
    cobradoHoyCent,
    vendidoHoyCent: ventasHoy.reduce((a, v) => a + v.totalCent, 0),
    enLaCalleCent: deudas.totalCent,
    alertaDeuda: vencidas[0] ?? null,
    faltanEnAuto: carga.reduce((a, c) => a + c.aCargar, 0),
    ruta,
    ventasDeHoy: ventasHoy
      .slice()
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((v) => ({
        id: v.id,
        cliente: e.clientes.find((c) => c.id === v.clienteId)?.nombre ?? '—',
        hora: v.fecha.slice(11, 16),
        totalCent: v.totalCent,
        cobrado: v.cobradoCent >= v.totalCent,
        items: v.items.reduce((a, i) => a + i.cantidad, 0),
      })),
    misiones: {
      venta: ventasHoy.length > 0,
      cobro: pagosHoy.length > 0,
      carga: carga.length === 0,
    },
  };
};

// ---------------------------------------------------------------------------
// Me deben
// ---------------------------------------------------------------------------

export const vistaDeudas = (
  e: EstadoApp,
  hoyIso: string,
): { lista: DeudaVista[]; alDia: { clienteId: Uuid; nombre: string; zona?: string }[]; totalCent: Cent } => {
  const lista: DeudaVista[] = [];
  const alDia: { clienteId: Uuid; nombre: string; zona?: string }[] = [];

  for (const c of e.clientes.filter((x) => x.activo)) {
    const s = saldoCliente(c.id, e.ventas, e.pagos, hoyIso);
    if (s.saldoCent > 0) {
      const dias = s.deudaMasViejaIso ? diasEntre(s.deudaMasViejaIso, hoyIso) : 0;
      lista.push({
        clienteId: c.id,
        nombre: c.nombre,
        zona: c.zona,
        saldoCent: s.saldoCent,
        dias,
        antiguedad: clasificar(dias, {
          atrasado: e.parametros.diasAtrasado,
          muyAtrasado: e.parametros.diasMuyAtrasado,
        }),
      });
    } else {
      alDia.push({ clienteId: c.id, nombre: c.nombre, zona: c.zona });
    }
  }

  // De más viejo a más nuevo: es el orden en el que hay que salir a cobrar.
  lista.sort((a, b) => b.dias - a.dias);

  return { lista, alDia, totalCent: lista.reduce((a, d) => a + d.saldoCent, 0) };
};

// ---------------------------------------------------------------------------
// Vender / productos / auto
// ---------------------------------------------------------------------------

export interface ProductoVista {
  id: Uuid;
  /** El código de su planilla. Sirve para ordenar y para buscar. */
  codigo?: string;
  nombre: string;
  variante?: string;
  categoria?: string;
  precioCent: Cent | null;
  costoCent: Cent | null;
  gananciaCent: Cent | null;
  margen: number | null;
  enDeposito: number;
  enVehiculo: number;
  historial: { desde: string; hasta: string | null; precioCent: Cent }[];
}

export const vistaProductos = (e: EstadoApp): ProductoVista[] => {
  const stock = calcularStock(e.movimientos);
  return e.productos
    .filter((p) => p.activo)
    .map((p) => {
      const precioCent = precioDe(e, p.id);
      const costoCent = costoDe(e, p.id);
      const s = stock.get(p.id);
      const ganancia = precioCent !== null && costoCent !== null ? precioCent - costoCent : null;
      return {
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        variante: p.variante,
        categoria: p.categoria,
        precioCent,
        costoCent,
        gananciaCent: ganancia,
        margen: ganancia !== null && precioCent ? ganancia / precioCent : null,
        enDeposito: s?.deposito ?? 0,
        enVehiculo: s?.vehiculo ?? 0,
        historial: historialPrecios(e, p.id).map((h) => ({
          desde: h.vigenteDesde,
          hasta: h.vigenteHasta,
          precioCent: h.precioCent,
        })),
      };
    });
};

/** Lo que se puede vender hoy: solo lo que está arriba del auto. */
export const vistaParaVender = (e: EstadoApp): ProductoVista[] =>
  vistaProductos(e).filter((p) => p.enVehiculo > 0 && p.precioCent !== null);

export interface CargaVista {
  productoId: Uuid;
  nombre: string;
  enVehiculo: number;
  enDeposito: number;
  sugerido: number;
  aCargar: number;
  sinStock: number;
}

export const vistaAuto = (e: EstadoApp): { faltantes: CargaVista[]; totalACargar: number } => {
  const stock = calcularStock(e.movimientos);
  const faltantes = calcularCarga(e.productos, e.movimientos).map((c) => ({
    productoId: c.productoId,
    nombre: e.productos.find((p) => p.id === c.productoId)?.nombre ?? '—',
    enVehiculo: c.enVehiculo,
    enDeposito: stock.get(c.productoId)?.deposito ?? 0,
    sugerido: c.sugerido,
    aCargar: c.aCargar,
    sinStock: c.sinStock,
  }));
  return { faltantes, totalACargar: faltantes.reduce((a, f) => a + f.aCargar, 0) };
};

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------

export interface VistaNumeros {
  ventasCent: Cent;
  costoCent: Cent;
  gananciaCent: Cent;
  margen: number;
  ultimos7: { diaIso: string; etiqueta: string; ventaCent: Cent; esHoy: boolean }[];
  masVendidos: { productoId: Uuid; nombre: string; unidades: number }[];
  masRentable: { productoId: Uuid; nombre: string; gananciaCent: Cent } | null;
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const vistaNumeros = (e: EstadoApp, hoyIso: string, dias = 30): VistaNumeros => {
  const desde = new Date(Date.parse(hoyIso) - dias * 86_400_000).toISOString();
  const delPeriodo = e.ventas.filter((v) => v.fecha >= desde);
  const g = gananciaDelPeriodo(delPeriodo);

  const ultimos7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.parse(hoyIso) - (6 - i) * 86_400_000);
    const diaIso = d.toISOString().slice(0, 10);
    return {
      diaIso,
      etiqueta: i === 6 ? 'Hoy' : DIAS[d.getDay()],
      ventaCent: e.ventas
        .filter((v) => v.fecha.slice(0, 10) === diaIso)
        .reduce((a, v) => a + v.totalCent, 0),
      esHoy: i === 6,
    };
  });

  const unidades = new Map<Uuid, number>();
  for (const v of delPeriodo) {
    for (const it of v.items) {
      unidades.set(it.productoId, (unidades.get(it.productoId) ?? 0) + it.cantidad);
    }
  }

  const masVendidos = [...unidades.entries()]
    .map(([productoId, u]) => ({
      productoId,
      nombre: e.productos.find((p) => p.id === productoId)?.nombre ?? '—',
      unidades: u,
    }))
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, 5);

  const conGanancia = vistaProductos(e)
    .filter((p) => p.gananciaCent !== null)
    .sort((a, b) => (b.gananciaCent ?? 0) - (a.gananciaCent ?? 0));

  return {
    ventasCent: g.ventaCent,
    costoCent: g.costoCent,
    gananciaCent: g.gananciaCent,
    margen: g.margen,
    ultimos7,
    masVendidos,
    masRentable: conGanancia[0]
      ? {
          productoId: conGanancia[0].id,
          nombre: conGanancia[0].nombre,
          gananciaCent: conGanancia[0].gananciaCent as Cent,
        }
      : null,
  };
};

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export interface ProveedorVista {
  id: Uuid;
  nombre: string;
  zona?: string;
  rubro?: string;
  deboCent: Cent;
  /** Fecha de la compra en cuenta más vieja, o `undefined` si no debe nada. */
  deudaDesde?: string;
  productos: number;
}

export const vistaProveedores = (
  e: EstadoApp,
): { lista: ProveedorVista[]; totalCent: Cent } => {
  const lista = e.proveedores
    .filter((p) => p.activo)
    .map((p) => {
      const enCuenta = e.compras
        .filter((c) => c.proveedorId === p.id && c.condicionPago === 'cuenta')
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      return {
        id: p.id,
        nombre: p.nombre,
        zona: p.zona,
        rubro: p.rubro,
        deboCent: enCuenta.reduce((a, c) => a + c.totalCent, 0),
        // La compra en cuenta más vieja sin saldar. Es lo que hace que se pueda
        // ordenar por antigüedad de deuda, igual que con los comercios.
        deudaDesde: enCuenta[0]?.fecha,
        productos: e.productos.filter((x) => x.proveedorId === p.id && x.activo).length,
      };
    });
  return { lista, totalCent: lista.reduce((a, p) => a + p.deboCent, 0) };
};

/** Las sugerencias de precio que esperan una decisión. */
export const sugerenciasPendientes = (e: EstadoApp) =>
  e.sugerencias
    .filter((s) => s.estado === 'pendiente')
    .map((s) => ({
      ...s,
      nombre: e.productos.find((p) => p.id === s.productoId)?.nombre ?? '—',
    }));
