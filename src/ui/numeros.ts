/**
 * Números: la plata que entró y salió de verdad, y la ganancia del negocio.
 *
 * SON DOS COSAS DISTINTAS Y LA APP MOSTRABA UNA SOLA
 *
 * Hasta acá "Números" decía cuánto ganó: ventas menos lo que costó la
 * mercadería. Eso es la ganancia comercial, y es correcta — pero no es la plata
 * que tiene. Una venta a cuenta suma a la ganancia el día que se hace y no pone
 * un peso en el bolsillo hasta que la cobra; una compra al contado le saca plata
 * hoy y recién aparece como costo cuando esa mercadería se vende.
 *
 * Por eso ahora hay dos bloques, y no uno más grande:
 *
 *   CAJA          lo que entró menos lo que salió. Plata que se movió.
 *   RESULTADO     ventas − costo de lo vendido − gastos. Cómo va el negocio.
 *
 * Los dos son ciertos y casi nunca dan igual. Mezclarlos en un solo número es la
 * forma más rápida de que un número deje de significar nada.
 *
 * TODO ACÁ ES UNA FUNCIÓN PURA
 *
 * Recibe el estado y una ventana de fechas, y devuelve datos. Ni un componente,
 * ni un `useState`: es lo que permite testear el cuadro de resultados sin abrir
 * un navegador, que es donde los errores de plata se pagan caro.
 */

import type { Cent } from '../domain/money.ts';
import {
  diaLocal,
  mesDesplazado,
  mesLocal,
  nombreDeMesYAnio,
  ultimoDiaDelMes,
} from '../domain/fechas.ts';
import { gananciaDelPeriodo } from '../domain/precios.ts';
import { saldoCliente } from '../domain/saldos.ts';
import type { Gasto, Uuid, Venta } from '../domain/types.ts';
import type { EstadoApp } from '../app/estado.ts';
import { categoria } from './gastos.ts';
import { vistaProductos } from './vistas.ts';

// ---------------------------------------------------------------------------
// El período
// ---------------------------------------------------------------------------

/**
 * Los tres cortes que se pueden mirar.
 *
 * "Este mes" y "el mes anterior" cubren el noventa y pico por ciento de las
 * veces: él cierra por mes, y lo que más mira es cómo viene este comparado con
 * el que pasó. El rango a mano está para lo demás —una quincena, una semana
 * puntual, el trimestre— sin agregar cinco botones que nadie va a usar.
 */
export type Periodo = 'mes' | 'anterior' | 'personalizado';

/**
 * Un período resuelto: dos días de calendario de ACÁ, inclusive los dos.
 *
 * Días y no instantes a propósito. La pregunta "¿esto entra en septiembre?" se
 * contesta comparando textos `2026-09-14`, que es exactamente cómo ordena el
 * resto de la app, y evita el error clásico de un `hasta` que corta a las 00:00
 * y se come el último día entero.
 */
export interface Ventana {
  desde: string;
  hasta: string;
  /** "septiembre de 2026", o "del 03/09 al 14/09" si lo eligió a mano. */
  titulo: string;
}

const comoDdMm = (dia: string): string => `${dia.slice(8)}/${dia.slice(5, 7)}`;

export const ventanaDe = (
  periodo: Periodo,
  hoyIso: string,
  aMano?: { desde: string; hasta: string },
): Ventana => {
  if (periodo === 'personalizado' && aMano) {
    // Si los da al revés se dan vuelta solos. Es un error de dedo, no un pedido
    // de ver un período vacío.
    const [desde, hasta] = aMano.desde <= aMano.hasta
      ? [aMano.desde, aMano.hasta]
      : [aMano.hasta, aMano.desde];
    return { desde, hasta, titulo: `del ${comoDdMm(desde)} al ${comoDdMm(hasta)}` };
  }

  const mes = periodo === 'anterior'
    ? mesDesplazado(mesLocal(hoyIso), -1)
    : mesLocal(hoyIso);

  return {
    desde: `${mes}-01`,
    hasta: ultimoDiaDelMes(mes),
    titulo: nombreDeMesYAnio(mes),
  };
};

/** ¿Este instante cae adentro del período? */
export const enVentana = (iso: string, v: Ventana): boolean => {
  const d = diaLocal(iso);
  return d >= v.desde && d <= v.hasta;
};

