import { useMemo, useState, type ChangeEvent } from 'react';
import { pesos, type Cent } from '../domain/money.ts';
import type { Uuid } from '../domain/types.ts';
import type { EstadoApp } from '../app/estado.ts';
import {
  sugerenciasPendientes,
  vistaAuto,
  vistaDeudas,
  vistaHoy,
  vistaNumeros,
  vistaParaVender,
  vistaProductos,
  vistaProveedores,
  type ProductoVista,
} from './vistas.ts';
import { Alerta, Cantidad, Icono, claseCategoria, plata, plataCorta } from './componentes.tsx';

export type Ruta =
  | 'hoy' | 'vender' | 'deudas' | 'cosas'
  | 'productos' | 'auto' | 'clientes' | 'ingreso' | 'proveedores' | 'numeros';

export interface Acciones {
  ir: (r: Ruta) => void;
  vender: (clienteId: Uuid, items: { productoId: Uuid; cantidad: number }[], forma: 'efectivo' | 'transferencia' | 'cuenta') => void;
  cobrar: (clienteId: Uuid) => void;
  cargar: (movs: { productoId: Uuid; cantidad: number }[]) => void;
  entrar: (proveedorId: Uuid, items: { productoId: Uuid; cantidad: number; costoUnitarioCent: Cent }[], condicion: 'contado' | 'cuenta') => void;
  verProducto: (p: ProductoVista) => void;
  nuevoCliente: (origen: 'vender' | 'clientes') => void;
  verCliente: (id: Uuid) => void;
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
export const PantallaHoy = ({ estado, hoy, acc }: Props) => {
  const v = useMemo(() => vistaHoy(estado, hoy), [estado, hoy]);
  const pend = sugerenciasPendientes(estado);
  const hechas = Number(v.misiones.venta) + Number(v.misiones.cobro) + Number(v.misiones.carga);

  return (
    <div className="view">
      {acc.recorridoDisponible && (
        <button className="btn-recorrido" onClick={acc.iniciarRecorrido}>
          <Icono id="i-star" clase="ico-s" /> Ver cómo funciona, paso a paso
        </button>
      )}

      <button className="big-action" data-tour="vender-ya" onClick={() => acc.ir('vender')}>
        <span className="circ"><Icono id="i-cart" clase="ico-xl" /></span>
        <span><b>Vender ahora</b><span>Cargás el pedido y cobrás</span></span>
        <Icono id="i-arrow" clase="ico-arrow" />
      </button>

      <button className="second-action" onClick={() => acc.ir('ingreso')}>
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
        <div data-tour="alerta">
        <Alerta tipo="bad" icono="i-alert"
          titulo={`${v.alertaDeuda.nombre} te debe hace ${v.alertaDeuda.dias} días`}
          texto={`Son ${plata(v.alertaDeuda.saldoCent)}. Es la deuda más vieja que tenés.`}
          accion={{ texto: 'Ver', alTocar: () => acc.ir('deudas') }} />
        </div>
      )}

      {v.faltanEnAuto > 0 ? (
        <Alerta tipo="warn" icono="i-truck"
          titulo={`Te faltan ${v.faltanEnAuto} unidades en el auto`}
          texto="Para cubrir la ruta sin quedarte corto."
          accion={{ texto: 'Cargar', alTocar: () => acc.ir('auto') }} />
      ) : (
        <Alerta tipo="ok" icono="i-check" titulo="El auto está cargado"
          texto="Tenés todo lo que necesitás para la ruta." />
      )}

