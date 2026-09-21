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
import {
  clasificar, diasEntre, productoMasComprado, saldoCliente, type Antiguedad,
} from '../domain/saldos.ts';
import {
  dentroDelRango, diaDeSemanaLocal, diaLocal, diaLocalDesplazado, fechaCorta, horaLocal,
  mismoDiaLocal, type Rango,
} from '../domain/fechas.ts';
import { calcularStock } from '../domain/stock.ts';
import type { Compra, Uuid, Venta } from '../domain/types.ts';
import type { DatosRecibo } from './recibo.ts';
import { costoDe, historialPrecios, precioDe, type EstadoApp } from '../app/estado.ts';

/*
 * "Mismo día" es el día de ACÁ, no el de UTC. Antes esto comparaba los diez
 * primeros caracteres del texto ISO, que son el día en UTC: a las 21 de
 * Argentina ya era mañana allá, y el resumen del día se le reseteaba mientras
 * todavía estaba vendiendo. Ver `src/domain/fechas.ts`.
 */
const mismoDia = mismoDiaLocal;

/**
 * Una venta anulada no cuenta para ningún número, y tampoco aparece entre las
 * del día: tiene su propio bloque, `anuladasDelRango`.
 *
 * No suma en la caja del día, ni en la ganancia, ni en la deuda del comercio, ni
 * cuenta como "hoy hiciste una venta". La deuda y la ganancia están protegidas
 * más adentro, en `saldoCliente` y `gananciaDelPeriodo`; acá se cuidan los
 * números que se arman en esta capa.
 */
const cuenta = (v: { anuladaEn?: string }): boolean => !v.anuladaEn;

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
  ruta: { clienteId: Uuid; nombre: string; zona?: string; visitado: boolean; saldoCent: Cent }[];
  ventasDeHoy: {
    id: Uuid;
    cliente: string;
    hora: string;
    totalCent: Cent;
    cobradoCent: Cent;
    /**
     * Tres estados. Eran dos —cobrado o debiendo— hasta que el pago parcial
     * agregó el tercero. No hay un cuarto para "anulada": las anuladas no
     * entran en esta lista, tienen su propio bloque.
     */
    estado: 'cobrado' | 'parcial' | 'debe';
    items: number;
  }[];
  /**
   * Las entradas de mercadería del rango elegido (por defecto, el mes).
   *
   * Era "del día" y se quedaba corto: una entrada se revisa cuando llega la
   * factura del proveedor, que puede ser una semana después. El rango lo elige
   * él desde la pantalla y no recarga nada — es la misma vista, recalculada.
   */
  ingresosDelRango: IngresoVista[];
  ingresadoDelRangoCent: Cent;
  /**
   * Lo anulado en el MES calendario en curso, ventas e ingresos juntos.
   *
   * Va en su propio bloque y no mezclado con lo del día, por dos motivos. Uno:
   * una anulación no es actividad del día — es la corrección de algo que puede
   * ser de hace dos semanas. Dos: mezclada, ensucia el número de arriba, y ese
   * número es lo primero que él mira.
   *
   * Se limpia solo al cambiar de mes. El 1° de octubre desaparecen las de
   * septiembre, sin que nadie toque nada y sin que se borre un solo dato: la
   * venta anulada sigue entera en su ficha y en la base.
   */
  anuladasDelRango: AnulacionVista[];
  /** El rango con el que se armó esta vista, para que la pantalla lo muestre. */
  rango: Rango;
  /**
   * El día en dos pasos. Era en tres: el tercero era dejar el auto cargado, y se
   * fue junto con el auto.
   */
  misiones: { venta: boolean; cobro: boolean };
}

export interface AnulacionVista {
  id: Uuid;
  /** Qué se anuló: una venta a un comercio, o un ingreso de un proveedor. */
  tipo: 'venta' | 'ingreso';
  /** El comercio o el proveedor, según el tipo. */
  conQuien: string;
  totalCent: Cent;
  /** Cuándo pasó lo que se anuló. */
  fecha: string;
  /** Cuándo se anuló. Es la fecha por la que se ordena y se filtra el bloque. */
  anuladaEn: string;
}