// ---------------------------------------------------------------------------
// La caja
// ---------------------------------------------------------------------------

export interface MovimientoDeCaja {
  /** El instante, para ordenar. */
  fecha: string;
  concepto: string;
  detalle: string;
  direccion: 'entra' | 'sale';
  montoCent: Cent;
}

/**
 * Todo lo que movió plata en el período, del más nuevo al más viejo.
 *
 * QUÉ ENTRA
 *  - Lo que le pagaron al cerrar una venta (`cobradoCent`). Una venta a cuenta
 *    tiene cobrado cero y por eso no aparece: todavía no entró nada.
 *  - Los cobros posteriores de la cuenta corriente.
 *
 * QUÉ SALE
 *  - Las compras AL CONTADO. Esas sí las pagó el día que las recibió.
 *  - Los gastos operativos.
 *
 * QUÉ NO ENTRA, Y ES LA DECISIÓN IMPORTANTE
 *
 * Las compras EN CUENTA no salen de la caja el día que llegan, porque ese día no
 * pagó nada. Tendrían que salir el día que le paga al proveedor — y esa función
 * todavía no existe (`pagos_proveedor` está vacía). O sea que mientras no haya
 * pagos a proveedores, una compra en cuenta NO aparece en la caja en ningún
 * momento, y la caja sobreestima lo que tiene.
 *
 * Se eligió que falte y se avise —`comprasSinPagar` de más abajo pone un cartel
 * en la pantalla— en vez de descontar la compra entera el día que llega, que
 * sería mentir con precisión: mostraría una salida que no ocurrió, en una fecha
 * que no es. Un número al que le falta una parte y lo dice es utilizable; uno
 * que afirma algo falso, no.
 */
export const flujoDeCaja = (e: EstadoApp, v: Ventana): MovimientoDeCaja[] => {
  const filas: MovimientoDeCaja[] = [];
  const comercio = (id: Uuid) => e.clientes.find((c) => c.id === id)?.nombre ?? 'Un comercio';

  for (const venta of e.ventas) {
    if (venta.anuladaEn || venta.cobradoCent <= 0 || !enVentana(venta.fecha, v)) continue;
    filas.push({
      fecha: venta.fecha,
      concepto: 'Venta',
      detalle: comercio(venta.clienteId),
      direccion: 'entra',
      montoCent: venta.cobradoCent,
    });
  }

  for (const pago of e.pagos) {
    if (!enVentana(pago.fecha, v)) continue;
    filas.push({
      fecha: pago.fecha,
      concepto: 'Cobro',
      detalle: comercio(pago.clienteId),
      direccion: 'entra',
      montoCent: pago.montoCent,
    });
  }

  for (const compra of e.compras) {
    if (compra.anuladaEn || compra.condicionPago !== 'contado') continue;
    if (!enVentana(compra.fecha, v)) continue;
    const prov = compra.proveedorId
      ? e.proveedores.find((p) => p.id === compra.proveedorId)?.nombre
      : undefined;
    filas.push({
      fecha: compra.fecha,
      concepto: 'Mercadería',
      detalle: prov ?? 'sin proveedor',
      direccion: 'sale',
      montoCent: compra.totalCent,
    });
  }

  for (const gasto of e.gastos) {
    if (gasto.anuladaEn || !enVentana(gasto.fecha, v)) continue;
    filas.push({
      fecha: gasto.fecha,
      concepto: categoria(gasto.categoria).texto,
      detalle: gasto.nota ?? 'Gasto',
      direccion: 'sale',
      montoCent: gasto.montoCent,
    });
  }

  return filas.sort((a, b) => b.fecha.localeCompare(a.fecha));
};

export interface Caja {
  entroCent: Cent;
  salioCent: Cent;
  /** Entró menos salió. Puede dar negativo, y ese mes es información. */
  netoCent: Cent;
}

export const caja = (movimientos: MovimientoDeCaja[]): Caja => {
  const entroCent = movimientos
    .filter((m) => m.direccion === 'entra')
    .reduce((a, m) => a + m.montoCent, 0);
  const salioCent = movimientos
    .filter((m) => m.direccion === 'sale')
    .reduce((a, m) => a + m.montoCent, 0);
  return { entroCent, salioCent, netoCent: entroCent - salioCent };
};

