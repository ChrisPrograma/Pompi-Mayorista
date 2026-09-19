/**
 * Buscar y ordenar — para las tres listas del catálogo.
 *
 * Son funciones puras: entra una lista, sale la misma lista filtrada u ordenada.
 * Ni React ni estado. Así se prueban sin navegador, que importa porque un orden
 * mal hecho no rompe nada visiblemente: la pantalla se dibuja perfecta y muestra
 * las cosas en la secuencia equivocada. Eso se nota recién cuando alguien busca
 * algo y no está donde esperaba.
 *
 * CUATRO DECISIONES QUE VALEN PARA TODO EL ARCHIVO:
 *
 * 1. **Ninguna función ordena en el lugar.** Todas copian primero (`[...lista]`).
 *    `Array.sort` muta, y estas listas vienen del estado de la app: ordenarlas en
 *    el lugar cambiaría el orden del estado sin que nadie lo pida.
 *
 * 2. **Los vacíos van al final, siempre y en las dos direcciones.** Un producto
 *    sin código no puede ganarle a uno que sí lo tiene, ni ordenando de la A a la
 *    Z ni al revés. Lo cargado se ve primero; lo que falta queda junto, abajo, y
 *    se nota que falta.
 *
 * 3. **El desempate es siempre el nombre**, en sentido ascendente. Sin esto, dos
 *    productos del mismo rubro aparecerían en un orden distinto cada vez que se
 *    dibuja la pantalla.
 *
 * 4. **Buscar ignora acentos y mayúsculas.** Nadie escribe "Morón" con tilde en
 *    el buscador de un celular parado en la vereda.
 */

import type { Cliente, Uuid } from '../domain/types.ts';
import type { DeudaVista, ProductoVista, ProveedorVista } from './vistas.ts';

export type Direccion = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Buscar
// ---------------------------------------------------------------------------

/**
 * Deja un texto listo para comparar: sin acentos, sin mayúsculas, sin espacios
 * de sobra. `normalize('NFD')` parte cada letra acentuada en letra + tilde, y el
 * reemplazo borra las tildes sueltas.
 */