export interface IngresoVista {
  id: Uuid;
  proveedor: string;
  /** El día de la entrada. Con el rango en semana o mes, la hora sola no ubica. */
  fecha: string;
  hora: string;
  totalCent: Cent;
  condicionPago: 'contado' | 'cuenta';
  /** Cuántas unidades entraron en total. */
  unidades: number;
  /** Cuántos productos distintos, para el resumen de la tarjeta. */
  productos: number;
  anulada: boolean;
}

/**
 * Los ingresos de un día, o todos los de un proveedor.
 *
 * Las compras anuladas NO se esconden. Esconderlas sería lo cómodo y lo
 * equivocado: él anuló algo y tiene que poder ver qué anuló, sobre todo si se
 * equivocó al anular. Salen marcadas y con el total tachado.
 */
export const vistaIngresos = (e: EstadoApp, compras: Compra[]): IngresoVista[] =>
  compras
    .slice()
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((c) => ({
      id: c.id,
      proveedor: c.proveedorId
        ? e.proveedores.find((p) => p.id === c.proveedorId)?.nombre ?? '—'
        : 'Sin proveedor',
      fecha: c.fecha,
      hora: horaLocal(c.fecha),
      totalCent: c.totalCent,
      condicionPago: c.condicionPago,
      unidades: c.items.reduce((a, i) => a + i.cantidad, 0),
      productos: c.items.length,
      anulada: Boolean(c.anuladaEn),
    }));

/**
 * Lo anulado en el mes calendario en curso.
 *
 * Se filtra por la fecha de ANULACIÓN, no por la de la venta o la compra. Una
 * venta del 3 de septiembre anulada el 18 aparece acá todo septiembre, porque lo
 * que él necesita revisar es la corrección, no el hecho original.
 *
 * De más reciente a más vieja: lo último que anuló es lo que más probablemente
 * quiera mirar, sobre todo si se equivocó al anular.
 */
export const anulacionesDelRango = (
  e: EstadoApp,
  hoyIso: string,
  rango: Rango = 'mes',
): AnulacionVista[] => {
  const ventas: AnulacionVista[] = e.ventas
    .filter((v) => v.anuladaEn && dentroDelRango(v.anuladaEn, hoyIso, rango))
    .map((v) => ({
      id: v.id,
      tipo: 'venta' as const,
      conQuien: e.clientes.find((c) => c.id === v.clienteId)?.nombre ?? '—',
      totalCent: v.totalCent,
      fecha: v.fecha,
      anuladaEn: v.anuladaEn!,
    }));

  const ingresos: AnulacionVista[] = e.compras
    .filter((c) => c.anuladaEn && dentroDelRango(c.anuladaEn, hoyIso, rango))
    .map((c) => ({
      id: c.id,
      tipo: 'ingreso' as const,
      conQuien: c.proveedorId
        ? e.proveedores.find((p) => p.id === c.proveedorId)?.nombre ?? '—'
        : 'Sin proveedor',
      totalCent: c.totalCent,
      fecha: c.fecha,
      anuladaEn: c.anuladaEn!,
    }));

  return [...ventas, ...ingresos].sort((a, b) => b.anuladaEn.localeCompare(a.anuladaEn));
};

