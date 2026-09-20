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
  /**
   * El código con el que él identifica el producto en su planilla (101, 105…).
   *
   * Texto y no número: en la planilla puede haber códigos con cero adelante, y
   * "0110" y "110" son dos productos distintos para quien los lee. Un número se
   * comería ese cero sin avisar. Único dentro del negocio.
   */
  codigo?: string;
  nombre: string;
  /** Calificador corto: "Talle 2 · surtido". Se usa para detectar duplicados. */
  variante?: string;
  /** Texto libre y largo. Es otra cosa que `variante`. */
  descripcion?: string;
  categoria?: string;
  proveedorId?: Uuid;
  unidad: string;
  /** Ver `Cliente.activo`: desactivar, nunca borrar. El stock y las ventas siguen existiendo. */
  activo: boolean;
  /** Cuánto conviene llevar en el auto para una ruta típica. Es una preferencia, no stock. */
  sugeridoEnVehiculo?: number;
}

export interface Cliente {
  id: Uuid;
  negocioId: Uuid;
  nombre: string;
  /** Dónde está. En la app se muestra como "Ubicación". */
  zona?: string;
  /** Veterinaria, pet shop, forrajería. Sirve para ordenar y agrupar. */
  rubro?: string;
  /** Teléfono, WhatsApp o lo que sirva para ubicarlo. Texto libre a propósito. */
  contacto?: string;
  /** 0 = domingo */
  diaVisita?: number;
  plazoDias?: number;
  /**
   * `false` es lo más parecido a "borrado" que existe acá. Un comercio con ventas
   * no se puede borrar sin romper el historial: desaparece de las listas y se
   * deja de ofrecer, pero sus ventas viejas siguen siendo ciertas.
   */
  activo: boolean;
}

export interface Proveedor {
  id: Uuid;
  negocioId: Uuid;
  nombre: string;
  /** Dónde está. Se llama igual que en `Cliente` para que ordenar por
   *  ubicación sea una sola idea y no dos. */
  zona?: string;
  rubro?: string;
  contacto?: string;
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
  /**
   * Opcional SOLO en compras al contado.
   *
   * El caso real es la carga inicial: "estas diez unidades ya las tengo en casa".
   * Eso no se le compró a nadie hoy, así que no hay proveedor. Una compra en
   * cuenta, en cambio, siempre tiene uno — si no, sería una deuda con nadie, un
   * número que aparece en "vos les debés" y no se puede pagar nunca. La base lo
   * hace cumplir con un CHECK (`008_compra_sin_proveedor.sql`).
   */
  proveedorId?: Uuid;
  fecha: string;
  condicionPago: 'contado' | 'cuenta';
  totalCent: Cent;
  /**
   * Cuándo se anuló este ingreso, o ausente si sigue valiendo.
   *
   * La compra NO se borra: sus renglones y sus movimientos de stock son
   * inmutables por trigger. Anular es asentar movimientos de ajuste que
   * compensan la entrada y dejar esta marca, que es lo que hace que la compra
   * deje de sumar en la deuda con el proveedor y en el costo del producto.
   */
  anuladaEn?: string;
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
  /**
   * Cuándo se anuló esta venta, o ausente si sigue valiendo.
   *
   * Igual que en las compras: la venta NO se borra. Sus renglones y sus
   * movimientos de stock son inmutables por trigger. Anular es asentar los
   * movimientos que devuelven la mercadería y dejar esta marca, que es lo que
   * hace que la venta deje de contar en la caja del día, en la deuda del
   * comercio y en la ganancia.
   */
  anuladaEn?: string;
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
