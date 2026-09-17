/**
 * Datos de ejemplo. **Solo para los tests.**
 *
 * La app NO los usa: desde el 16/09/2026 arranca vacía siempre (ver la carga
 * inicial en `App.tsx`). Antes se sembraban para que no abriera en blanco, y eso
 * tenía un problema serio: los comercios inventados no se distinguían de los
 * reales y, como nunca subían a Supabase, no había forma de sacarlos desde el
 * otro lado. Quedaban para siempre.
 *
 * Como escenario de test siguen siendo valiosos: son un negocio del rubro con
 * doce productos, compras que generan stock y costo, precios con vigencia y
 * ventas con costo congelado. Se construyen como el sistema real los
 * construiría. No hay ni un campo de stock ni de precio asignado a mano.
 */

import { pesos } from '../domain/money.ts';
import type {
  Cliente,
  Compra,
  MovimientoStock,
  PagoCliente,
  PrecioVenta,
  Producto,
  Proveedor,
  Venta,
} from '../domain/types.ts';
import { PARAMETROS_DEFAULT, vender, aplicar, entrarMercaderia, type Ctx, type EstadoApp } from './estado.ts';

/**
 * El negocio de los datos de ejemplo.
 *
 * Es texto plano y no un uuid a propósito: así se reconoce de un vistazo, y así
 * `limpieza.ts` puede distinguirlo de un dato real sin conocer este archivo.
 */
const NEG = 'negocio-demo';
const LISTA = 'lista-mayorista';


/** Generador de ids determinista: los tests necesitan resultados repetibles. */
export const idsSecuenciales = (prefijo = 'id'): (() => string) => {
  let n = 0;
  return () => `${prefijo}-${String(++n).padStart(4, '0')}`;
};

const dia = (hoyIso: string, atras: number, hora = '10:00'): string =>
  new Date(Date.parse(hoyIso) - atras * 86_400_000).toISOString().slice(0, 10) +
  `T${hora}:00.000Z`;

interface Def {
  id: string;
  nombre: string;
  variante: string;
  categoria: string;
  proveedor: string;
  costoViejo: number;
  costoHoy: number;
  precio: number;
  compradas: number;
  enAuto: number;
  sugerido: number;
}