/**
 * Las compras en cuenta del período: lo que la caja NO está contando.
 *
 * Hoy, con las 186 compras vivas al contado, esto da cero y el cartel no
 * aparece. El día que lleve mercadería a cuenta, aparece — y entonces hace falta
 * construir pagos a proveedores. La alternativa era que ese día la caja se
 * volviera optimista en silencio.
 */
export const comprasSinPagar = (
  e: EstadoApp,
  v: Ventana,
): { cuantas: number; totalCent: Cent } => {
  const enCuenta = e.compras.filter(
    (c) => !c.anuladaEn && c.condicionPago === 'cuenta' && enVentana(c.fecha, v),
  );
  return {
    cuantas: enCuenta.length,
    totalCent: enCuenta.reduce((a, c) => a + c.totalCent, 0),
  };
};

// ---------------------------------------------------------------------------
// El cuadro de resultados
// ---------------------------------------------------------------------------

export interface Resultado {
  ventasCent: Cent;
  /** Lo que le costó la mercadería que vendió, congelado al momento de vender. */
  costoCent: Cent;
  brutaCent: Cent;
  gastosCent: Cent;
  netaCent: Cent;
  /** 0 a 1. Cero cuando no vendió nada, que es "no hay nada que medir". */
  margenBruto: number;
  margenNeto: number;
}

export const resultado = (e: EstadoApp, v: Ventana): Resultado => {
  const g = gananciaDelPeriodo(e.ventas.filter((x) => enVentana(x.fecha, v)));
  const gastosCent = e.gastos
    .filter((x) => !x.anuladaEn && enVentana(x.fecha, v))
    .reduce((a, x) => a + x.montoCent, 0);

  const netaCent = g.gananciaCent - gastosCent;

  return {
    ventasCent: g.ventaCent,
    costoCent: g.costoCent,
    brutaCent: g.gananciaCent,
    gastosCent,
    netaCent,
    margenBruto: g.margen,
    margenNeto: g.ventaCent === 0 ? 0 : netaCent / g.ventaCent,
  };
};

// ---------------------------------------------------------------------------
// Reporte: ventas y margen por producto
// ---------------------------------------------------------------------------

export interface FilaPorProducto {
  productoId: Uuid;
  codigo?: string;
  nombre: string;
  unidades: number;
  ventaCent: Cent;
  costoCent: Cent;
  gananciaCent: Cent;
  margen: number;
}

/**
 * Qué se vendió y cuánto dejó cada cosa, de la que más ganancia deja para abajo.
 *
 * Ordenado por GANANCIA y no por unidades ni por facturación, porque las otras
 * dos ya están en la app —el caballito de batalla y "lo que más se te va"— y
 * ninguna contesta la pregunta que importa para decidir qué reponer: de todo lo
 * que moví, ¿qué me dejó plata?
 *
 * Los precios y los costos salen del renglón de cada venta, congelados. Un
 * cambio de precio de hoy no reescribe lo que dejó una venta de la semana
 * pasada.
 */
export const ventasPorProducto = (e: EstadoApp, v: Ventana): FilaPorProducto[] => {
  const acum = new Map<Uuid, { unidades: number; ventaCent: Cent; costoCent: Cent }>();

  for (const venta of e.ventas) {
    if (venta.anuladaEn || !enVentana(venta.fecha, v)) continue;
    for (const it of venta.items) {
      const x = acum.get(it.productoId) ?? { unidades: 0, ventaCent: 0, costoCent: 0 };
      acum.set(it.productoId, {
        unidades: x.unidades + it.cantidad,
        ventaCent: x.ventaCent + it.precioUnitarioCent * it.cantidad,
        costoCent: x.costoCent + it.costoUnitarioCent * it.cantidad,
      });
    }
  }

  return [...acum.entries()]
    .map(([productoId, x]) => {
      const p = e.productos.find((y) => y.id === productoId);
      const gananciaCent = x.ventaCent - x.costoCent;
      return {
        productoId,
        codigo: p?.codigo,
        // Un producto archivado sigue apareciendo: se vendió de verdad.
        nombre: p?.nombre ?? 'Producto borrado',
        unidades: x.unidades,
        ventaCent: x.ventaCent,
        costoCent: x.costoCent,
        gananciaCent,
        margen: x.ventaCent === 0 ? 0 : gananciaCent / x.ventaCent,
      };
    })
    .sort((a, b) => b.gananciaCent - a.gananciaCent || a.nombre.localeCompare(b.nombre, 'es'));
};