export const vistaHoy = (e: EstadoApp, hoyIso: string, rango: Rango = 'mes'): VistaHoy => {
  const deudas = vistaDeudas(e, hoyIso);
  const diaSemana = diaDeSemanaLocal(hoyIso);

  // Las del día que valen. Las anuladas salen por `anuladasDelRango`.
  const valenHoy = e.ventas.filter((v) => cuenta(v) && mismoDia(v.fecha, hoyIso));
  const pagosHoy = e.pagos.filter((p) => mismoDia(p.fecha, hoyIso));
  /*
   * Las entradas del rango, no del día. Las anuladas quedan afuera de esta lista
   * y aparecen en el bloque de anulados, que es donde él las busca: mezcladas
   * acá ensuciarían el total de lo que de verdad entró.
   */
  const comprasDelRango = e.compras.filter(
    (c) => !c.anuladaEn && dentroDelRango(c.fecha, hoyIso, rango),
  );

  const cobradoHoyCent =
    valenHoy.reduce((a, v) => a + v.cobradoCent, 0) +
    pagosHoy.reduce((a, p) => a + p.montoCent, 0);

  const vencidas = deudas.lista.filter((d) => d.dias > e.parametros.diasMuyAtrasado);

  const ruta = e.clientes
    .filter((c) => c.activo && c.diaVisita === diaSemana)
    .map((c) => ({
      clienteId: c.id,
      nombre: c.nombre,
      zona: c.zona,
      // Una venta anulada no es una visita: si la anuló, ese comercio sigue
      // sin atender y tiene que seguir apareciendo como pendiente en la ruta.
      visitado: valenHoy.some((v) => v.clienteId === c.id),
      saldoCent: deudas.lista.find((d) => d.clienteId === c.id)?.saldoCent ?? 0,
    }));

  return {
    cobradoHoyCent,
    vendidoHoyCent: valenHoy.reduce((a, v) => a + v.totalCent, 0),
    enLaCalleCent: deudas.totalCent,
    alertaDeuda: vencidas[0] ?? null,
    ruta,
    ventasDeHoy: valenHoy
      .slice()
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((v) => ({
        id: v.id,
        cliente: e.clientes.find((c) => c.id === v.clienteId)?.nombre ?? '—',
        hora: horaLocal(v.fecha),
        totalCent: v.totalCent,
        cobradoCent: v.cobradoCent,
        estado: v.cobradoCent >= v.totalCent ? 'cobrado' as const
          : v.cobradoCent > 0 ? 'parcial' as const
          : 'debe' as const,
        items: v.items.reduce((a, i) => a + i.cantidad, 0),
      })),
    ingresosDelRango: vistaIngresos(e, comprasDelRango),
    anuladasDelRango: anulacionesDelRango(e, hoyIso, rango),
    rango,
    // Las anuladas no suman: el total es lo que de verdad entró.
    ingresadoDelRangoCent: comprasDelRango.reduce((a, c) => a + c.totalCent, 0),
    misiones: {
      venta: valenHoy.length > 0,
      cobro: pagosHoy.length > 0,
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
// Vender / productos
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
  /**
   * Un solo número desde la migración 009. Antes eran dos, depósito y vehículo,
   * y había que trasladar de uno al otro antes de salir a vender.
   */
  enStock: number;
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
        enStock: s?.total ?? 0,
        historial: historialPrecios(e, p.id).map((h) => ({
          desde: h.vigenteDesde,
          hasta: h.vigenteHasta,
          precioCent: h.precioCent,
        })),
      };
    });
};

/**
 * Lo que se puede vender: todo lo que tenga precio.
 *
 * Antes filtraba por lo que estuviera arriba del auto. Al sacar ese paso había
 * dos opciones, y la que parece más prolija es la peligrosa:
 *
 *   - filtrar por `enStock > 0` — o sea, no dejarlo registrar la venta de algo
 *     que el sistema cree que no tiene;
 *   - mostrar todo lo que tenga precio, y que el stock quede en negativo si
 *     hace falta.
 *
 * Va la segunda, por la misma razón que el libro mayor no valida stock: él ya
 * hizo la venta, está parado en la vereda, y la plata ya cambió de mano. Un
 * sistema que en ese momento le dice "no podés" no evita nada — lo único que
 * logra es que la venta no quede anotada en ningún lado. El faltante se ve
 * después, como un número en rojo que hay que revisar, que es un problema
 * mucho más chico que una venta que no existe.
 *
 * Sin precio sí queda afuera: ahí no hay nada que cobrar y el total de la venta
 * no se podría armar.
 */
