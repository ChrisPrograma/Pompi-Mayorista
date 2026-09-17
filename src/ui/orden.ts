/**
 * "Ordenar por" — para las tres listas del catálogo.
 *
 * Son funciones puras: entra una lista, sale la misma lista ordenada. Ni React
 * ni estado. Así el orden se prueba sin navegador, que importa porque un orden
 * mal hecho no rompe nada visiblemente: simplemente muestra las cosas en una
 * secuencia equivocada y él no se entera hasta que sale a la calle y no
 * encuentra un producto donde lo esperaba.
 *
 * TRES DECISIONES QUE VALEN PARA TODO EL ARCHIVO:
 *
 * 1. **Ninguna función ordena en el lugar.** Todas copian primero (`[...lista]`).
 *    `Array.sort` muta, y las listas que entran acá vienen del estado de la app:
 *    ordenarlas en el lugar cambiaría el orden del estado sin que nadie lo pida.
 *
 * 2. **Los vacíos van al final, siempre.** Un producto sin código o un comercio
 *    sin ubicación no puede ganarle a uno que sí lo tiene: lo que está cargado
 *    se ve primero, y lo que falta queda abajo, junto, y se nota que falta.
 *
 * 3. **El desempate es siempre el nombre.** Sin esto, dos productos del mismo
 *    rubro aparecerían en un orden distinto cada vez que se dibuja la pantalla.
 */

import type { Cliente, Uuid } from '../domain/types.ts';
import type { DeudaVista, ProductoVista, ProveedorVista } from './vistas.ts';

/**
 * Compara textos como los lee una persona: sin distinguir mayúsculas ni
 * acentos, y con los números adentro del texto en orden numérico, para que
 * "Talle 10" vaya después de "Talle 9" y no antes.
 */
const porTexto = (a?: string, b?: string): number => {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x && !y) return 0;
  if (!x) return 1;          // los vacíos, al final
  if (!y) return -1;
  return x.localeCompare(y, 'es', { sensitivity: 'base', numeric: true });
};

/** Igual que `porTexto`, pero para códigos: numérico y los sin código al final. */
const porCodigo = (a?: string, b?: string): number => {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  // Los códigos son dígitos, así que comparar como números es lo correcto:
  // "9" tiene que ir antes que "101", y alfabéticamente iría después.
  const na = Number(x);
  const nb = Number(y);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return x.localeCompare(y, 'es', { numeric: true });
};

/**
 * De mayor a menor, con los que no tienen valor SIEMPRE al final.
 *
 * Escrito aparte y explícito porque invertir los argumentos de un comparador
 * ascendente para obtener uno descendente también invierte dónde caen los
 * vacíos, y ahí los productos sin precio se irían al principio de la lista.
 * Es el tipo de error que no rompe nada: solo muestra el orden equivocado.
 */
const porNumeroDesc = (a: number | null | undefined, b: number | null | undefined): number => {
  const x = a ?? null;
  const y = b ?? null;
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return y - x;
};

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export type OrdenProducto = 'codigo' | 'nombre' | 'precio' | 'rubro';

export const ORDENES_PRODUCTO: { id: OrdenProducto; texto: string }[] = [
  { id: 'nombre', texto: 'A–Z' },
  { id: 'codigo', texto: 'Código' },
  { id: 'precio', texto: 'Precio' },
  { id: 'rubro', texto: 'Rubro' },
];

export const ordenarProductos = (
  lista: ProductoVista[],
  orden: OrdenProducto,
): ProductoVista[] => {
  const copia = [...lista];
  switch (orden) {
    case 'codigo':
      return copia.sort((a, b) => porCodigo(a.codigo, b.codigo) || porTexto(a.nombre, b.nombre));
    case 'precio':
      // De más caro a más barato: cuando alguien ordena por precio casi siempre
      // está buscando lo de arriba de la lista, no lo de abajo.
      return copia.sort((a, b) =>
        porNumeroDesc(a.precioCent, b.precioCent) || porTexto(a.nombre, b.nombre));
    case 'rubro':
      return copia.sort((a, b) => porTexto(a.categoria, b.categoria) || porTexto(a.nombre, b.nombre));
    case 'nombre':
    default:
      return copia.sort((a, b) => porTexto(a.nombre, b.nombre));
  }
};

// ---------------------------------------------------------------------------
// Comercios
// ---------------------------------------------------------------------------

export type OrdenCliente = 'nombre' | 'ubicacion' | 'deuda';

export const ORDENES_CLIENTE: { id: OrdenCliente; texto: string }[] = [
  { id: 'nombre', texto: 'A–Z' },
  { id: 'ubicacion', texto: 'Ubicación' },
  { id: 'deuda', texto: 'Deuda más vieja' },
];

/**
 * `deudas` es la lista que ya calcula `vistaDeudas`, con los días de atraso.
 * Se pasa como argumento en vez de recalcularla acá para que el número que
 * ordena sea exactamente el mismo que el que se muestra en pantalla.
 */
export const ordenarClientes = (
  lista: Cliente[],
  orden: OrdenCliente,
  deudas: DeudaVista[] = [],
): Cliente[] => {
  const copia = [...lista];
  if (orden === 'ubicacion') {
    return copia.sort((a, b) => porTexto(a.zona, b.zona) || porTexto(a.nombre, b.nombre));
  }
  if (orden === 'deuda') {
    const dias = new Map<Uuid, number>(deudas.map((d) => [d.clienteId, d.dias]));
    // Más días de atraso primero: es el orden en el que hay que salir a cobrar.
    // Quien no debe nada no tiene días, y va al final.
    return copia.sort((a, b) =>
      porNumeroDesc(dias.get(a.id), dias.get(b.id)) || porTexto(a.nombre, b.nombre));
  }
  return copia.sort((a, b) => porTexto(a.nombre, b.nombre));
};

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export type OrdenProveedor = 'nombre' | 'ubicacion' | 'deuda';

export const ORDENES_PROVEEDOR: { id: OrdenProveedor; texto: string }[] = [
  { id: 'nombre', texto: 'A–Z' },
  { id: 'ubicacion', texto: 'Ubicación' },
  { id: 'deuda', texto: 'Deuda más vieja' },
];

export const ordenarProveedores = (
  lista: ProveedorVista[],
  orden: OrdenProveedor,
): ProveedorVista[] => {
  const copia = [...lista];
  if (orden === 'ubicacion') {
    return copia.sort((a, b) => porTexto(a.zona, b.zona) || porTexto(a.nombre, b.nombre));
  }
  if (orden === 'deuda') {
    // `deudaDesde` es la fecha de la compra en cuenta más vieja. La más vieja es
    // la más chica, así que el orden natural del texto ISO ya sirve; los que no
    // deben nada no tienen fecha y `porTexto` los manda al final.
    return copia.sort((a, b) => porTexto(a.deudaDesde, b.deudaDesde) || porTexto(a.nombre, b.nombre));
  }
  return copia.sort((a, b) => porTexto(a.nombre, b.nombre));
};