const plano = (t?: string): string =>
  (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * ¿Alguno de esos campos contiene lo buscado?
 *
 * Busca por trozo y no por palabra entera: escribir "huel" tiene que encontrar
 * "Pet Shop Huellitas". Y busca cada palabra por separado, así "shop hue"
 * también lo encuentra aunque estén al revés.
 */
const coincide = (busqueda: string, campos: (string | undefined)[]): boolean => {
  const q = plano(busqueda);
  if (!q) return true;
  const heno = campos.map(plano).join(' ');
  return q.split(/\s+/).every((parte) => heno.includes(parte));
};

export const buscarProductos = (lista: ProductoVista[], q: string): ProductoVista[] =>
  q.trim() ? lista.filter((p) => coincide(q, [p.codigo, p.nombre, p.categoria, p.variante])) : lista;

export const buscarClientes = (lista: Cliente[], q: string): Cliente[] =>
  q.trim() ? lista.filter((c) => coincide(q, [c.nombre, c.zona, c.rubro])) : lista;

export const buscarProveedores = (lista: ProveedorVista[], q: string): ProveedorVista[] =>
  q.trim() ? lista.filter((p) => coincide(q, [p.nombre, p.zona, p.rubro])) : lista;

// ---------------------------------------------------------------------------
// Comparadores
// ---------------------------------------------------------------------------

/**
 * Compara textos como los lee una persona: sin distinguir mayúsculas ni acentos,
 * y con los números adentro del texto en orden numérico, para que "Talle 10" vaya
 * después de "Talle 9" y no antes.
 *
 * `dir` invierte SOLO la comparación entre dos valores presentes. Los vacíos
 * siguen yéndose al final en las dos direcciones — invertirlos también los
 * mandaría arriba de todo, que es justo lo que no se quiere.
 */
const porTexto = (a: string | undefined, b: string | undefined, dir: Direccion = 'asc'): number => {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  const c = x.localeCompare(y, 'es', { sensitivity: 'base', numeric: true });
  return dir === 'asc' ? c : -c;
};

/** Para códigos: numérico de verdad, y los sin código al final. */
const porCodigo = (a: string | undefined, b: string | undefined, dir: Direccion): number => {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  // "9" tiene que ir antes que "101". Alfabéticamente iría después.
  const na = Number(x);
  const nb = Number(y);
  const c = Number.isFinite(na) && Number.isFinite(nb) && na !== nb
    ? na - nb
    : x.localeCompare(y, 'es', { numeric: true });
  return dir === 'asc' ? c : -c;
};

/**
 * Números, con los que no tienen valor SIEMPRE al final.
 *
 * Escrito explícito y no invirtiendo argumentos: invertir un comparador
 * ascendente para obtener uno descendente también invierte dónde caen los
 * vacíos, y ahí los productos sin precio se irían al principio de la lista. Es
 * el tipo de error que no rompe nada, solo muestra el orden equivocado.
 */
const porNumero = (
  a: number | null | undefined, b: number | null | undefined, dir: Direccion,
): number => {
  const x = a ?? null;
  const y = b ?? null;
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return dir === 'asc' ? x - y : y - x;
};

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export type OrdenProducto = 'codigo' | 'nombre' | 'precio' | 'rubro';

export const ORDENES_PRODUCTO: { id: OrdenProducto; texto: string }[] = [
  { id: 'nombre', texto: 'Nombre' },
  { id: 'codigo', texto: 'Código' },
  { id: 'precio', texto: 'Precio' },
  { id: 'rubro', texto: 'Rubro' },
];

/**
 * Hacia dónde ordena cada criterio cuando se lo elige recién.
 *
 * El precio arranca de mayor a menor porque quien ordena por precio casi siempre
 * busca lo de arriba de la lista. Los demás arrancan de la A a la Z, que es como
 * se lee una lista. El botón de dirección invierte cualquiera de los dos.
 */
export const DIRECCION_INICIAL: Record<OrdenProducto, Direccion> = {
  nombre: 'asc', codigo: 'asc', rubro: 'asc', precio: 'desc',
};

export const ordenarProductos = (
  lista: ProductoVista[],
  orden: OrdenProducto,
  dir: Direccion = DIRECCION_INICIAL[orden],
): ProductoVista[] => {
  const copia = [...lista];
  switch (orden) {
    case 'codigo':
      return copia.sort((a, b) => porCodigo(a.codigo, b.codigo, dir) || porTexto(a.nombre, b.nombre));
    case 'precio':
      return copia.sort((a, b) =>
        porNumero(a.precioCent, b.precioCent, dir) || porTexto(a.nombre, b.nombre));
    case 'rubro':
      return copia.sort((a, b) =>
        porTexto(a.categoria, b.categoria, dir) || porTexto(a.nombre, b.nombre));
    case 'nombre':
    default:
      return copia.sort((a, b) => porTexto(a.nombre, b.nombre, dir));
  }
};

// ---------------------------------------------------------------------------
// Comercios
// ---------------------------------------------------------------------------

export type OrdenCliente = 'nombre' | 'ubicacion' | 'rubro' | 'deuda';

export const ORDENES_CLIENTE: { id: OrdenCliente; texto: string }[] = [
  { id: 'nombre', texto: 'Nombre' },
  { id: 'ubicacion', texto: 'Ubicación' },
  { id: 'rubro', texto: 'Rubro' },
  { id: 'deuda', texto: 'Deuda' },
];

export const DIRECCION_INICIAL_CLIENTE: Record<OrdenCliente, Direccion> = {
  // La deuda arranca de la más vieja: es el orden en el que hay que salir a cobrar.
  nombre: 'asc', ubicacion: 'asc', rubro: 'asc', deuda: 'desc',
};

/**
 * `deudas` es la lista que ya calcula `vistaDeudas`, con los días de atraso. Se
 * pasa como argumento en vez de recalcularla acá para que el número que ordena
 * sea exactamente el mismo que el que se ve en la pantalla.
 */
export const ordenarClientes = (
  lista: Cliente[],
  orden: OrdenCliente,
  dir: Direccion = DIRECCION_INICIAL_CLIENTE[orden],
  deudas: DeudaVista[] = [],
): Cliente[] => {
  const copia = [...lista];
  if (orden === 'ubicacion') {
    return copia.sort((a, b) => porTexto(a.zona, b.zona, dir) || porTexto(a.nombre, b.nombre));
  }
  if (orden === 'rubro') {
    return copia.sort((a, b) => porTexto(a.rubro, b.rubro, dir) || porTexto(a.nombre, b.nombre));
  }
  if (orden === 'deuda') {
    const dias = new Map<Uuid, number>(deudas.map((d) => [d.clienteId, d.dias]));
    return copia.sort((a, b) =>
      porNumero(dias.get(a.id), dias.get(b.id), dir) || porTexto(a.nombre, b.nombre));
  }
  return copia.sort((a, b) => porTexto(a.nombre, b.nombre, dir));
};

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export type OrdenProveedor = 'nombre' | 'ubicacion' | 'rubro' | 'deuda';

export const ORDENES_PROVEEDOR: { id: OrdenProveedor; texto: string }[] = [
  { id: 'nombre', texto: 'Nombre' },
  { id: 'ubicacion', texto: 'Ubicación' },
  { id: 'rubro', texto: 'Rubro' },
  { id: 'deuda', texto: 'Deuda' },
];

export const DIRECCION_INICIAL_PROVEEDOR: Record<OrdenProveedor, Direccion> = {
  nombre: 'asc', ubicacion: 'asc', rubro: 'asc', deuda: 'asc',
};

export const ordenarProveedores = (
  lista: ProveedorVista[],
  orden: OrdenProveedor,
  dir: Direccion = DIRECCION_INICIAL_PROVEEDOR[orden],
): ProveedorVista[] => {
  const copia = [...lista];
  if (orden === 'ubicacion') {
    return copia.sort((a, b) => porTexto(a.zona, b.zona, dir) || porTexto(a.nombre, b.nombre));
  }
  if (orden === 'rubro') {
    return copia.sort((a, b) => porTexto(a.rubro, b.rubro, dir) || porTexto(a.nombre, b.nombre));
  }
  if (orden === 'deuda') {
    // `deudaDesde` es la fecha de la compra en cuenta más vieja. Como es texto
    // ISO, el orden natural del texto ya es el cronológico; ascendente = la más
    // vieja primero. Los que no deben nada no tienen fecha y van al final.
    return copia.sort((a, b) =>
      porTexto(a.deudaDesde, b.deudaDesde, dir) || porTexto(a.nombre, b.nombre));
  }
  return copia.sort((a, b) => porTexto(a.nombre, b.nombre, dir));
};