      <div className="misiones" data-tour="misiones">
        <div className="mis-head">
          <Icono id="i-star" />
          <h3>Tu día en 3 pasos</h3>
          <span className="mis-count">{hechas} de 3</span>
        </div>
        <div className="progress"><i style={{ width: `${(hechas / 3) * 100}%` }} /></div>
        <ul className="mis-list">
          {([
            ['venta', 'Hacer una venta', 'vender'],
            ['cobro', 'Cobrar una deuda', 'deudas'],
            ['carga', 'Dejar el auto cargado', 'auto'],
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
          <div className="stack">
            {v.ventasDeHoy.map((x) => (
              <div className="row" key={x.id}>
                <span className="thumb">
                  <span style={{ fontFamily: 'Archivo', fontWeight: 700, fontSize: 12 }}>{x.hora}</span>
                </span>
                <span className="row-main"><b>{x.cliente}</b><span>{x.items} productos</span></span>
                <span className="row-end">
                  <b>{plata(x.totalCent)}</b>
                  <span>{x.cobrado ? 'cobrado' : 'quedó debiendo'}</span>
                </span>
              </div>
            ))}
          </div>
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
  const [forma, setForma] = useState<'efectivo' | 'transferencia' | 'cuenta' | null>(null);

  const productos = useMemo(() => vistaParaVender(estado), [estado]);
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
        <div className="stack" data-tour="lista-clientes">
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

          <button className="row" data-tour="cliente-nuevo" onClick={() => acc.nuevoCliente('vender')}>
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

        <p className="eyebrow">Lo que tenés en el auto</p>
        <div className="stack" data-tour="lista-productos">
          {productos.map((p) => (
            <div className="row" key={p.id}>
              <span className={`thumb ${claseCategoria(p.categoria)}`}><Icono id="i-box" /></span>
              <span className="row-main">
                <b>{p.nombre}</b>
                <span>{plata(p.precioCent!)} c/u · quedan {p.enVehiculo}</span>
              </span>
              <Cantidad valor={items[p.id] ?? 0} maximo={p.enVehiculo}
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
          ['efectivo', 'i-cash', 'Me paga en efectivo', 'Entra a la caja del día', false],
          ['transferencia', 'i-phone', 'Me transfiere', 'Igual queda registrado como cobrado', false],
          ['cuenta', 'i-clock', 'Me lo debe', 'Se suma a lo que ya te debe y no te lo olvidás', true],
        ] as const).map(([valor, icono, titulo, sub, esDeuda]) => (
          <button key={valor} className={`pay-opt ${esDeuda ? 'debt' : ''}`}
            aria-pressed={forma === valor} onClick={() => setForma(valor)}>
            <span className={`thumb ${esDeuda ? 'c-higiene' : ''}`}><Icono id={icono} /></span>
            <span style={{ flex: 1 }}><b>{titulo}</b><span>{sub}</span></span>
          </button>
        ))}
      </div>

      <button className="btn accent lg block" disabled={!forma}
        onClick={() => forma && clienteId && acc.vender(
          clienteId,
          lineas.map(([productoId, cantidad]) => ({ productoId, cantidad })),
          forma,
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
      <div className="stack" data-tour="lista-deudas">
        {v.lista.length === 0 && (
          <Alerta tipo="ok" icono="i-check" titulo="No te debe nadie"
            texto="Cobraste todo. Rarísimo y hermoso." />
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
  const auto = vistaAuto(estado);
  const pend = sugerenciasPendientes(estado);
  const enAuto = vistaProductos(estado).reduce((a, p) => a + p.enVehiculo, 0);

  return (
    <div className="view">
      {pend.length > 0 && (
        <Alerta tipo="warn" icono="i-tag"
          titulo={`${pend.length} ${pend.length === 1 ? 'precio para revisar' : 'precios para revisar'}`}
          texto="Te llegaron más caros y todavía no tocaste el precio de venta."
          accion={{ texto: 'Ver', alTocar: () => acc.ir('productos') }} />
      )}

      <div className="section-h"><h2>Mis cosas</h2><span className="hint">todo lo tuyo, ordenado</span></div>
      <div className="hub">
        <button onClick={() => acc.ir('ingreso')}>
          <span className="thumb"><Icono id="i-inbox" /></span>
          <b>Me llegó mercadería</b><span>Entrás lo que te trajo el proveedor</span>
        </button>
        <button onClick={() => acc.ir('auto')}>
          <span className="thumb c-juguete"><Icono id="i-truck" /></span>
          <b>Lo que llevo en el auto</b><span>{enAuto} unidades cargadas</span>
        </button>
        <button onClick={() => acc.ir('productos')}>
          <span className="thumb"><Icono id="i-box" /></span>
          <b>Mis productos</b><span>{estado.productos.length} productos</span>
        </button>
        <button onClick={() => acc.ir('proveedores')}>
          <span className="thumb c-higiene"><Icono id="i-store" /></span>
          <b>Mis proveedores</b>
          <span>{prov.totalCent > 0 ? `les debés ${plataCorta(prov.totalCent)}` : 'estás al día'}</span>
        </button>
        <button onClick={() => acc.ir('clientes')}>
          <span className="thumb c-descanso"><Icono id="i-user" /></span>
          <b>Mis clientes</b><span>{estado.clientes.length} comercios</span>
        </button>
        <button onClick={() => acc.ir('numeros')}>
          <span className="thumb c-juguete"><Icono id="i-chart" /></span>
          <b>Cómo me fue</b><span>Ganancia del mes</span>
        </button>
      </div>

      {auto.totalACargar > 0 && (
        <Alerta tipo="warn" icono="i-truck" titulo={`Te faltan ${auto.totalACargar} unidades en el auto`}
          texto="Todavía no cargaste todo lo que la ruta necesita."
          accion={{ texto: 'Cargar', alTocar: () => acc.ir('auto') }} />
      )}

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
  const productos = useMemo(() => vistaProductos(estado), [estado]);
  return (
    <div className="view">
      <Volver acc={acc} />
      <div className="section-h"><h2>Mis productos</h2><span className="hint">tocá uno para ver la ganancia</span></div>

      <button className="second-action" data-tour="producto-nuevo" onClick={acc.nuevoProducto}>
        <span className="circ"><Icono id="i-plus" /></span>
        <span><b>Agregar un producto</b><span>Nombre y a cuánto lo vendés</span></span>
        <Icono id="i-arrow" clase="ico-arrow ico-s" />
      </button>

      <div className="stack" data-tour="lista-productos-todos">
        {productos.map((p) => (
          <button className="row" key={p.id} onClick={() => acc.verProducto(p)}>
            <span className={`thumb ${claseCategoria(p.categoria)}`}><Icono id="i-box" /></span>
            <span className="row-main">
              <b>{p.nombre}</b>
              <span>{p.variante} · {p.enDeposito + p.enVehiculo} unidades</span>
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
// Lo que llevo en el auto
// ---------------------------------------------------------------------------
export const PantallaAuto = ({ estado, acc }: Props) => {
  const v = useMemo(() => vistaAuto(estado), [estado]);
  const productos = useMemo(() => vistaProductos(estado), [estado]);

  return (
    <div className="view">
      <Volver acc={acc} />
      <div className="section-h"><h2>Lo que llevo en el auto</h2></div>

      {v.totalACargar > 0 ? (
        <div data-tour="sugerencia">
          <Alerta tipo="warn" icono="i-truck" titulo={`Te faltan ${v.totalACargar} unidades`}
            texto="Calculado con lo que solés vender en esta ruta." />
          <button className="btn accent block lg"
            onClick={() => acc.cargar(v.faltantes.map((f) => ({ productoId: f.productoId, cantidad: f.aCargar })))}>
            Cargar lo que me falta
          </button>
        </div>
      ) : (
        <div data-tour="sugerencia">
          <Alerta tipo="ok" icono="i-check" titulo="Estás listo para salir"
            texto="El auto tiene todo lo que la ruta necesita." />
        </div>
      )}

      <p className="eyebrow">Producto por producto</p>
      <div className="stack">
        {productos.map((p) => {
          const f = v.faltantes.find((x) => x.productoId === p.id);
          return (
            <div className="row" key={p.id}>
              <span className={`thumb ${claseCategoria(p.categoria)}`}><Icono id="i-box" /></span>
              <span className="row-main">
                <b>{p.nombre}</b>
                <span>en casa quedan {p.enDeposito}{f && f.aCargar > 0 ? ` · te faltan ${f.aCargar}` : ''}</span>
              </span>
              <Cantidad valor={p.enVehiculo} minimo={0}
                maximo={p.enVehiculo + p.enDeposito}
                alCambiar={(n) => acc.cargar([{ productoId: p.id, cantidad: n - p.enVehiculo }])} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Me llegó mercadería
// ---------------------------------------------------------------------------
export const PantallaIngreso = ({ estado, acc }: Props) => {
  const [paso, setPaso] = useState(1);
  const [proveedorId, setProveedorId] = useState<Uuid | null>(null);
  const [items, setItems] = useState<Record<Uuid, { cantidad: number; costo: number }>>({});
  const [condicion, setCondicion] = useState<'contado' | 'cuenta' | null>(null);

  const prov = vistaProveedores(estado);
  const productos = useMemo(() => vistaProductos(estado), [estado]);
  const delProveedor = productos.filter(
    (p) => estado.productos.find((x) => x.id === p.id)?.proveedorId === proveedorId,
  );
  const lineas = Object.entries(items).filter(([, v]) => v.cantidad > 0);
  const total = lineas.reduce((a, [, v]) => a + pesos(v.costo) * v.cantidad, 0);
  const unidades = lineas.reduce((a, [, v]) => a + v.cantidad, 0);

  if (paso === 1) {
    return (
      <div className="view">
        <div className="steps"><i className="on" /><i /><i /></div>
        <div className="step-title"><span className="n">1</span><h2>¿Quién te trajo?</h2></div>
        <div className="stack" data-tour="lista-proveedores">
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
        <div className="step-title"><span className="n">2</span><h2>¿Qué te trajo?</h2></div>
        <Alerta tipo="ok" icono="i-store"
          titulo={prov.lista.find((p) => p.id === proveedorId)?.nombre ?? ''}
          texto="Te muestro solo lo que le comprás a él."
          accion={{ texto: 'Cambiar', alTocar: () => setPaso(1) }} />

        <p className="eyebrow">Cuántas unidades entraron y a qué precio</p>
        <div className="stack">
          {delProveedor.map((p) => {
            const it = items[p.id] ?? { cantidad: 0, costo: (p.costoCent ?? 0) / 100 };
            const subio = pesos(it.costo) > (p.costoCent ?? 0);
            return (
              <div className="card" key={p.id}>
                <div className="row" style={{ border: 0, padding: 0, background: 'none' }}>
                  <span className={`thumb ${claseCategoria(p.categoria)}`}><Icono id="i-box" /></span>
                  <span className="row-main">
                    <b>{p.nombre}</b>
                    <span>{subio
                      ? <span className="up"><Icono id="i-up" clase="ico-s" />
                          {plata(p.costoCent ?? 0)} → {plata(pesos(it.costo))}</span>
                      : `te costaba ${plata(p.costoCent ?? 0)}`}</span>
                  </span>
                  <Cantidad valor={it.cantidad}
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
              <span style={{ flex: 1 }}>{productos.find((p) => p.id === id)?.nombre}</span>
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

      <button className="btn lg block" disabled={!condicion}
        onClick={() => condicion && proveedorId && acc.entrar(
          proveedorId,
          lineas.map(([productoId, v]) => ({
            productoId, cantidad: v.cantidad, costoUnitarioCent: pesos(v.costo),
          })),
          condicion,
        )}>
        Entrar la mercadería
      </button>
      <button className="btn outline block" onClick={() => setPaso(2)}>Volver a la lista</button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Proveedores y clientes
// ---------------------------------------------------------------------------
export const PantallaProveedores = ({ estado, acc }: Props) => {
  const v = vistaProveedores(estado);
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

      <div className="stack">
        {v.lista.map((p) => (
          <button className="row" key={p.id} onClick={() => acc.verProveedor(p.id)}>
            <span className="thumb"><Icono id="i-store" /></span>
            <span className="row-main"><b>{p.nombre}</b><span>{p.rubro} · {p.productos} productos</span></span>
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
  const deudas = vistaDeudas(estado, hoy);
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

      <div className="stack" data-tour="lista-clientes-todos">
        {estado.clientes.filter((c) => c.activo).map((c) => {
          const d = deudas.lista.find((x) => x.clienteId === c.id);
          return (
            <button className="row" key={c.id} onClick={() => acc.verCliente(c.id)}>
              <span className="thumb"><Icono id="i-user" /></span>
              <span className="row-main">
                <b>{c.nombre}</b>
                <span>
                  {[c.zona, c.diaVisita !== undefined ? `lo visitás los ${DIAS[c.diaVisita]}` : null, c.contacto]
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
      <div className="hero-n" data-tour="ganancia">
        <span>Te quedó este mes</span>
        <b>{plata(v.gananciaCent)}</b>
        <em>después de descontar lo que te costó la mercadería</em>
      </div>

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
