/**
 * Tipos del dominio.
 *
 * REGLA 0: acá no existe `Producto.stock`, ni `Producto.costo`, ni `Producto.precio`.
 * Si alguna vez aparecen, algo se hizo mal.
 */

import type { Cent } from './money.ts';

export type Uuid = string;
export type Ubicacion = 'deposito' | 'vehiculo';

export type TipoMovimiento =
  | 'compra'
  | 'venta'
  | 'traslado'
  | 'ajuste'
  | 'devolucion'
  | 'rotura';

export type FormaPago = 'efectivo' | 'transferencia' | 'cuenta' | 'mixto';
export type MedioPago = 'efectivo' | 'transferencia' | 'cheque' | 'otro';

export interface Producto {
  id: Uuid;
  negocioId: Uuid;
  nombre: string;
  variante?: string;
  categoria?: string;
  proveedorId?: Uuid;
  unidad: string;
  activo: boolean;
  /** Cuánto conviene llevar en el auto para una ruta típica. Es una preferencia, no stock. */
  sugeridoEnVehiculo?: number;
}

export interface Cliente {
  id: Uuid;
  negocioId: Uuid;
  nombre: string;
  zona?: string;
  /** 0 = domingo */
  diaVisita?: number;
  plazoDias?: number;
  activo: boolean;
}

export interface Proveedor {
  id: Uuid;
  negocioId: Uuid;
  nombre: string;
  rubro?: string;
  activo: boolean;
}

/** Una fila del libro mayor de stock. Inmutable. */
export interface MovimientoStock {
  id: Uuid;
  negocioId: Uuid;
  productoId: Uuid;
  ubicacion: Ubicacion;
  /** Positivo entra, negativo sale. Nunca cero. */
  cantidad: number;
  tipo: TipoMovimiento;
  refTipo?: 'compra' | 'venta' | 'ajuste';
  refId?: Uuid;
  fecha: string; // ISO
  nota?: string;
}

/** Un precio con vigencia. `vigenteHasta === null` es el precio actual. */
export interface PrecioVenta {
  id: Uuid;
  productoId: Uuid;
  listaId: Uuid;
  precioCent: Cent;
  vigenteDesde: string;
  vigenteHasta: string | null;
  origen: 'manual' | 'sugerido' | 'importado';
  motivo?: string;
}

export interface CompraItem {
  id: Uuid;
  compraId: Uuid;
  productoId: Uuid;
  cantidad: number;
  /** Inmutable. De acá sale el costo del producto. */
  costoUnitarioCent: Cent;
}

export interface Compra {
  id: Uuid;
  negocioId: Uuid;
  proveedorId: Uuid;
  fecha: string;
  condicionPago: 'contado' | 'cuenta';
  totalCent: Cent;
  items: CompraItem[];
}

export interface VentaItem {
  id: Uuid;
  ventaId: Uuid;
  productoId: Uuid;
  cantidad: number;
  /** Congelado al momento de vender. */
  precioUnitarioCent: Cent;
  /** Congelado al momento de vender. Es lo que hace que la ganancia vieja no se mueva. */
  costoUnitarioCent: Cent;
}

export interface Venta {
  id: Uuid;
  negocioId: Uuid;
  clienteId: Uuid;
  fecha: string;
  totalCent: Cent;
  cobradoCent: Cent;
  formaPago: FormaPago;
  items: VentaItem[];
}

export interface PagoCliente {
  id: Uuid;
  negocioId: Uuid;
  clienteId: Uuid;
  montoCent: Cent;
  fecha: string;
  medio: MedioPago;
  fechaAcreditacion?: string;
}

export interface SugerenciaPrecio {
  id: Uuid;
  productoId: Uuid;
  listaId: Uuid;
  costoAnteriorCent: Cent;
  costoNuevoCent: Cent;
  precioVigenteCent: Cent;
  precioSugeridoCent: Cent;
  baseCalculo: 'margen' | 'markup' | 'manual';
  estado: 'pendiente' | 'aplicada' | 'descartada';
  creadaEn: string;
  resueltaEn?: string;
}