export const vistaParaVender = (e: EstadoApp): ProductoVista[] =>
  vistaProductos(e).filter((p) => p.precioCent !== null);

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
  const delPeriodo = e.ventas.filter((v) => cuenta(v) && v.fecha >= desde);
  const g = gananciaDelPeriodo(delPeriodo);

  const ultimos7 = Array.from({ length: 7 }, (_, i) => {
    const diaIso = diaLocalDesplazado(hoyIso, i - 6);
    return {
      diaIso,
      etiqueta: i === 6 ? 'Hoy' : DIAS[diaDeSemanaLocal(`${diaIso}T12:00:00.000Z`)],
      ventaCent: e.ventas
        .filter((v) => cuenta(v) && diaLocal(v.fecha) === diaIso)
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
        // Una compra anulada no genera deuda: la plata vuelve sola a donde estaba.
        .filter((c) => c.proveedorId === p.id && c.condicionPago === 'cuenta' && !c.anuladaEn)
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

/**
 * Cuántos hay, contando solo los que siguen en uso.
 *
 * "Dejar de vender este producto" no borra la fila: le pone `activo = false`
 * (REGLA 0, nada se pisa). Las listas ya filtran por `activo`, pero los números
 * de las tarjetas de "Mis cosas" contaban la tabla entera, así que después de
 * archivar algo la tarjeta decía "3 productos" y la lista mostraba 2. El número
 * que se le muestra tiene que ser el mismo que puede tocar.
 */
export const cuantosActivos = (l: readonly { activo: boolean }[]): number =>
  l.reduce((a, x) => a + (x.activo ? 1 : 0), 0);

/**
 * Lo que va en el comprobante de una venta.
 *
 * Sale de la venta guardada y no del carrito que había en pantalla: los precios
 * de una venta quedan congelados en sus renglones, así que un comprobante
 * generado hoy y otro del mismo hecho generado en un mes dicen exactamente lo
 * mismo, aunque el precio de lista haya cambiado tres veces en el medio.
 *
 * El nombre y el código del producto sí se leen del catálogo de ahora, porque
 * son descriptivos: si le corrigió una falta de ortografía al nombre, el
 * comprobante nuevo tiene que salir con el nombre corregido.
 */
export const reciboDeVenta = (e: EstadoApp, venta: Venta, negocio: string): DatosRecibo => ({
  negocio,
  tipo: 'venta',
  ...(venta.anuladaEn ? { anuladaEn: venta.anuladaEn } : {}),
  cliente: e.clientes.find((c) => c.id === venta.clienteId)?.nombre ?? 'Consumidor final',
  fechaIso: venta.fecha,
  lineas: venta.items.map((it) => {
    const p = e.productos.find((x) => x.id === it.productoId);
    return {
      codigo: p?.codigo,
      nombre: p?.nombre ?? 'Producto',
      cantidad: it.cantidad,
      precioUnitarioCent: it.precioUnitarioCent,
    };
  }),
  totalCent: venta.totalCent,
  pagadoCent: venta.cobradoCent,
  saldoCent: Math.max(0, venta.totalCent - venta.cobradoCent),
});

export interface CaballitoVista {
  productoId: Uuid;
  codigo?: string;
  nombre: string;
  unidades: number;
}

/**
 * El caballito de batalla de un comercio, listo para mostrar.
 *
 * El cálculo vive en el dominio (`productoMasComprado`); acá solo se le pega el
 * nombre y el código, que salen del catálogo de AHORA. Si le corrigió el nombre
 * al producto, la ficha tiene que decir el nombre corregido.
 *
 * Devuelve null si ese comercio todavía no tiene ninguna venta que valga.
 */
export const caballitoDeBatalla = (e: EstadoApp, clienteId: Uuid): CaballitoVista | null => {
  const top = productoMasComprado(clienteId, e.ventas);
  if (!top) return null;
  const p = e.productos.find((x) => x.id === top.productoId);
  return {
    productoId: top.productoId,
    codigo: p?.codigo,
    nombre: p?.nombre ?? 'Producto',
    unidades: top.unidades,
  };
};

/**
 * Los productos que le compra a un proveedor, con su costo de hoy.
 *
 * El costo sale de `costoDe`, que es el de la última compra NO anulada — el
 * mismo número con el que la app calcula la ganancia. Así, si anuló un ingreso,
 * esta lista muestra el costo que volvió a quedar vigente y no uno que ya no
 * existe.
 *
 * Ordenados por código cuando lo tienen, que es como él los busca en su planilla.
 */
export const productosDelProveedor = (e: EstadoApp, proveedorId: Uuid): ProductoVista[] =>
  vistaProductos(e)
    .filter((p) => e.productos.find((x) => x.id === p.id)?.proveedorId === proveedorId)
    .sort((a, b) => {
      if (a.codigo && b.codigo) return Number(a.codigo) - Number(b.codigo);
      if (a.codigo) return -1;
      if (b.codigo) return 1;
      return a.nombre.localeCompare(b.nombre, 'es');
    });

/** Las sugerencias de precio que esperan una decisión. */
export const sugerenciasPendientes = (e: EstadoApp) =>
  e.sugerencias
    .filter((s) => s.estado === 'pendiente')
    .map((s) => ({
      ...s,
      nombre: e.productos.find((p) => p.id === s.productoId)?.nombre ?? '—',
    }));

/** Una venta en una lista: lo justo para reconocerla y abrir su comprobante. */
export interface VentaDeClienteVista {
  id: Uuid;
  fecha: string;
  /** Día y hora de acá, para mostrar. */
  cuando: string;
  totalCent: Cent;
  cobradoCent: Cent;
  /** Lo que todavía falta cobrar de ESA venta. Cero si está anulada. */
  debeCent: Cent;
  unidades: number;
  anulada: boolean;
}

/**
 * Las últimas ventas de un comercio.
 *
 * Existe por un pedido concreto: el comprobante solo se podía mandar el mismo
 * día. La única puerta al detalle de una venta era "Lo que vendiste hoy", así
 * que la venta de ayer no tenía forma de abrirse y el "mandámelo de nuevo" de
 * dos días después quedaba sin respuesta. Desde acá la ficha del comercio y la
 * hoja de cobro llegan a cualquier venta, y adentro está el mismo botón de
 * siempre.
 *
 * Las anuladas vienen marcadas y NO se esconden: él tiene que poder ver qué
 * anuló. El detalle es el que decide no ofrecer el comprobante de una anulada.
 */
export const ventasDelCliente = (
  e: EstadoApp,
  clienteId: Uuid,
  limite = 6,
): VentaDeClienteVista[] =>
  e.ventas
    .filter((v) => v.clienteId === clienteId)
    .slice()
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, limite)
    .map((v) => ({
      id: v.id,
      fecha: v.fecha,
      cuando: `${fechaCorta(v.fecha)} · ${horaLocal(v.fecha)}`,
      totalCent: v.totalCent,
      cobradoCent: v.cobradoCent,
      // Una venta anulada ya no se le cobra a nadie: mostrar su saldo sería
      // decir que todavía debe una plata que el sistema ya no le reclama.
      debeCent: v.anuladaEn ? 0 : Math.max(0, v.totalCent - v.cobradoCent),
      unidades: v.items.reduce((a, i) => a + i.cantidad, 0),
      anulada: Boolean(v.anuladaEn),
    }));

/**
 * El comprobante de una entrada de mercadería.
 *
 * El mismo formato que el de una venta, con los importes al revés de quién le
 * debe a quién: acá los números son de COSTO y el saldo es lo que él le debe al
 * proveedor. Sirve para dos cosas concretas: mandarle al proveedor lo que anotó
 * —"esto es lo que me llegó"— y, cuando se anula o se corrige, avisarle que la
 * entrada anterior quedó sin efecto.
 */
export const reciboDeIngreso = (e: EstadoApp, compra: Compra, negocio: string): DatosRecibo => ({
  negocio,
  tipo: 'ingreso',
  ...(compra.anuladaEn ? { anuladaEn: compra.anuladaEn } : {}),
  cliente: compra.proveedorId
    ? e.proveedores.find((p) => p.id === compra.proveedorId)?.nombre ?? 'Proveedor'
    : 'Sin proveedor',
  fechaIso: compra.fecha,
  lineas: compra.items.map((it) => {
    const p = e.productos.find((x) => x.id === it.productoId);
    return {
      ...(p?.codigo ? { codigo: p.codigo } : {}),
      nombre: p?.nombre ?? 'Producto',
      cantidad: it.cantidad,
      precioUnitarioCent: it.costoUnitarioCent,
    };
  }),
  totalCent: compra.totalCent,
  /*
   * Al contado ya está pagado; en cuenta no se pagó nada TODAVÍA de esta
   * entrada. Los pagos a proveedores no existen como operación, así que un
   * pago parcial de una compra no se puede representar y no se inventa.
   */
  pagadoCent: compra.condicionPago === 'contado' ? compra.totalCent : 0,
  saldoCent: compra.condicionPago === 'contado' ? 0 : compra.totalCent,
});