// ---------------------------------------------------------------------------
// Reporte: gastos operativos
// ---------------------------------------------------------------------------

/** Los gastos vivos del período, del más nuevo al más viejo. */
export const gastosDelPeriodo = (e: EstadoApp, v: Ventana): Gasto[] =>
  e.gastos
    .filter((g) => !g.anuladaEn && enVentana(g.fecha, v))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

// ---------------------------------------------------------------------------
// Reporte: cuentas por cobrar
// ---------------------------------------------------------------------------

export interface FilaPorCobrar {
  clienteId: Uuid;
  nombre: string;
  saldoCent: Cent;
  desdeIso: string | null;
  dias: number | null;
}

/**
 * Quién le debe y desde cuándo, del más atrasado al menos.
 *
 * **Este reporte NO mira el período**, y es a propósito. Una deuda no es algo
 * que pasó en septiembre: es plata que está en la calle HOY. Filtrarla por mes
 * daría un número más chico que la realidad y sería justo el número que no hay
 * que mirar cuando uno sale a cobrar.
 *
 * La pantalla lo dice con todas las letras, porque es la única tarjeta —junto
 * con la valorización de stock— que no cambia al cambiar el período, y sin el
 * aviso parecería que está rota.
 */
export const porCobrar = (e: EstadoApp, hoyIso: string): FilaPorCobrar[] =>
  e.clientes
    .map((c) => {
      const s = saldoCliente(c.id, e.ventas, e.pagos, hoyIso);
      return {
        clienteId: c.id,
        nombre: c.nombre,
        saldoCent: s.saldoCent,
        desdeIso: s.deudaMasViejaIso,
        dias: s.diasAtraso,
      };
    })
    .filter((f) => f.saldoCent > 0)
    .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0) || b.saldoCent - a.saldoCent);

// ---------------------------------------------------------------------------
// Reporte: valorización de stock
// ---------------------------------------------------------------------------

export interface FilaDeStock {
  productoId: Uuid;
  codigo?: string;
  nombre: string;
  stock: number;
  costoCent: Cent | null;
  /** Costo × unidades. `null` cuando no hay costo cargado: es "no sé", no cero. */
  valorCent: Cent | null;
}

export interface Valorizacion {
  filas: FilaDeStock[];
  totalCent: Cent;
  unidades: number;
  /** Cuántos productos tienen stock y no tienen costo, así que no suman. */
  sinCosto: number;
}

/**
 * Cuánta plata tiene parada en mercadería, producto por producto.
 *
 * Foto de HOY, igual que las cuentas por cobrar: el stock es lo que hay en este
 * momento, no lo que hubo en septiembre.
 *
 * Dos reglas heredadas de la tarjeta de capital, y las dos importan:
 *  - **El stock negativo no resta.** Significa que vendió algo que el sistema no
 *    tiene como recibido: es un error de carga, no plata en contra.
 *  - **Sin costo cargado el valor es `null`, no cero.** Un cero afirmaría que le
 *    salió gratis, y encima sumaría al totalizar.
 *
 * Un costo de CERO cuenta como "no lo cargué", igual que en la ganancia por
 * unidad. No es una sutileza: el caso real es una entrada cargada a las
 * apuradas sin el costo, y si valiera cero el producto figuraría con stock y sin
 * valor, mezclado con los que de verdad valen poco.
 */
export const valorizacionDeStock = (e: EstadoApp): Valorizacion => {
  const filas = vistaProductos(e)
    .filter((p) => p.enStock !== 0)
    .map((p) => {
      const costoCent = p.costoCent === null || p.costoCent <= 0 ? null : p.costoCent;
      return {
        productoId: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        stock: p.enStock,
        costoCent,
        valorCent: costoCent === null || p.enStock <= 0 ? null : costoCent * p.enStock,
      };
    })
    .sort((a, b) => (b.valorCent ?? 0) - (a.valorCent ?? 0)
      || a.nombre.localeCompare(b.nombre, 'es'));

  return {
    filas,
    totalCent: filas.reduce((a, f) => a + (f.valorCent ?? 0), 0),
    unidades: filas.reduce((a, f) => a + Math.max(0, f.stock), 0),
    sinCosto: filas.filter((f) => f.stock > 0 && f.costoCent === null).length,
  };
};