const CATALOGO: Def[] = [
  { id:'p1',  nombre:'Collar de nylon reforzado', variante:'Talle 2 · surtido', categoria:'collar',   proveedor:'v1', costoViejo:1600, costoHoy:1900,  precio:3200,  compradas:120, enAuto:24, sugerido:30 },
  { id:'p2',  nombre:'Collar antipulgas perro',   variante:'Talle M',           categoria:'collar',   proveedor:'v1', costoViejo:2600, costoHoy:2600,  precio:4300,  compradas:60,  enAuto:12, sugerido:15 },
  { id:'p3',  nombre:'Correa retráctil 5 m',      variante:'Hasta 20 kg',       categoria:'correa',   proveedor:'v1', costoViejo:6900, costoHoy:7800,  precio:12500, compradas:36,  enAuto:6,  sugerido:10 },
  { id:'p4',  nombre:'Correa de cuero eco 1,2 m', variante:'Negro y marrón',    categoria:'correa',   proveedor:'v1', costoViejo:4200, costoHoy:4200,  precio:6900,  compradas:48,  enAuto:10, sugerido:12 },
  { id:'p5',  nombre:'Arnés regulable',           variante:'Talle M',           categoria:'correa',   proveedor:'v1', costoViejo:5900, costoHoy:6400,  precio:10500, compradas:32,  enAuto:8,  sugerido:10 },
  { id:'p6',  nombre:'Pelota de goma maciza',     variante:'7 cm · surtida',    categoria:'juguete',  proveedor:'v2', costoViejo:820,  costoHoy:900,   precio:1700,  compradas:220, enAuto:48, sugerido:60 },
  { id:'p7',  nombre:'Soga mordillo trenzada',    variante:'30 cm',             categoria:'juguete',  proveedor:'v2', costoViejo:1300, costoHoy:1300,  precio:2400,  compradas:130, enAuto:30, sugerido:35 },
  { id:'p8',  nombre:'Ratón con catnip',          variante:'Pack x 2',          categoria:'juguete',  proveedor:'v2', costoViejo:980,  costoHoy:1100,  precio:2100,  compradas:160, enAuto:36, sugerido:40 },
  { id:'p9',  nombre:'Caña con plumas',           variante:'Para gato',         categoria:'juguete',  proveedor:'v2', costoViejo:1600, costoHoy:1600,  precio:2900,  compradas:84,  enAuto:18, sugerido:20 },
  { id:'p10', nombre:'Comedero doble de acero',   variante:'Base antideslizante',categoria:'comedero',proveedor:'v3', costoViejo:4700, costoHoy:5200,  precio:8600,  compradas:42,  enAuto:9,  sugerido:12 },
  { id:'p11', nombre:'Bebedero dispenser 2 L',    variante:'Plástico reforzado',categoria:'comedero', proveedor:'v3', costoViejo:6900, costoHoy:6900,  precio:11200, compradas:26,  enAuto:5,  sugerido:8  },
  { id:'p12', nombre:'Cepillo quita pelos',       variante:'Mango de goma',     categoria:'higiene',  proveedor:'v4', costoViejo:2600, costoHoy:2900,  precio:4800,  compradas:76,  enAuto:16, sugerido:20 },
  { id:'p13', nombre:'Piedra sanitaria 4 kg',     variante:'Aglomerante',       categoria:'higiene',  proveedor:'v4', costoViejo:3000, costoHoy:3400,  precio:5500,  compradas:150, enAuto:20, sugerido:45 },
  { id:'p14', nombre:'Bolsitas sanitarias x 60',  variante:'Con dispenser',     categoria:'higiene',  proveedor:'v4', costoViejo:1500, costoHoy:1500,  precio:2700,  compradas:190, enAuto:40, sugerido:45 },
  { id:'p15', nombre:'Rascador de sisal 40 cm',   variante:'Con juguete',       categoria:'descanso', proveedor:'v3', costoViejo:7900, costoHoy:8700,  precio:14500, compradas:24,  enAuto:4,  sugerido:6  },
  { id:'p16', nombre:'Cucha de tela chica',       variante:'Lavable',           categoria:'descanso', proveedor:'v3', costoViejo:12800,costoHoy:12800, precio:21000, compradas:16,  enAuto:2,  sugerido:4  },
];

const PROVEEDORES: Proveedor[] = [
  { id:'v1', negocioId:NEG, nombre:'Distribuidora Canina',  rubro:'Collares, correas y arneses',   activo:true },
  { id:'v2', negocioId:NEG, nombre:'Juguetería Pet Import', rubro:'Juguetes de perro y gato',      activo:true },
  { id:'v3', negocioId:NEG, nombre:'Mayorista El Hueso',    rubro:'Comederos, camas y rascadores', activo:true },
  { id:'v4', negocioId:NEG, nombre:'Higiene Animal',        rubro:'Piedras, bolsitas y cepillos',  activo:true },
];

/** diaVisita: 0 domingo … 6 sábado */
const CLIENTES: Cliente[] = [
  { id:'c1', negocioId:NEG, nombre:'Pet Shop Huellitas',   zona:'Villa Luro',  diaVisita:2, activo:true },
  { id:'c2', negocioId:NEG, nombre:'Mascotas del Oeste',   zona:'Morón',       diaVisita:2, activo:true },
  { id:'c3', negocioId:NEG, nombre:'Vet. Patitas Felices', zona:'Castelar',    diaVisita:2, activo:true },
  { id:'c4', negocioId:NEG, nombre:'Forrajería El Ceibo',  zona:'Haedo',       diaVisita:5, activo:true },
  { id:'c5', negocioId:NEG, nombre:'Forrajería La Esquina',zona:'Merlo',       diaVisita:3, activo:true },
  { id:'c6', negocioId:NEG, nombre:'Veterinaria San Roque',zona:'Liniers',     diaVisita:4, activo:true },
  { id:'c7', negocioId:NEG, nombre:'Pet Shop Bigotes',     zona:'Ramos Mejía', diaVisita:4, activo:true },
  { id:'c8', negocioId:NEG, nombre:'Pet Shop Guau & Miau', zona:'Ituzaingó',   diaVisita:3, activo:true },
];

