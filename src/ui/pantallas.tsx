import { useMemo, useState, type ChangeEvent } from 'react';
import { aCentavos, pesos, type Cent } from '../domain/money.ts';
import { fechaCorta, nombreDelRango, type Rango } from '../domain/fechas.ts';
import type { Uuid } from '../domain/types.ts';
import type { EstadoApp } from '../app/estado.ts';
import {
  sugerenciasPendientes,
  cuantosActivos,
  valorDelStock,
  vistaDeudas,
  vistaHoy,
  vistaNumeros,
  vistaParaVender,
  vistaProductos,
  vistaProveedores,
  type ProductoVista,
} from './vistas.ts';
import {
  DIRECCION_INICIAL, DIRECCION_INICIAL_CLIENTE, DIRECCION_INICIAL_PROVEEDOR,
  ORDENES_CLIENTE, ORDENES_PRODUCTO, ORDENES_PROVEEDOR,
  buscarClientes, buscarProductos, buscarProveedores,
  ordenarClientes, ordenarProductos, ordenarProveedores,
  type Direccion, type OrdenCliente, type OrdenProducto, type OrdenProveedor,
} from './orden.ts';
import {
  Alerta, Cantidad, Codigo, Icono, Paginado, claseCategoria, plata, plataCorta,
} from './componentes.tsx';
import { POR_PAGINA, paginaDe } from './paginado.ts';
/*
 * `tour` marca los elementos que el recorrido puede señalar. El import cruzado
 * con recorrido.ts no es un ciclo real: lo que va en la otra dirección es solo
 * el tipo `Ruta`, y los `import type` se borran al compilar.
 */
import { tour } from './recorrido.ts';

export type Ruta =
  | 'hoy' | 'vender' | 'deudas' | 'cosas'
  | 'productos' | 'clientes' | 'ingreso' | 'proveedores' | 'numeros';

export interface Acciones {
  ir: (r: Ruta) => void;
  vender: (
    clienteId: Uuid,
    items: { productoId: Uuid; cantidad: number }[],
    forma: 'efectivo' | 'cuenta' | 'mixto',
    /** Cuánto entregó de verdad. Es lo que decide qué parte va a la deuda. */
    cobradoCent: Cent,
  ) => void;
  cobrar: (clienteId: Uuid) => void;
  entrar: (
    proveedorId: Uuid,
    items: { productoId: Uuid; cantidad: number; costoUnitarioCent: Cent }[],
    condicion: 'contado' | 'cuenta',
    /** Si viene, este ingreso REEMPLAZA a ese: el viejo se anula en el mismo paso. */
    corrigeId?: Uuid,
  ) => void;
  verProducto: (p: ProductoVista) => void;
  nuevoCliente: (origen: 'vender' | 'clientes') => void;
  verCliente: (id: Uuid) => void;
  /** Abre el detalle de una venta ya hecha, con su comprobante. */
  verVenta: (id: Uuid) => void;
  /** Abre el detalle de un ingreso de mercadería, con la opción de anularlo. */
  verIngreso: (id: Uuid) => void;
  /** Abre la pantalla de ingreso cargada con los datos de ese, para corregirlo. */
  corregirIngreso: (id: Uuid) => void;
  nuevoProducto: () => void;
  nuevoProveedor: () => void;
  verProveedor: (id: Uuid) => void;
  /** El recorrido guiado: lo arranca el botón de la pantalla "Hoy". */
  iniciarRecorrido: () => void;
  recorridoDisponible: boolean;
  /** El mail de la sesión, o null si la app corre sin backend. */
  email: string | null;
  salir: () => void;
}

interface Props {
  estado: EstadoApp;
  hoy: string;
  acc: Acciones;
  /** Comercio recién dado de alta: la venta arranca directamente con él elegido. */
  clienteInicial?: Uuid | null;
  /**
   * Un ingreso que se está corrigiendo: la pantalla arranca con sus datos
   * cargados y, al confirmar, el viejo se anula. Ver `corregirIngreso`.
   */
  corrigiendo?: CorreccionIngreso | null;
}

/** Los datos de un ingreso, tal como los necesita la pantalla para rehacerlo. */
export interface CorreccionIngreso {
  compraId: Uuid;
  proveedorId: Uuid;
  /** Lo que tenía cargado: cantidad y costo por unidad, en pesos. */
  items: Record<Uuid, { cantidad: number; costo: number }>;
  condicion: 'contado' | 'cuenta';
  /** Para poder decirle cuál está corrigiendo: "el del 21/09 a las 14:24". */
  cuando: string;
}

const Volver = ({ acc }: { acc: Acciones }) => (
  <button className="btn ghost" style={{ alignSelf: 'flex-start', padding: '9px 14px', fontSize: 14 }}
    onClick={() => acc.ir('cosas')}>
    <Icono id="i-back" clase="ico-s" /> Mis cosas
  </button>
);

// ---------------------------------------------------------------------------
// Hoy
// ---------------------------------------------------------------------------
/**
 * Buscador + "ordenar por", la barra que llevan las tres listas del catálogo.
 *
 * Chips y no un `<select>` a propósito: en un celular un desplegable nativo tapa
 * media pantalla y pide dos toques. Acá las opciones se ven todas y cambiar el
 * orden es un solo toque, que es lo que va a hacer parado en la vereda.
 *
 * La dirección es un botón aparte y no dos chips por criterio. Con cuatro
 * criterios serían ocho chips, dos filas, y la mitad diciendo lo mismo al revés.
 * Así son cuatro chips y una flecha que se entiende sola.
 */
/**
 * El buscador solo, sin los chips de ordenar.
 *
 * Sale de adentro de `Barra` porque las pantallas de vender y de ingreso lo
 * necesitan sin el resto: ahí la lista no se ordena —el orden lo decide el
 * catálogo— pero sí hace falta encontrar un producto entre cien sin scrollear
 * con el comercio esperando enfrente.
 */
function Buscador({
  valor, alBuscar, ejemplo, cuantos, total,
}: {
  valor: string;
  alBuscar: (q: string) => void;
  ejemplo: string;
  cuantos: number;
  total: number;
}) {
  return (
    <>
      <div className="buscador">
        <Icono id="i-search" clase="ico-s" />
        <input className="texto" type="search" inputMode="search"
          value={valor} placeholder={ejemplo} aria-label="Buscar"
          onChange={(ev: ChangeEvent<HTMLInputElement>) => alBuscar(ev.target.value)} />
        {valor && (
          <button className="buscador-x" onClick={() => alBuscar('')} aria-label="Borrar la búsqueda">
            <Icono id="i-close" clase="ico-s" />
          </button>
        )}
      </div>

      {/* Solo cuando la búsqueda achica la lista: si no, es ruido permanente. */}
      {valor.trim() && (
        <p className="orden-et" role="status">
          {cuantos === 0 ? 'No encontré nada con eso' : `${cuantos} de ${total}`}
        </p>
      )}
    </>
  );
}