// ---------------------------------------------------------------------------
// Las cinco tarjetas
// ---------------------------------------------------------------------------

export type ReporteId = 'caja' | 'productos' | 'gastos' | 'cobrar' | 'stock';

export interface Tarjeta {
  id: ReporteId;
  titulo: string;
  /** Lo que resume el reporte, en plata. */
  montoCent: Cent;
  /** Cuántas filas tiene el detalle. Cero apaga la tarjeta. */
  filas: number;
  icono: string;
  /**
   * `true` en las dos que son una foto de hoy y no del período. La pantalla lo
   * muestra, porque si no parecerían rotas al cambiar de mes.
   */
  deHoy: boolean;
}

/** Cuántas ventas vivas hay en el período. Sirve para saber si hay algo que medir. */
export const ventasDelPeriodo = (e: EstadoApp, v: Ventana): Venta[] =>
  e.ventas.filter((x) => !x.anuladaEn && enVentana(x.fecha, v));

// ---------------------------------------------------------------------------
// Bajar cualquiera de los cinco a una planilla
// ---------------------------------------------------------------------------

/**
 * La fecha como la escribe un Excel en castellano.
 *
 * `2026-09-14` es el formato con el que la app compara y ordena, y es el
 * correcto adentro. Pero en una planilla, un Excel en es-AR lo toma como texto y
 * no se puede ordenar ni filtrar por fecha. Se convierte en el borde, al salir.
 */
const fechaParaPlanilla = (iso: string): string => {
  const d = diaLocal(iso);
  return `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
};

/** Los importes viajan en centavos y en la planilla van en pesos. Una sola vez, acá. */
const pesos = (c: Cent | null): number | null => (c === null ? null : c / 100);

/** El porcentaje como número, no como texto: así se puede promediar en la planilla. */
const porciento = (m: number): number => Math.round(m * 1000) / 10;

export interface Planilla {
  columnas: readonly string[];
  filas: (string | number | null)[][];
}

export const planillaDeCaja = (movimientos: MovimientoDeCaja[]): Planilla => ({
  columnas: ['Fecha', 'Concepto', 'Detalle', 'Entró', 'Salió'],
  filas: movimientos.map((m) => [
    fechaParaPlanilla(m.fecha),
    m.concepto,
    m.detalle,
    // Dos columnas y no una con signo: así la planilla suma cada lado por
    // separado sin que nadie tenga que escribir una fórmula con condiciones.
    m.direccion === 'entra' ? pesos(m.montoCent) : null,
    m.direccion === 'sale' ? pesos(m.montoCent) : null,
  ]),
});

export const planillaDeProductos = (filas: FilaPorProducto[]): Planilla => ({
  columnas: ['Código', 'Producto', 'Unidades', 'Vendido', 'Costo', 'Ganancia', 'Margen %'],
  filas: filas.map((f) => [
    f.codigo ?? '',
    f.nombre,
    f.unidades,
    pesos(f.ventaCent),
    pesos(f.costoCent),
    pesos(f.gananciaCent),
    porciento(f.margen),
  ]),
});

export const planillaDeGastos = (gastos: Gasto[]): Planilla => ({
  columnas: ['Fecha', 'Categoría', 'Detalle', 'Medio de pago', 'Monto'],
  filas: gastos.map((g) => [
    fechaParaPlanilla(g.fecha),
    categoria(g.categoria).texto,
    g.nota ?? '',
    g.medio,
    pesos(g.montoCent),
  ]),
});

export const planillaPorCobrar = (filas: FilaPorCobrar[]): Planilla => ({
  columnas: ['Comercio', 'Saldo desde', 'Días', 'Saldo'],
  filas: filas.map((f) => [
    f.nombre,
    f.desdeIso ? fechaParaPlanilla(f.desdeIso) : '',
    f.dias ?? '',
    pesos(f.saldoCent),
  ]),
});

export const planillaDeStock = (filas: FilaDeStock[]): Planilla => ({
  columnas: ['Código', 'Producto', 'Stock', 'Costo unitario', 'Valor'],
  filas: filas.map((f) => [
    f.codigo ?? '',
    f.nombre,
    f.stock,
    pesos(f.costoCent),
    pesos(f.valorCent),
  ]),
});