/**
 * Arma el escenario completo. `hoyIso` permite que los tests fijen el día
 * y que la app use el día real sin que nada quede escrito a mano.
 */
export const construirSemilla = (hoyIso: string): EstadoApp => {
  const nuevoId = idsSecuenciales('s');

  const productos: Producto[] = CATALOGO.map((d) => ({
    id: d.id,
    negocioId: NEG,
    nombre: d.nombre,
    variante: d.variante,
    categoria: d.categoria,
    proveedorId: d.proveedor,
    unidad: 'unidad',
    activo: true,
    sugeridoEnVehiculo: d.sugerido,
  }));

  // Precios: uno viejo cerrado y el vigente. Así la ficha de producto tiene historial.
  const precios: PrecioVenta[] = CATALOGO.flatMap((d) => {
    const viejo = Math.round((d.precio * d.costoViejo) / d.costoHoy / 100) * 100;
    return [
      {
        id: `pv-${d.id}-1`,
        productoId: d.id,
        listaId: LISTA,
        precioCent: pesos(viejo),
        vigenteDesde: dia(hoyIso, 120),
        vigenteHasta: dia(hoyIso, 45),
        origen: 'manual' as const,
      },
      {
        id: `pv-${d.id}-2`,
        productoId: d.id,
        listaId: LISTA,
        precioCent: pesos(d.precio),
        vigenteDesde: dia(hoyIso, 45),
        vigenteHasta: null,
        origen: 'sugerido' as const,
        motivo: 'aumento de costo',
      },
    ];
  });

  // Dos compras: una vieja al costo anterior y una reciente al costo de hoy.
  const compraVieja: Compra = {
    id: 'compra-1', negocioId: NEG, proveedorId: 'v1', fecha: dia(hoyIso, 120),
    condicionPago: 'contado', totalCent: 0,
    items: CATALOGO.map((d) => ({
      id: `ci1-${d.id}`, compraId: 'compra-1', productoId: d.id,
      cantidad: Math.round(d.compradas * 0.4), costoUnitarioCent: pesos(d.costoViejo),
    })),
  };
  const compraNueva: Compra = {
    id: 'compra-2', negocioId: NEG, proveedorId: 'v1', fecha: dia(hoyIso, 45),
    condicionPago: 'cuenta', totalCent: 0,
    items: CATALOGO.map((d) => ({
      id: `ci2-${d.id}`, compraId: 'compra-2', productoId: d.id,
      cantidad: Math.round(d.compradas * 0.6), costoUnitarioCent: pesos(d.costoHoy),
    })),
  };
  for (const c of [compraVieja, compraNueva]) {
    c.totalCent = c.items.reduce((a, i) => a + i.costoUnitarioCent * i.cantidad, 0);
  }

  const movimientos: MovimientoStock[] = [
    ...[compraVieja, compraNueva].flatMap((c) =>
      c.items.map((i) => ({
        id: nuevoId(), negocioId: NEG, productoId: i.productoId,
        ubicacion: 'deposito' as const, cantidad: i.cantidad,
        tipo: 'compra' as const, refTipo: 'compra' as const, refId: c.id, fecha: c.fecha,
      })),
    ),
    // Carga del auto de esta mañana.
    ...CATALOGO.flatMap((d) => [
      { id: nuevoId(), negocioId: NEG, productoId: d.id, ubicacion: 'deposito' as const,
        cantidad: -d.enAuto, tipo: 'traslado' as const, fecha: dia(hoyIso, 0, '07:30') },
      { id: nuevoId(), negocioId: NEG, productoId: d.id, ubicacion: 'vehiculo' as const,
        cantidad: d.enAuto, tipo: 'traslado' as const, fecha: dia(hoyIso, 0, '07:30') },
    ]),
  ];

  // Ventas viejas a cuenta: es lo que genera la deuda que hoy le tiene que cobrar.
  const aCuenta: { cliente: string; atras: number; items: [string, number][] }[] = [
    { cliente: 'c4', atras: 41, items: [['p3', 8], ['p15', 6], ['p10', 5]] },
    { cliente: 'c1', atras: 22, items: [['p1', 24], ['p13', 12], ['p6', 20]] },
    { cliente: 'c5', atras: 15, items: [['p14', 20], ['p7', 12]] },
    { cliente: 'c2', atras: 8,  items: [['p6', 18], ['p8', 10]] },
    { cliente: 'c3', atras: 3,  items: [['p12', 4]] },
  ];

  const ventas: Venta[] = aCuenta.map((v, k) => {
    const items = v.items.map(([pid, cant], j) => {
      const d = CATALOGO.find((x) => x.id === pid)!;
      return {
        id: `vi-${k}-${j}`, ventaId: `venta-${k}`, productoId: pid, cantidad: cant,
        precioUnitarioCent: pesos(d.precio),
        costoUnitarioCent: pesos(v.atras > 45 ? d.costoViejo : d.costoHoy),
      };
    });
    const totalCent = items.reduce((a, i) => a + i.precioUnitarioCent * i.cantidad, 0);
    return {
      id: `venta-${k}`, negocioId: NEG, clienteId: v.cliente, fecha: dia(hoyIso, v.atras, '11:20'),
      totalCent, cobradoCent: 0, formaPago: 'cuenta' as const, items,
    };
  });

  // Un pago parcial, para que la imputación se vea funcionando.
  const pagos: PagoCliente[] = [
    { id: 'pago-1', negocioId: NEG, clienteId: 'c5', montoCent: pesos(40000),
      fecha: dia(hoyIso, 6), medio: 'transferencia' },
  ];

  return {
    negocioId: NEG,
    listaId: LISTA,
    productos,
    clientes: CLIENTES,
    proveedores: PROVEEDORES,
    precios,
    movimientos,
    compras: [compraVieja, compraNueva],
    ventas,
    pagos,
    sugerencias: [],
    parametros: PARAMETROS_DEFAULT,
  };
};

/** Escenario de demo con actividad de hoy ya cargada: la app nunca abre vacía. */
export const semillaConDiaEnCurso = (hoyIso: string): EstadoApp => {
  let e = construirSemilla(hoyIso);
  const nuevoId = idsSecuenciales('hoy');
  const ctx: Ctx = { nuevoId, ahora: () => dia(hoyIso, 0, '09:40') };

  e = aplicar(e, vender(e, {
    clienteId: 'c1',
    items: [['p1', 12], ['p6', 24], ['p13', 6]].map(([productoId, cantidad]) =>
      ({ productoId: productoId as string, cantidad: cantidad as number })),
    formaPago: 'efectivo',
  }, ctx));

  const ctx2: Ctx = { nuevoId, ahora: () => dia(hoyIso, 0, '11:15') };
  e = aplicar(e, vender(e, {
    clienteId: 'c2',
    items: [{ productoId: 'p3', cantidad: 2 }, { productoId: 'p10', cantidad: 3 }],
    formaPago: 'cuenta',
  }, ctx2));

  return e;
};

export { LISTA as LISTA_DEMO, CATALOGO as CATALOGO_DEMO, entrarMercaderia };