function Barra<T extends string>({
  opciones, valor, alCambiar, direccion, alInvertir,
  busqueda, alBuscar, ejemplo, cuantos, total,
}: {
  opciones: readonly { id: T; texto: string }[];
  valor: T;
  alCambiar: (v: T) => void;
  direccion: Direccion;
  alInvertir: () => void;
  busqueda: string;
  alBuscar: (q: string) => void;
  ejemplo: string;
  cuantos: number;
  total: number;
}) {
  const alfabetico = valor !== 'precio' && valor !== 'deuda';
  return (
    <div className="barra">
      <Buscador valor={busqueda} alBuscar={alBuscar} ejemplo={ejemplo}
        cuantos={cuantos} total={total} />

      <div className="orden" role="group" aria-label="Ordenar por">
        <span className="orden-et">Ordenar por</span>
        <div className="chips">
          {opciones.map((o) => (
            <button key={o.id} type="button"
              className={`chip ${o.id === valor ? 'on' : ''}`}
              aria-pressed={o.id === valor}
              onClick={() => alCambiar(o.id)}>
              {o.texto}
            </button>
          ))}
          <button type="button" className="chip dir" onClick={alInvertir}
            aria-label={direccion === 'asc' ? 'Cambiar a orden descendente' : 'Cambiar a orden ascendente'}
            title={direccion === 'asc' ? 'De menor a mayor' : 'De mayor a menor'}>
            {direccion === 'asc' ? '↑' : '↓'}
            <span className="dir-et">
              {alfabetico ? (direccion === 'asc' ? 'A–Z' : 'Z–A') : (direccion === 'asc' ? 'menor' : 'mayor')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Semana · Quincena · Mes.
 *
 * Tres botones y no un desplegable: un `select` en un celular abre una rueda del
 * sistema operativo, que para elegir entre tres cosas es un paso de más. Y son
 * estos tres porque son los cortes que usa el negocio — la semana en que sale a
 * la calle, la quincena en que le paga a los proveedores, el mes que cierra.
 */
const SelectorRango = ({ valor, alCambiar }: { valor: Rango; alCambiar: (r: Rango) => void }) => (
  <div className="orden" role="group" aria-label="Qué período mirar">
    <span className="orden-et">Mostrar</span>
    <div className="chips">
      {([['semana', 'Semana'], ['quincena', 'Quincena'], ['mes', 'Mes']] as const).map(([id, texto]) => (
        <button key={id} type="button" className={`chip ${id === valor ? 'on' : ''}`}
          aria-pressed={id === valor} onClick={() => alCambiar(id)}>
          {texto}
        </button>
      ))}
    </div>
  </div>
);

export const PantallaHoy = ({ estado, hoy, acc }: Props) => {
  /*
   * El rango de las dos secciones de abajo: lo que entró y lo que se anuló.
   *
   * Arranca en el mes porque es como él cierra los números. Es estado de la
   * pantalla y nada más: cambiarlo recalcula la vista en el momento, sin pedirle
   * nada al servidor ni recargar. Los números de arriba —cobré hoy, me deben— no
   * dependen del rango: son del día y de la calle, siempre.
   */
  const [rango, setRango] = useState<Rango>('mes');
  /*
   * Una página por lista. Cambiar el rango las vuelve todas a la primera: si
   * estaba en la página 3 de "mes" y pasa a "semana", quedarse en la 3 le
   * mostraría una lista vacía y parecería que no hay nada.
   */
  const [pagVentas, setPagVentas] = useState(0);
  const [pagIngresos, setPagIngresos] = useState(0);
  const [pagAnuladas, setPagAnuladas] = useState(0);
  const cambiarRango = (r: Rango) => {
    setRango(r); setPagVentas(0); setPagIngresos(0); setPagAnuladas(0);
  };
  const v = useMemo(() => vistaHoy(estado, hoy, rango), [estado, hoy, rango]);
  const pend = sugerenciasPendientes(estado);
  const hechas = Number(v.misiones.venta) + Number(v.misiones.cobro);

  /*
   * Primer día: la app está vacía porque recién se creó la cuenta.
   *
   * Acá NO va la pantalla normal con todo en cero. Dos razones. La primera es
   * que mentiría: "tu día en 2 pasos" le pide vender antes de tener qué vender.
   * La segunda es la que importa — abandonó dos o tres sistemas antes porque
   * "siempre me tranco con algo", y el momento de trancarse es justo este, con
   * una app en blanco y ninguna indicación de por dónde empezar.
   *
   * El orden de los tres pasos no es decorativo: un producto puede llevar su
   * carga inicial de stock, y para eso necesita un proveedor ya cargado.
   */
  if (cuantosActivos(estado.productos) === 0 && cuantosActivos(estado.clientes) === 0) {
    const pasos = [
      ['proveedores', 'i-truck', 'Cargá tus proveedores', 'A quién le comprás'],
      ['productos', 'i-box', 'Cargá tus productos', 'Qué vendés y a cuánto'],
      ['clientes', 'i-store', 'Cargá tus comercios', 'A quién le vendés'],
    ] as const;

    return (
      <div className="view">
        {acc.recorridoDisponible && (
          <button className="btn-recorrido" onClick={acc.iniciarRecorrido}>
            <Icono id="i-star" clase="ico-s" /> Ver cómo funciona, paso a paso
          </button>
        )}

        <Alerta tipo="ok" icono="i-paw" titulo="Tu negocio, en blanco"
          texto="No hay nada cargado todavía, y está bien: lo que pongas es lo tuyo, sin datos de ejemplo mezclados." />

        <p className="eyebrow">Para arrancar, en este orden</p>

        {pasos.map(([destino, icono, texto, sub], i) => (
          <button key={destino} className={i === 0 ? 'big-action' : 'second-action'}
            onClick={() => acc.ir(destino as Ruta)}>
            <span className="circ"><Icono id={icono} clase={i === 0 ? 'ico-xl' : ''} /></span>
            <span><b>{texto}</b><span>{sub}</span></span>
            <Icono id="i-arrow" clase={i === 0 ? 'ico-arrow' : 'ico-arrow ico-s'} />
          </button>
        ))}

        <p className="ingreso-pie" style={{ marginTop: 16, color: 'var(--ink-3)' }}>
          No hace falta cargar todo de una. Con un proveedor y un producto ya podés vender.
        </p>
      </div>
    );
  }

  return (
    <div className="view">
      {acc.recorridoDisponible && (
        <button className="btn-recorrido" onClick={acc.iniciarRecorrido}>
          <Icono id="i-star" clase="ico-s" /> Ver cómo funciona, paso a paso
        </button>
      )}

      <button className="big-action" {...tour('vender-ya')} onClick={() => acc.ir('vender')}>
        <span className="circ"><Icono id="i-cart" clase="ico-xl" /></span>
        <span><b>Vender ahora</b><span>Cargás el pedido y cobrás</span></span>
        <Icono id="i-arrow" clase="ico-arrow" />
      </button>

      <button className="second-action" {...tour('me-llego')} onClick={() => acc.ir('ingreso')}>
        <span className="circ"><Icono id="i-inbox" /></span>
        <span><b>Me llegó mercadería</b><span>Cargás lo que te trajo el proveedor</span></span>
        <Icono id="i-arrow" clase="ico-arrow ico-s" />
      </button>

      {pend.length > 0 && (
        <Alerta tipo="warn" icono="i-tag"
          titulo={`${pend.length} ${pend.length === 1 ? 'producto te llegó' : 'productos te llegaron'} más caro${pend.length === 1 ? '' : 's'}`}
          texto="Si no tocás tus precios, ganás menos sin darte cuenta."
          accion={{ texto: 'Revisar', alTocar: () => acc.ir('cosas') }} />
      )}

      {v.alertaDeuda && (
        <div {...tour('alerta')}>
        <Alerta tipo="bad" icono="i-alert"
          titulo={`${v.alertaDeuda.nombre} te debe hace ${v.alertaDeuda.dias} días`}
          texto={`Son ${plata(v.alertaDeuda.saldoCent)}. Es la deuda más vieja que tenés.`}
          accion={{ texto: 'Ver', alTocar: () => acc.ir('deudas') }} />
        </div>
      )}

      {/*
        * Sin productos no hay nada que vender, y es lo único que hay que decirle
        * acá. El cartel de "el auto está cargado" se fue con el auto: un solo
        * stock no tiene dos estados posibles que valga la pena avisar.
        */}
      {cuantosActivos(estado.productos) === 0 && (
        <Alerta tipo="warn" icono="i-box" titulo="Todavía no cargaste productos"
          texto="Sin productos no podés vender. Es lo primero."
          accion={{ texto: 'Cargar', alTocar: () => acc.ir('productos') }} />
      )}

      <div className="misiones" {...tour('misiones')}>
        <div className="mis-head">
          <Icono id="i-star" />
          <h3>Tu día en 2 pasos</h3>
          <span className="mis-count">{hechas} de 2</span>
        </div>
        <div className="progress"><i style={{ width: `${(hechas / 2) * 100}%` }} /></div>
        <ul className="mis-list">
          {([
            ['venta', 'Hacer una venta', 'vender'],
            ['cobro', 'Cobrar una deuda', 'deudas'],
          ] as const).map(([k, texto, destino]) => (
            <li key={k} className={v.misiones[k] ? 'done' : ''}>
              <span className="tick"><Icono id="i-check" clase="ico-s" /></span>
              <span>{texto}</span>
              {!v.misiones[k] && (
                <button className="mis-go" onClick={() => acc.ir(destino as Ruta)}>Ir</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {v.ruta.length > 0 && (
        <>
          <div className="section-h">
            <h2>La ruta de hoy</h2>
            <span className="hint">{v.ruta.filter((r) => !r.visitado).length} sin visitar</span>
          </div>
          <div className="stack">
            {v.ruta.map((c) => (
              <div className="row" key={c.clienteId}>
                <span className={`thumb ${c.visitado ? '' : 'c-juguete'}`}>
                  <Icono id={c.visitado ? 'i-check' : 'i-route'} />
                </span>
                <span className="row-main">
                  <b>{c.nombre}</b>
                  <span>{c.zona} · {c.visitado ? 'ya pasaste' : 'te falta pasar'}</span>
                </span>
                <span className="row-end">
                  {c.saldoCent > 0
                    ? <span className="pill warn">debe {plataCorta(c.saldoCent)}</span>
                    : <span className="pill ok">al día</span>}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {v.ventasDeHoy.length > 0 && (
        <>
          <div className="section-h">
            <h2>Lo que vendiste hoy</h2>
            <span className="hint">{plata(v.vendidoHoyCent)}</span>
          </div>
          <div className="stack" {...tour('ventas-hoy')}>
            {/*
              * Cada venta es un botón: tocándola se abre el detalle con los
              * productos y el botón para volver a mandar el comprobante. Es el
              * pedido más chico de todos y el que más veces se va a usar —
              * "mandámelo de nuevo" es lo que más le piden.
              */}
            {paginaDe(v.ventasDeHoy, pagVentas, POR_PAGINA).map((x) => (
              <button className="row" key={x.id} onClick={() => acc.verVenta(x.id)}>
                <span className="thumb">
                  <span style={{ fontFamily: 'Archivo', fontWeight: 700, fontSize: 12 }}>{x.hora}</span>
                </span>
                <span className="row-main"><b>{x.cliente}</b><span>{x.items} productos</span></span>
                <span className="row-end">
                  <b>{plata(x.totalCent)}</b>
                  <span>
                    {x.estado === 'cobrado' ? 'cobrado'
                      : x.estado === 'parcial' ? `pagó ${plataCorta(x.cobradoCent)}`
                      : 'quedó debiendo'}
                  </span>
                </span>
                <Icono id="i-arrow" clase="ico-s ico-arrow" />
              </button>
            ))}
          </div>
          <Paginado pagina={pagVentas} porPagina={POR_PAGINA}
            total={v.ventasDeHoy.length} alCambiar={setPagVentas} />
        </>
      )}

      {/*
        * "Lo que ingresó", al lado de lo que vendió.
        *
        * Va DEBAJO de las ventas y no arriba: lo que entra es plata que sale, y
        * la pantalla de inicio tiene que abrir con lo que ganó. Pero tiene que
        * estar, porque cargar mal un ingreso es el error más fácil de cometer
        * —un cero de más en la cantidad— y hasta ahora no había dónde verlo el
        * mismo día.
        */}
      {(v.ingresosDelRango.length > 0 || v.anuladasDelRango.length > 0) && (
        <SelectorRango valor={rango} alCambiar={cambiarRango} />
      )}

      {v.ingresosDelRango.length > 0 && (
        <>
          <div className="section-h">
            <h2>Lo que ingresó {nombreDelRango(rango, hoy)}</h2>
            <span className="hint">{plata(v.ingresadoDelRangoCent)}</span>
          </div>
          <div className="stack" {...tour('ingresos-hoy')}>
            {paginaDe(v.ingresosDelRango, pagIngresos, POR_PAGINA).map((x) => (
              <button className={`row ${x.anulada ? 'anulada' : ''}`} key={x.id}
                onClick={() => acc.verIngreso(x.id)}>
                {/*
                  * Antes acá iba solo la hora, porque la lista era del día. Con
                  * el rango en semana o mes, una hora suelta no ubica nada: va
                  * el día arriba y la hora abajo.
                  */}
                <span className="thumb">
                  <span style={{ fontFamily: 'Archivo', fontWeight: 700, fontSize: 11.5, lineHeight: 1.15, textAlign: 'center' }}>
                    {fechaCorta(x.fecha)}<br />{x.hora}
                  </span>
                </span>
                <span className="row-main">
                  <b>{x.proveedor}</b>
                  <span>
                    {x.unidades} u. en {x.productos === 1 ? '1 producto' : `${x.productos} productos`}
                  </span>
                </span>
                <span className="row-end">
                  <b>{plata(x.totalCent)}</b>
                  <span>
                    {x.anulada ? 'anulado'
                      : x.condicionPago === 'cuenta' ? 'se lo debés' : 'pagado'}
                  </span>
                </span>
                <Icono id="i-arrow" clase="ico-s ico-arrow" />
              </button>
            ))}
          </div>
          <Paginado pagina={pagIngresos} porPagina={POR_PAGINA}
            total={v.ingresosDelRango.length} alCambiar={setPagIngresos} />
        </>
      )}

      {/*
        * Lo que anuló este mes.
        *
        * Bloque aparte y último de todo, a propósito. Una anulación no es
        * actividad del día —puede ser la corrección de algo de hace dos
        * semanas—, así que mezclarla arriba ensuciaría los números que él mira
        * primero. Pero tampoco puede desaparecer: si se equivocó al anular,
        * este es el único lugar donde lo va a ver sin ir a buscarlo.
        *
        * Se limpia solo el 1° del mes siguiente. No se borra nada: la venta
        * anulada sigue entera en su ficha y en la base.
        */}
      {v.anuladasDelRango.length > 0 && (
        <>
          <div className="section-h">
            <h2>Anulado {nombreDelRango(rango, hoy)}</h2>
            <span className="hint">
              {v.anuladasDelRango.length === 1 ? '1 comprobante' : `${v.anuladasDelRango.length} comprobantes`}
            </span>
          </div>
          <div className="stack" {...tour('anulado-mes')}>
            {paginaDe(v.anuladasDelRango, pagAnuladas, POR_PAGINA).map((x) => (
              <button className="row anulada" key={x.id}
                onClick={() => (x.tipo === 'venta' ? acc.verVenta(x.id) : acc.verIngreso(x.id))}>
                <span className="thumb">
                  <Icono id={x.tipo === 'venta' ? 'i-cart' : 'i-inbox'} />
                </span>
                <span className="row-main">
                  <b>
                    {/* El tipo, en una chapita: de un vistazo se distingue una
                        venta a un comercio de una entrada de un proveedor. */}
                    <span className={`pill ${x.tipo === 'venta' ? 'mute' : 'warn'}`}
                      style={{ marginRight: 6 }}>
                      {x.tipo === 'venta' ? 'Venta' : 'Ingreso'}
                    </span>
                    {x.conQuien}
                  </b>
                  <span>
                    {x.tipo === 'venta' ? 'Vendido' : 'Ingresado'} el {fechaCorta(x.fecha)}
                    {' · '}anulado el {fechaCorta(x.anuladaEn)}
                  </span>
                </span>
                <span className="row-end">
                  <b>{plata(x.totalCent)}</b>
                  <span>anulado</span>
                </span>
                <Icono id="i-arrow" clase="ico-s ico-arrow" />
              </button>
            ))}
          </div>
          <Paginado pagina={pagAnuladas} porPagina={POR_PAGINA}
            total={v.anuladasDelRango.length} alCambiar={setPagAnuladas} />
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Vender
// ---------------------------------------------------------------------------
export const PantallaVender = ({ estado, hoy, acc, clienteInicial }: Props) => {
  const [paso, setPaso] = useState(clienteInicial ? 2 : 1);
  const [clienteId, setClienteId] = useState<Uuid | null>(clienteInicial ?? null);
  const [items, setItems] = useState<Record<Uuid, number>>({});
  /*
   * Las tres opciones son del cliente, y están puestas en el orden en el que
   * pasan de verdad: casi siempre le pagan todo, a veces una parte, y de vez en
   * cuando queda anotado. Antes eran "efectivo" y "transferencia", que son la
   * misma cosa para la cuenta corriente y lo obligaban a elegir algo que no le
   * cambia nada.
   */
  const [forma, setForma] = useState<'total' | 'parte' | 'debe' | null>(null);
  /** Lo que entrega, en pesos, tal como él lo tipea. Solo aplica a "una parte". */
  const [entrega, setEntrega] = useState('');
  /** Lo que escribió en el buscador del paso 2. */
  const [q, setQ] = useState('');

  const productos = useMemo(() => vistaParaVender(estado), [estado]);
  /*
   * Lo que se DIBUJA. Filtrar acá y no en `productos` es lo que hace que las
   * cantidades ya elegidas no se pierdan: el pedido vive en `items`, por id de
   * producto, así que buscar solo cambia qué filas se ven. Escribe "col", carga
   * tres collares, borra la búsqueda, y los tres collares siguen en el carrito.
   */
  const visibles = useMemo(() => buscarProductos(productos, q), [productos, q]);
  const deudas = useMemo(() => vistaDeudas(estado, hoy), [estado, hoy]);
  const cliente = estado.clientes.find((c) => c.id === clienteId);

  const lineas = Object.entries(items).filter(([, q]) => q > 0);
  const total = lineas.reduce((a, [id, q]) => {
    const p = productos.find((x) => x.id === id);
    return a + (p?.precioCent ?? 0) * q;
  }, 0);
  const unidades = lineas.reduce((a, [, q]) => a + q, 0);

  if (paso === 1) {
    return (
      <div className="view">
        <div className="steps"><i className="on" /><i /><i /></div>
        <div className="step-title"><span className="n">1</span><h2>¿A quién le vendés?</h2></div>
        <div className="stack" {...tour('lista-clientes')}>
          {estado.clientes.filter((c) => c.activo).length === 0 && (
            <Alerta tipo="ok" icono="i-store" titulo="Todavía no tenés comercios cargados"
              texto="No importa: cargalo acá abajo y seguís con la venta sin salir de esta pantalla." />
          )}
          {estado.clientes.filter((c) => c.activo).map((c) => {
            const d = deudas.lista.find((x) => x.clienteId === c.id);
            return (
              <button className="row" key={c.id}
                onClick={() => { setClienteId(c.id); setPaso(2); }}>
                <span className="thumb"><Icono id="i-user" /></span>
                <span className="row-main"><b>{c.nombre}</b><span>{c.zona}</span></span>
                <span className="row-end">
                  {d ? <span className={`pill ${d.antiguedad === 'muy_atrasado' ? 'bad' : 'warn'}`}>
                    debe {plataCorta(d.saldoCent)}</span>
                    : <span className="pill ok">al día</span>}
                </span>
              </button>
            );
          })}

          <button className="row" {...tour('cliente-nuevo')} onClick={() => acc.nuevoCliente('vender')}>
            <span className="thumb c-juguete"><Icono id="i-plus" /></span>
            <span className="row-main">
              <b>Es un comercio nuevo</b>
              <span>Lo cargás en diez segundos y seguís con la venta</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  if (paso === 2) {
    const d = deudas.lista.find((x) => x.clienteId === clienteId);
    return (
      <div className="view">
        <div className="steps"><i className="on" /><i className="on" /><i /></div>
        <div className="step-title"><span className="n">2</span><h2>¿Qué se lleva?</h2></div>
        <Alerta tipo={d ? 'warn' : 'ok'} icono={d ? 'i-alert' : 'i-check'}
          titulo={cliente?.nombre ?? ''}
          texto={d
            ? `Ojo: ya te debe ${plata(d.saldoCent)} de hace ${d.dias} días.`
            : 'Está al día con vos.'}
          accion={{ texto: 'Cambiar', alTocar: () => setPaso(1) }} />

        <p className="eyebrow">Qué le vendés</p>
        {/* El buscador aparece recién cuando hay lista como para perderse. */}
        {(productos.length > 6 || q) && (
          <div {...tour('buscador-venta')}>
            <Buscador valor={q} alBuscar={setQ} ejemplo="Buscar por código o nombre…"
              cuantos={visibles.length} total={productos.length} />
          </div>
        )}
        <div className="stack" {...tour('lista-productos')}>
          {/*
            * Esta lista sale de `vistaParaVender`, que muestra lo que hay EN EL
            * AUTO. Puede estar vacía por dos motivos muy distintos, y decir
            * "no hay nada" para los dos lo dejaría sin saber qué hacer.
            */}
          {productos.length === 0 && (
            cuantosActivos(estado.productos) === 0 ? (
              <Alerta tipo="warn" icono="i-box" titulo="Todavía no cargaste productos"
                texto="Sin productos no hay nada para vender. Se cargan una sola vez y quedan."
                accion={{ texto: 'Cargar', alTocar: () => acc.ir('productos') }} />
            ) : (
              /*
               * Hay productos pero ninguno aparece: a todos les falta el precio.
               * Antes este caso era "no tenés nada arriba del auto"; sin el auto,
               * el único motivo que queda es ese, y conviene decirlo exacto.
               */
              <Alerta tipo="warn" icono="i-tag" titulo="Ninguno tiene precio de venta"
                texto="Para vender algo hace falta saber a cuánto. Ponéselo en la ficha del producto."
                accion={{ texto: 'Ver productos', alTocar: () => acc.ir('productos') }} />
            )
          )}
          {visibles.map((p) => (
            <div className="row" key={p.id}>
              <span className={`thumb ${claseCategoria(p.categoria)}`}><Icono id="i-box" /></span>
              <span className="row-main">
                <b><Codigo valor={p.codigo} />{p.nombre}</b>
                {/*
                  * Sin tope en la cantidad, a propósito. El stock que muestra es
                  * lo que el sistema cree que hay, y puede estar atrasado: si él
                  * ya vendió seis y la app dice cuatro, lo que está mal es la
                  * app. Poner un máximo acá haría que la venta no se anote.
                  */}
                <span>
                  {plata(p.precioCent!)} c/u
                  {p.enStock > 0 ? ` · quedan ${p.enStock}` : ' · sin stock anotado'}
                </span>
              </span>
              <Cantidad valor={items[p.id] ?? 0} etiqueta={`Cantidad de ${p.nombre}`}
                alCambiar={(n) => setItems({ ...items, [p.id]: Math.max(0, n) })} />
            </div>
          ))}
        </div>

        <div className="cartbar">
          <span className="tot">
            <span>{unidades} productos</span>
            <b className="num">{plata(total)}</b>
          </span>
          <button className="btn accent" style={{ marginLeft: 'auto' }}
            disabled={unidades === 0} onClick={() => setPaso(3)}>
            Cobrar <Icono id="i-arrow" clase="ico-s" />
          </button>
        </div>
      </div>
    );
  }

  /*
   * Las cuentas del pago parcial.
   *
   * `entregaCent` se recorta contra el total: si tipea de más, se toma la venta
   * entera y nada más. Un cobrado mayor que el total daría una deuda negativa,
   * o sea el sistema diciéndole que él le debe plata al comercio.
   *
   * El botón se bloquea solo en los dos casos en que el número no quiere decir
   * nada: cero (ahí la opción correcta es "me lo debe todo") y el total exacto
   * (ahí es "me paga el total"). No es rigor por el rigor — si dejara pasar un
   * parcial de cero, la venta quedaría igual que una a cuenta pero anotada como
   * pago parcial, y el comprobante diría dos cosas distintas.
   */
  const entregaCent = Math.min(aCentavos(entrega), total);
  const restoCent = Math.max(0, total - entregaCent);
  const avisoParcial =
    forma !== 'parte' || !entrega.trim() ? null
      : entregaCent <= 0 ? 'Poné cuánto te entrega. Si no te paga nada, elegí "Me lo debe todo".'
      : restoCent === 0 ? 'Te está pagando todo. Para eso está "Me paga el total".'
      : null;
  const puedeCerrar =
    forma === 'total' || forma === 'debe'
      ? true
      : forma === 'parte' && entregaCent > 0 && restoCent > 0;

  return (
    <div className="view">
      <div className="steps"><i className="on" /><i className="on" /><i className="on" /></div>
      <div className="step-title"><span className="n">3</span><h2>¿Cómo te paga?</h2></div>

      <div className="card">
        <div className="eyebrow">{cliente?.nombre} se lleva</div>
        <div className="stack" style={{ marginTop: 10 }}>
          {lineas.map(([id, q]) => {
            const p = productos.find((x) => x.id === id)!;
            return (
              <div key={id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 14 }}>
                <b style={{ fontFamily: 'Archivo', minWidth: 30 }}>{q}×</b>
                <span style={{ flex: 1 }}>{p.nombre}</span>
                <span className="num" style={{ fontWeight: 600 }}>{plata(p.precioCent! * q)}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 13, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <span style={{ fontWeight: 600 }}>Total</span>
          <b className="num" style={{ marginLeft: 'auto', fontFamily: 'Archivo', fontSize: 25, fontWeight: 700 }}>
            {plata(total)}
          </b>
        </div>
      </div>

      <div className="stack">
        {([
          ['total', 'i-cash', 'Me paga el total', 'Registra el cobro completo de la venta', false],
          ['parte', 'i-split', 'Me paga una parte', 'Ingresás lo que te entrega y el resto va a deuda', false],
          ['debe', 'i-clock', 'Me lo debe todo', 'El total se suma a su cuenta corriente', true],
        ] as const).map(([valor, icono, titulo, sub, esDeuda]) => (
          <div key={valor}>
            <button className={`pay-opt ${esDeuda ? 'debt' : ''}`}
              aria-pressed={forma === valor} onClick={() => setForma(valor)}>
              <span className={`thumb ${esDeuda ? 'c-higiene' : ''}`}><Icono id={icono} /></span>
              <span style={{ flex: 1 }}><b>{titulo}</b><span>{sub}</span></span>
            </button>

            {/*
              * El campo aparece pegado a la opción y solo cuando la elige. Si
              * estuviera siempre visible sería un campo vacío que hay que
              * ignorar en el 90% de las ventas, y esas son las que lo cansan.
              */}
            {valor === 'parte' && forma === 'parte' && (
              <div className="parcial">
                <label className="campo">
                  <span>¿Cuánto te entrega?</span>
                  <input className="texto num" inputMode="decimal" autoFocus
                    value={entrega} placeholder="0"
                    onChange={(ev: ChangeEvent<HTMLInputElement>) =>
                      setEntrega(ev.target.value.replace(/[^0-9.,]/g, ''))} />
                </label>

                <div className="parcial-cuentas">
                  <div><span>Te entrega</span><b className="num">{plata(entregaCent)}</b></div>
                  <div className={restoCent > 0 ? 'debe' : ''}>
                    <span>Queda debiendo</span><b className="num">{plata(restoCent)}</b>
                  </div>
                </div>

                {avisoParcial && <p className="parcial-aviso" role="status">{avisoParcial}</p>}
              </div>
            )}
          </div>
        ))}
      </div>

      <button className="btn accent lg block" disabled={!puedeCerrar}
        onClick={() => puedeCerrar && clienteId && acc.vender(
          clienteId,
          lineas.map(([productoId, cantidad]) => ({ productoId, cantidad })),
          forma === 'debe' ? 'cuenta' : forma === 'parte' ? 'mixto' : 'efectivo',
          forma === 'total' ? total : forma === 'parte' ? entregaCent : 0,
        )}>
        Cerrar la venta
      </button>
      <button className="btn outline block" onClick={() => setPaso(2)}>Volver a los productos</button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Me deben
// ---------------------------------------------------------------------------
export const PantallaDeudas = ({ estado, hoy, acc }: Props) => {
  const v = useMemo(() => vistaDeudas(estado, hoy), [estado, hoy]);
  const etiqueta = { muy_atrasado: 'muy atrasado', atrasado: 'atrasado', reciente: 'reciente' };

  return (
    <div className="view">
      <div className="hero-n">
        <span>En la calle tenés</span>
        <b>{plata(v.totalCent)}</b>
        <em>repartidos en {v.lista.length} comercios</em>
      </div>

      <div className="section-h"><h2>Quién te debe</h2><span className="hint">de más viejo a más nuevo</span></div>
      <div className="stack" {...tour('lista-deudas')}>
        {/* Con cero comercios, "cobraste todo" sería un elogio por no haber vendido. */}
        {v.lista.length === 0 && (
          estado.clientes.filter((c) => c.activo).length === 0 ? (
            <Alerta tipo="ok" icono="i-store" titulo="Todavía no tenés comercios cargados"
              texto="Acá vas a ver quién te debe y desde cuándo, ordenado de la deuda más vieja a la más nueva."
              accion={{ texto: 'Cargar', alTocar: () => acc.ir('clientes') }} />
          ) : (
            <Alerta tipo="ok" icono="i-check" titulo="No te debe nadie"
              texto="Cobraste todo. Rarísimo y hermoso." />
          )
        )}
        {v.lista.map((d) => (
          <button className="row" key={d.clienteId} onClick={() => acc.cobrar(d.clienteId)}>
            <span className={`thumb ${d.antiguedad === 'muy_atrasado' ? 'c-bad' : ''}`}>
              <Icono id={d.antiguedad === 'muy_atrasado' ? 'i-alert' : 'i-clock'} />
            </span>
            <span className="row-main"><b>{d.nombre}</b><span>{d.zona} · hace {d.dias} días</span></span>
            <span className="row-end">
              <b>{plata(d.saldoCent)}</b>
              <span className={`pill ${d.antiguedad === 'muy_atrasado' ? 'bad' : d.antiguedad === 'atrasado' ? 'warn' : 'mute'}`}>
                {etiqueta[d.antiguedad]}
              </span>
            </span>
          </button>
        ))}
      </div>

      {v.alDia.length > 0 && (
        <>
          <div className="section-h"><h2>Al día</h2><span className="hint">{v.alDia.length} comercios</span></div>
          <div className="stack">
            {v.alDia.map((c) => (
              <div className="row" key={c.clienteId}>
                <span className="thumb" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
                  <Icono id="i-check" />
                </span>
                <span className="row-main"><b>{c.nombre}</b><span>{c.zona}</span></span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Mis cosas (hub)
// ---------------------------------------------------------------------------
export const PantallaCosas = ({ estado, acc }: Props) => {
  const prov = vistaProveedores(estado);
  const pend = sugerenciasPendientes(estado);
  // Los mismos que muestran las listas: archivar tiene que bajar el número.
  const nProductos = cuantosActivos(estado.productos);
  const nClientes = cuantosActivos(estado.clientes);
  const nProveedores = prov.lista.length;

  return (
    <div className="view">
      {pend.length > 0 && (
        <Alerta tipo="warn" icono="i-tag"
          titulo={`${pend.length} ${pend.length === 1 ? 'precio para revisar' : 'precios para revisar'}`}
          texto="Te llegaron más caros y todavía no tocaste el precio de venta."
          accion={{ texto: 'Ver', alTocar: () => acc.ir('productos') }} />
      )}

      <div className="section-h"><h2>Mis cosas</h2><span className="hint">todo lo tuyo, ordenado</span></div>
      <div className="hub" {...tour('hub')}>
        <button onClick={() => acc.ir('ingreso')}>
          <span className="thumb"><Icono id="i-inbox" /></span>
          <b>Me llegó mercadería</b><span>Entrás lo que te trajo el proveedor</span>
        </button>
        <button onClick={() => acc.ir('productos')}>
          <span className="thumb"><Icono id="i-box" /></span>
          <b>Mis productos</b>
          <span>{nProductos === 1 ? '1 producto' : `${nProductos} productos`}</span>
        </button>
        <button onClick={() => acc.ir('proveedores')}>
          <span className="thumb c-higiene"><Icono id="i-store" /></span>
          <b>Mis proveedores</b>
          {/*
            * Esta tarjeta mostraba solo la deuda, así que era la única del hub
            * sin decir cuántos hay. Va el número primero, como en las otras dos,
            * y la deuda atrás, que es lo que él mira todos los días.
            */}
          <span>
            {nProveedores === 1 ? '1 proveedor' : `${nProveedores} proveedores`}
            {prov.totalCent > 0 ? ` · les debés ${plataCorta(prov.totalCent)}` : ' · estás al día'}
          </span>
        </button>
        <button onClick={() => acc.ir('clientes')}>
          <span className="thumb c-descanso"><Icono id="i-user" /></span>
          <b>Mis clientes</b>
          <span>{nClientes === 1 ? '1 comercio' : `${nClientes} comercios`}</span>
        </button>
        <button onClick={() => acc.ir('numeros')}>
          <span className="thumb c-juguete"><Icono id="i-chart" /></span>
          <b>Cómo me fue</b><span>Ganancia del mes</span>
        </button>
      </div>



      {/* Solo aparece si entró con su cuenta. Va acá abajo y no en un menú: es
          algo que hace una vez por año, y esconderlo en un engranaje sería peor. */}
      {acc.email && (
        <button className="btn-salir" onClick={acc.salir}>
          Salir de {acc.email}
          <span>Vas a tener que poner la contraseña de nuevo para entrar</span>
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------
export const PantallaProductos = ({ estado, acc }: Props) => {
  const capital = useMemo(() => valorDelStock(estado), [estado]);
  const [orden, setOrden] = useState<OrdenProducto>('nombre');
  const [dir, setDir] = useState<Direccion>(DIRECCION_INICIAL.nombre);
  const [q, setQ] = useState('');
  const todos = useMemo(() => vistaProductos(estado), [estado]);
  const productos = useMemo(
    () => ordenarProductos(buscarProductos(todos, q), orden, dir),
    [todos, q, orden, dir],
  );
  // Al cambiar de criterio se vuelve a su dirección natural: el precio arranca de
  // mayor a menor, el nombre de la A a la Z. Si se conservara la dirección
  // anterior, pasar de "nombre Z–A" a "precio" daría el precio al revés de lo
  // esperado sin que nadie lo haya pedido.
  const cambiarOrden = (o: OrdenProducto) => { setOrden(o); setDir(DIRECCION_INICIAL[o]); };
  return (
    <div className="view">
      <Volver acc={acc} />
      <div className="section-h"><h2>Mis productos</h2><span className="hint">tocá uno para ver la ganancia</span></div>

      {/*
        * Cuánta plata tiene parada en mercadería.
        *
        * Dos números porque son dos preguntas: cuánto PUSO (a costo, el capital
        * inmovilizado) y cuánto va a SACAR si lo vende todo. El primero le dice
        * si está sobrecargado de stock; el segundo, cuánto tiene para facturar.
        */}
      {capital.productos > 0 && (
        <>
          <div className="capital">
            <div className="fuerte">
              <b>{plata(capital.costoCent)}</b>
              <span>capital en productos</span>
            </div>
            <div>
              <b>{plata(capital.ventaCent)}</b>
              <span>si lo vendés todo</span>
            </div>
          </div>
          <p className="hint" style={{ fontSize: 14.5, marginTop: -8 }}>
            {capital.unidades} unidades en {capital.productos === 1 ? '1 producto' : `${capital.productos} productos`}
          </p>
          {/*
            * Sin esto el capital estaría subestimado EN SILENCIO, y encima se
            * arreglaría solo a medida que cargue costos, que es la peor forma de
            * que un número se mueva: sin que nadie sepa por qué.
            */}
          {capital.sinCosto > 0 && (
            <p className="capital-nota" role="status">
              {capital.sinCosto === 1
                ? '1 producto con stock no tiene costo cargado, así que no suma en el capital.'
                : `${capital.sinCosto} productos con stock no tienen costo cargado, así que no suman en el capital.`}
            </p>
          )}
        </>
      )}

      <button className="second-action" {...tour('producto-nuevo')} onClick={acc.nuevoProducto}>
        <span className="circ"><Icono id="i-plus" /></span>
        <span><b>Agregar un producto</b><span>Nombre y a cuánto lo vendés</span></span>
        <Icono id="i-arrow" clase="ico-arrow ico-s" />
      </button>

      {(todos.length > 1 || q) && (
        <div {...tour('buscador')}>
          <Barra opciones={ORDENES_PRODUCTO} valor={orden} alCambiar={cambiarOrden}
            direccion={dir} alInvertir={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            busqueda={q} alBuscar={setQ} ejemplo="Buscar por código, nombre o rubro"
            cuantos={productos.length} total={todos.length} />
        </div>
      )}

      <div className="stack" {...tour('lista-productos-todos')}>
        {productos.length === 0 && (
          <Alerta tipo="ok" icono="i-box" titulo="Todavía no cargaste ningún producto"
            texto="Con el nombre y el precio de venta ya alcanza para empezar a vender. El costo y el stock los podés poner después."
            accion={{ texto: 'Agregar', alTocar: acc.nuevoProducto }} />
        )}
        {productos.map((p) => (
          <button className="row" key={p.id} onClick={() => acc.verProducto(p)}>
            <span className={`thumb ${claseCategoria(p.categoria)}`}><Icono id="i-box" /></span>
            <span className="row-main">
              <b><Codigo valor={p.codigo} />{p.nombre}</b>
              <span>{[p.variante, `${p.enStock} unidades`].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="row-end">
              <b>{p.precioCent !== null ? plata(p.precioCent) : '—'}</b>
              {p.margen !== null && (
                <span className={`pill ${p.margen >= 0.42 ? 'ok' : 'mute'}`}>
                  ganás {Math.round(p.margen * 100)}%
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Me llegó mercadería
// ---------------------------------------------------------------------------
export const PantallaIngreso = ({ estado, acc, corrigiendo }: Props) => {
  /*
   * Corrigiendo un ingreso, la pantalla arranca en el paso 2 con todo cargado:
   * el proveedor ya se sabe, y lo que hay que cambiar es una cantidad o un
   * costo. Mandarlo de nuevo por el paso 1 sería hacerle elegir algo que ya
   * eligió.
   */
  const [paso, setPaso] = useState(corrigiendo ? 2 : 1);
  const [proveedorId, setProveedorId] = useState<Uuid | null>(corrigiendo?.proveedorId ?? null);
  const [items, setItems] = useState<Record<Uuid, { cantidad: number; costo: number }>>(
    corrigiendo?.items ?? {},
  );
  const [condicion, setCondicion] = useState<'contado' | 'cuenta' | null>(
    corrigiendo?.condicion ?? null,
  );
  const [q, setQ] = useState('');

  const prov = vistaProveedores(estado);
  const productos = useMemo(() => vistaProductos(estado), [estado]);
  const delProveedor = productos.filter(
    (p) => estado.productos.find((x) => x.id === p.id)?.proveedorId === proveedorId,
  );
  // Igual que en la venta: filtrar solo cambia qué filas se ven; lo cargado vive
  // en `items` y no se pierde al buscar.
  const visibles = buscarProductos(delProveedor, q);
  const lineas = Object.entries(items).filter(([, v]) => v.cantidad > 0);
  const total = lineas.reduce((a, [, v]) => a + pesos(v.costo) * v.cantidad, 0);
  const unidades = lineas.reduce((a, [, v]) => a + v.cantidad, 0);

  if (paso === 1) {
    return (
      <div className="view">
        <div className="steps"><i className="on" /><i /><i /></div>
        <div className="step-title"><span className="n">1</span><h2>¿Quién te trajo?</h2></div>
        <div className="stack" {...tour('lista-proveedores')}>
          {/*
            * Sin esto la pantalla quedaba en blanco y sin salida: ni un botón
            * para agregar el proveedor, ni una explicación. Es justo el tipo de
            * pantalla donde alguien se tranca y no vuelve a abrir la app.
            */}
          {prov.lista.length === 0 && (
            <Alerta tipo="warn" icono="i-store" titulo="Todavía no cargaste proveedores"
              texto="Para anotar una entrada de mercadería hace falta saber quién te la trajo. Con el nombre alcanza."
              accion={{ texto: 'Cargar', alTocar: () => acc.ir('proveedores') }} />
          )}
          {prov.lista.map((p) => (
            <button className="row" key={p.id} onClick={() => { setProveedorId(p.id); setPaso(2); }}>
              <span className="thumb"><Icono id="i-store" /></span>
              <span className="row-main"><b>{p.nombre}</b><span>{p.rubro}</span></span>
              <span className="row-end">
                {p.deboCent > 0
                  ? <span className="pill warn">le debés {plataCorta(p.deboCent)}</span>
                  : <span className="pill ok">al día</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (paso === 2) {
    return (
      <div className="view">
        <div className="steps"><i className="on" /><i className="on" /><i /></div>
        <div className="step-title">
          <span className="n">2</span>
          <h2>{corrigiendo ? '¿Qué entró de verdad?' : '¿Qué te trajo?'}</h2>
        </div>

        {/*
          * Corrigiendo, el cartel de arriba explica qué va a pasar con el
          * ingreso viejo. Que no se entere después es la peor versión de esto:
          * vería dos entradas en la lista del día y pensaría que se duplicó.
          */}
        {corrigiendo ? (
          <Alerta tipo="warn" icono="i-alert"
            titulo={`Estás corrigiendo el ingreso del ${corrigiendo.cuando}`}
            texto="Dejá las cantidades y los costos como fueron de verdad. Al confirmar, el ingreso anterior queda anulado y este lo reemplaza."
            accion={{ texto: 'Cancelar', alTocar: () => acc.ir('hoy') }} />
        ) : (
          <Alerta tipo="ok" icono="i-store"
            titulo={prov.lista.find((p) => p.id === proveedorId)?.nombre ?? ''}
            texto="Te muestro solo lo que le comprás a él."
            accion={{ texto: 'Cambiar', alTocar: () => setPaso(1) }} />
        )}

        <p className="eyebrow">Cuántas unidades entraron y a qué precio</p>
        {(delProveedor.length > 6 || q) && (
          <Buscador valor={q} alBuscar={setQ} ejemplo="Buscar por código o nombre…"
            cuantos={visibles.length} total={delProveedor.length} />
        )}
        <div className="stack">
          {/*
            * La lista filtra por proveedor, así que puede estar vacía aunque
            * haya productos cargados: si el producto se dio de alta sin decir de
            * quién es, no aparece acá. Eso confunde mucho más que no tener
            * ninguno, así que se explica el motivo real.
            */}
          {delProveedor.length === 0 && (
            <Alerta tipo="warn" icono="i-box"
              titulo={cuantosActivos(estado.productos) === 0
                ? 'Todavía no cargaste productos'
                : 'Ningún producto figura como de este proveedor'}
              texto={cuantosActivos(estado.productos) === 0
                ? 'Cargá primero lo que vendés y después volvé a anotar la entrada.'
                : 'En la ficha de cada producto se elige de qué proveedor es. Los que no lo tengan puesto no aparecen en esta lista.'}
              accion={{ texto: 'Ver productos', alTocar: () => acc.ir('productos') }} />
          )}
          {visibles.map((p) => {
            const it = items[p.id] ?? { cantidad: 0, costo: (p.costoCent ?? 0) / 100 };
            const subio = pesos(it.costo) > (p.costoCent ?? 0);
            return (
              <div className="card" key={p.id}>
                <div className="row" style={{ border: 0, padding: 0, background: 'none' }}>
                  <span className={`thumb ${claseCategoria(p.categoria)}`}><Icono id="i-box" /></span>
                  <span className="row-main">
                    <b><Codigo valor={p.codigo} />{p.nombre}</b>
                    <span>{subio
                      ? <span className="up"><Icono id="i-up" clase="ico-s" />
                          {plata(p.costoCent ?? 0)} → {plata(pesos(it.costo))}</span>
                      : `te costaba ${plata(p.costoCent ?? 0)}`}</span>
                  </span>
                  <Cantidad valor={it.cantidad} etiqueta={`Cantidad de ${p.nombre}`}
                    alCambiar={(n) => setItems({ ...items, [p.id]: { ...it, cantidad: Math.max(0, n) } })} />
                </div>
                {it.cantidad > 0 && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11 }}>
                    <span style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>Te costó c/u</span>
                    <input type="number" inputMode="numeric" className="amount-in num"
                      style={{ fontSize: 18, padding: 9, flex: 1, textAlign: 'right' }}
                      value={it.costo}
                      onChange={(ev: ChangeEvent<HTMLInputElement>) => setItems({
                        ...items, [p.id]: { ...it, costo: Number(ev.target.value) || 0 },
                      })} />
                  </label>
                )}
              </div>
            );
          })}
        </div>

        <div className="cartbar">
          <span className="tot">
            <span>{unidades} unidades · te salió</span>
            <b className="num">{plata(total)}</b>
          </span>
          <button className="btn" style={{ marginLeft: 'auto' }}
            disabled={unidades === 0} onClick={() => setPaso(3)}>
            Seguir <Icono id="i-arrow" clase="ico-s" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="steps"><i className="on" /><i className="on" /><i className="on" /></div>
      <div className="step-title"><span className="n">3</span><h2>¿Cómo se lo pagás?</h2></div>

      <div className="card">
        <div className="eyebrow">Te trajo</div>
        <div className="stack" style={{ marginTop: 10 }}>
          {lineas.map(([id, v]) => (
            <div key={id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 14 }}>
              <b style={{ fontFamily: 'Archivo', minWidth: 30 }}>{v.cantidad}×</b>
              <span style={{ flex: 1 }}>
                <Codigo valor={productos.find((p) => p.id === id)?.codigo} />
                {productos.find((p) => p.id === id)?.nombre}
              </span>
              <span className="num" style={{ fontWeight: 600 }}>{plata(pesos(v.costo) * v.cantidad)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 13, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <span style={{ fontWeight: 600 }}>Total</span>
          <b className="num" style={{ marginLeft: 'auto', fontFamily: 'Archivo', fontSize: 25, fontWeight: 700 }}>{plata(total)}</b>
        </div>
      </div>

      <div className="stack">
        <button className="pay-opt" aria-pressed={condicion === 'contado'} onClick={() => setCondicion('contado')}>
          <span className="thumb"><Icono id="i-cash" /></span>
          <span style={{ flex: 1 }}><b>Se lo pagué ahora</b><span>Queda saldado con él</span></span>
        </button>
        <button className="pay-opt debt" aria-pressed={condicion === 'cuenta'} onClick={() => setCondicion('cuenta')}>
          <span className="thumb c-higiene"><Icono id="i-clock" /></span>
          <span style={{ flex: 1 }}><b>Se lo pago después</b><span>Se suma a lo que vos le debés a él</span></span>
        </button>
      </div>

      {corrigiendo && (
        <p className="parcial-aviso" role="status">
          Al confirmar, el ingreso del {corrigiendo.cuando} queda anulado y este lo reemplaza.
          El stock se ajusta solo por la diferencia.
        </p>
      )}
      <button className="btn lg block" disabled={!condicion}
        onClick={() => condicion && proveedorId && acc.entrar(
          proveedorId,
          lineas.map(([productoId, v]) => ({
            productoId, cantidad: v.cantidad, costoUnitarioCent: pesos(v.costo),
          })),
          condicion,
          corrigiendo?.compraId,
        )}>
        {corrigiendo ? 'Guardar la corrección' : 'Entrar la mercadería'}
      </button>
      <button className="btn outline block" onClick={() => setPaso(2)}>Volver a la lista</button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Proveedores y clientes
// ---------------------------------------------------------------------------
export const PantallaProveedores = ({ estado, acc }: Props) => {
  const [orden, setOrden] = useState<OrdenProveedor>('nombre');
  const [dir, setDir] = useState<Direccion>(DIRECCION_INICIAL_PROVEEDOR.nombre);
  const [q, setQ] = useState('');
  const v = vistaProveedores(estado);
  const lista = useMemo(
    () => ordenarProveedores(buscarProveedores(v.lista, q), orden, dir),
    [estado, q, orden, dir],
  );
  const cambiarOrden = (o: OrdenProveedor) => { setOrden(o); setDir(DIRECCION_INICIAL_PROVEEDOR[o]); };
  return (
    <div className="view">
      <Volver acc={acc} />
      <div className="hero-n" style={{ background: 'linear-gradient(165deg,#4a3524,#6b4c2f)' }}>
        <span>Vos les debés</span>
        <b>{plata(v.totalCent)}</b>
        <em>a tus proveedores</em>
      </div>
      <button className="second-action" onClick={acc.nuevoProveedor}>
        <span className="circ"><Icono id="i-plus" /></span>
        <span><b>Agregar un proveedor</b><span>Con el nombre alcanza</span></span>
        <Icono id="i-arrow" clase="ico-arrow ico-s" />
      </button>

      {(v.lista.length > 1 || q) && (
        <Barra opciones={ORDENES_PROVEEDOR} valor={orden} alCambiar={cambiarOrden}
          direccion={dir} alInvertir={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          busqueda={q} alBuscar={setQ} ejemplo="Buscar por nombre, ubicación o rubro"
          cuantos={lista.length} total={v.lista.length} />
      )}

      <div className="stack" {...tour('lista-proveedores-todos')}>
        {lista.length === 0 && (
          <Alerta tipo="ok" icono="i-store" titulo="Todavía no cargaste proveedores"
            texto="Con el nombre alcanza. Sirven para saber a quién le debés y de dónde vino cada producto."
            accion={{ texto: 'Agregar', alTocar: acc.nuevoProveedor }} />
        )}
        {lista.map((p) => (
          <button className="row" key={p.id} onClick={() => acc.verProveedor(p.id)}>
            <span className="thumb"><Icono id="i-store" /></span>
            <span className="row-main"><b>{p.nombre}</b>
              <span>{[p.zona, p.rubro, `${p.productos} productos`].filter(Boolean).join(' · ')}</span></span>
            <span className="row-end">
              {p.deboCent > 0
                ? <><b>{plata(p.deboCent)}</b><span className="pill warn">le debés</span></>
                : <span className="pill ok">al día</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const PantallaClientes = ({ estado, hoy, acc }: Props) => {
  const [orden, setOrden] = useState<OrdenCliente>('nombre');
  const [dir, setDir] = useState<Direccion>(DIRECCION_INICIAL_CLIENTE.nombre);
  const [q, setQ] = useState('');
  const deudas = vistaDeudas(estado, hoy);
  const activos = estado.clientes.filter((c) => c.activo);
  const lista = useMemo(
    () => ordenarClientes(buscarClientes(activos, q), orden, dir, deudas.lista),
    [estado, hoy, q, orden, dir],
  );
  const cambiarOrden = (o: OrdenCliente) => { setOrden(o); setDir(DIRECCION_INICIAL_CLIENTE[o]); };
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return (
    <div className="view">
      <Volver acc={acc} />
      <div className="section-h"><h2>Mis clientes</h2><span className="hint">{estado.clientes.filter((c) => c.activo).length} comercios</span></div>

      <button className="second-action" onClick={() => acc.nuevoCliente('clientes')}>
        <span className="circ"><Icono id="i-plus" /></span>
        <span><b>Agregar un comercio</b><span>Solo hace falta el nombre</span></span>
        <Icono id="i-arrow" clase="ico-arrow ico-s" />
      </button>

      {(activos.length > 1 || q) && (
        <Barra opciones={ORDENES_CLIENTE} valor={orden} alCambiar={cambiarOrden}
          direccion={dir} alInvertir={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          busqueda={q} alBuscar={setQ} ejemplo="Buscar por nombre, ubicación o rubro"
          cuantos={lista.length} total={activos.length} />
      )}

      <div className="stack" {...tour('lista-clientes-todos')}>
        {lista.length === 0 && (
          <Alerta tipo="ok" icono="i-store" titulo="Todavía no cargaste comercios"
            texto="Con el nombre alcanza. La zona y el día de visita los podés completar después, cuando tengas un rato."
            accion={{ texto: 'Agregar', alTocar: () => acc.nuevoCliente('clientes') }} />
        )}
        {lista.map((c) => {
          const d = deudas.lista.find((x) => x.clienteId === c.id);
          return (
            <button className="row" key={c.id} onClick={() => acc.verCliente(c.id)}>
              <span className="thumb"><Icono id="i-user" /></span>
              <span className="row-main">
                <b>{c.nombre}</b>
                <span>
                  {[c.zona, c.rubro, c.diaVisita !== undefined ? `lo visitás los ${DIAS[c.diaVisita]}` : null, c.contacto]
                    .filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="row-end">
                {d ? <span className={`pill ${d.antiguedad === 'muy_atrasado' ? 'bad' : 'warn'}`}>
                  debe {plataCorta(d.saldoCent)}</span>
                  : <span className="pill ok">al día</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------
export const PantallaNumeros = ({ estado, hoy }: Props) => {
  const v = useMemo(() => vistaNumeros(estado, hoy, 30), [estado, hoy]);
  const max = Math.max(...v.ultimos7.map((d) => d.ventaCent), 1);
  const maxU = Math.max(...v.masVendidos.map((t) => t.unidades), 1);

  return (
    <div className="view">
      <div className="hero-n" {...tour('ganancia')}>
        <span>Te quedó este mes</span>
        <b>{plata(v.gananciaCent)}</b>
        <em>después de descontar lo que te costó la mercadería</em>
      </div>

      {/*
        * Sin ventas los números son todos cero, que es correcto pero no dice
        * nada. Conviene aclarar que está vacío porque todavía no vendió, y no
        * porque el mes le fue mal.
        */}
      {estado.ventas.filter((v) => !v.anuladaEn).length === 0 && (
        <Alerta tipo="ok" icono="i-chart" titulo="Todavía no hay ventas para medir"
          texto="Estos números se llenan solos con cada venta que cargues. No hay nada que configurar." />
      )}

      <div className="kpi">
        <div><b>{plata(v.ventasCent)}</b><span>vendiste</span></div>
        <div><b>{plata(v.costoCent)}</b><span>te costó</span></div>
      </div>

      <div className="card">
        <div className="section-h" style={{ margin: 0 }}>
          <h2>Los últimos 7 días</h2><span className="hint">cuánto vendiste por día</span>
        </div>
        <div className="chart">
          {v.ultimos7.map((d) => {
            const destacado = d.esHoy || d.ventaCent === max;
            return (
              <div key={d.diaIso}
                className={`cbar ${d.esHoy ? 'today' : ''} ${d.ventaCent === 0 ? 'zero' : destacado ? '' : 'dim'}`}
                title={`${d.etiqueta}: ${d.ventaCent ? plata(d.ventaCent) : 'no saliste'}`}>
                {destacado && d.ventaCent > 0 && <b>{plataCorta(d.ventaCent)}</b>}
                <i style={{ height: `${Math.max(3, (d.ventaCent / max) * 100)}%` }} />
                <em>{d.etiqueta}</em>
              </div>
            );
          })}
        </div>
      </div>

      {v.masVendidos.length > 0 && (
        <div className="card">
          <div className="section-h" style={{ margin: 0 }}>
            <h2>Lo que más se te va</h2><span className="hint">unidades del mes</span>
          </div>
          <div className="rank" style={{ marginTop: 14 }}>
            {v.masVendidos.map((t) => (
              <div className="rank-item" key={t.productoId}>
                <b>{t.nombre}</b><em>{t.unidades} u.</em>
                <span className="rank-track"><i style={{ width: `${(t.unidades / maxU) * 100}%` }} /></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {v.masRentable && (
        <div className="card">
          <div className="eyebrow">El que más te deja</div>
          <div className="row" style={{ border: 0, padding: '11px 0 0', background: 'none' }}>
            <span className="thumb"><Icono id="i-box" /></span>
            <span className="row-main">
              <b>{v.masRentable.nombre}</b>
              <span>te queda {plata(v.masRentable.gananciaCent)} limpio por unidad</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
