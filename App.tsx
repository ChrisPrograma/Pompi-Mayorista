import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { uuidv7 } from '../lib/uuid.ts';
import { pesos, type Cent } from '../domain/money.ts';
import type { Uuid } from '../domain/types.ts';
import {
  aplicar, aplicarSugerencias, cargarAuto, cobrar, descartarSugerencias,
  entrarMercaderia, vender, type Ctx, type EstadoApp, type Resultado,
} from '../app/estado.ts';
import { construirSemilla } from '../app/semilla.ts';
import { cargarEstado, guardarEstado, almacenCola } from '../data/local.ts';
import { Cola, type Operacion } from '../data/outbox.ts';
import { hayBackend, transporte } from '../data/servidor.ts';
import { sugerenciasPendientes, vistaDeudas, type ProductoVista } from './vistas.ts';
import { Exito, Hoja, Icono, plata, type DatosExito } from './componentes.tsx';
import {
  PantallaAuto, PantallaClientes, PantallaCosas, PantallaDeudas, PantallaHoy,
  PantallaIngreso, PantallaNumeros, PantallaProductos, PantallaProveedores,
  PantallaVender, type Acciones, type Ruta,
} from './pantallas.tsx';

const TABS: { id: Ruta; icono: string; texto: string; venta?: boolean }[] = [
  { id: 'hoy', icono: 'i-home', texto: 'Hoy' },
  { id: 'deudas', icono: 'i-wallet', texto: 'Me deben' },
  { id: 'vender', icono: 'i-cart', texto: 'Vender', venta: true },
  { id: 'cosas', icono: 'i-box', texto: 'Mis cosas' },
  { id: 'numeros', icono: 'i-chart', texto: 'Números' },
];

const PADRE: Partial<Record<Ruta, Ruta>> = {
  productos: 'cosas', auto: 'cosas', clientes: 'cosas',
  ingreso: 'cosas', proveedores: 'cosas',
};

const cola = new Cola(almacenCola, transporte);

export const App = () => {
  const [estado, setEstado] = useState<EstadoApp | null>(null);
  const [ruta, setRuta] = useState<Ruta>('hoy');
  const [exito, setExito] = useState<DatosExito | null>(null);
  const [hojaCobro, setHojaCobro] = useState<Uuid | null>(null);
  const [hojaProducto, setHojaProducto] = useState<ProductoVista | null>(null);
  const [hojaPrecios, setHojaPrecios] = useState(false);
  const [sinSubir, setSinSubir] = useState(0);
  const hoy = useMemo(() => new Date().toISOString(), [estado]);
  const montoCobro = useRef<HTMLInputElement>(null);

  // ---- carga inicial -------------------------------------------------------
  useEffect(() => {
    let vivo = true;
    (async () => {
      let e = await cargarEstado().catch(() => null);
      if (!e) {
        // Primera vez: se siembra con datos de ejemplo para que nunca abra vacía.
        // En producción, acá va la descarga inicial desde el servidor.
        e = construirSemilla(new Date().toISOString());
        await guardarEstado(e).catch(() => {});
      }
      if (vivo) setEstado(e);
    })();
    return () => { vivo = false; };
  }, []);

  // ---- sincronización ------------------------------------------------------
  const sincronizar = useCallback(async () => {
    if (!hayBackend()) return;
    await cola.sincronizar().catch(() => {});
    setSinSubir(await cola.sinSubir().catch(() => 0));
  }, []);

  useEffect(() => {
    void sincronizar();
    const alVolver = () => void sincronizar();
    window.addEventListener('online', alVolver);
    const t = setInterval(alVolver, 60_000);
    return () => { window.removeEventListener('online', alVolver); clearInterval(t); };
  }, [sincronizar]);

  // ---- despacho ------------------------------------------------------------
  const ctx = (): Ctx => ({ nuevoId: () => uuidv7(), ahora: () => new Date().toISOString() });

  const despachar = useCallback(async (r: Resultado, ops: Operacion[]) => {
    setEstado((actual) => {
      if (!actual) return actual;
      const nuevo = aplicar(actual, r);
      void guardarEstado(nuevo).catch(() => {});
      return nuevo;
    });
    for (const op of ops) await cola.encolar(op).catch(() => {});
    setSinSubir(await cola.sinSubir().catch(() => 0));
    void sincronizar();
  }, [sincronizar]);

  if (!estado) return <div className="app"><div className="cargando">Abriendo…</div></div>;

  const deudas = vistaDeudas(estado, hoy);
  const pendientes = sugerenciasPendientes(estado);

  // ---- acciones ------------------------------------------------------------
  const acc: Acciones = {
    ir: (r) => setRuta(r),

    vender: (clienteId, items, forma) => {
      const c = ctx();
      const r = vender(estado, { clienteId, items, formaPago: forma }, c);
      const v = r.ventas![0];
      const cliente = estado.clientes.find((x) => x.id === clienteId);
      const aCuenta = forma === 'cuenta';

      void despachar(r, [{
        tipo: 'registrar_venta', id: v.id,
        payload: {
          p_negocio_id: estado.negocioId, p_cliente_id: clienteId,
          p_items: items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad })),
          p_forma_pago: forma, p_fecha: v.fecha, p_lista_id: estado.listaId,
        },
      }]);

      const saldo = deudas.lista.find((d) => d.clienteId === clienteId)?.saldoCent ?? 0;
      setExito({
        titulo: '¡Venta cerrada!',
        monto: plata(v.totalCent),
        texto: aCuenta
          ? `Quedó anotado que ${cliente?.nombre} te lo debe. No hace falta que te acuerdes.`
          : `${cliente?.nombre} te pagó en el momento.`,
        deltas: aCuenta
          ? [{ etiqueta: 'Ahora te debe', valor: plata(saldo + v.totalCent) },
             { etiqueta: 'Productos', valor: `${items.reduce((a, i) => a + i.cantidad, 0)} u.` }]
          : [{ etiqueta: 'Cobraste', valor: plata(v.totalCent) },
             { etiqueta: 'Productos', valor: `${items.reduce((a, i) => a + i.cantidad, 0)} u.` }],
      });
      setRuta('hoy');
    },

    cobrar: (clienteId) => setHojaCobro(clienteId),

    cargar: (movs) => {
      const utiles = movs.filter((m) => m.cantidad !== 0);
      if (!utiles.length) return;
      const c = ctx();
      const r = cargarAuto(estado, utiles, c);
      void despachar(r, utiles.map((m) => ({
        tipo: 'trasladar_stock' as const, id: uuidv7(),
        payload: {
          p_negocio_id: estado.negocioId, p_producto_id: m.productoId, p_cantidad: m.cantidad,
        },
      })));
      const total = utiles.reduce((a, m) => a + Math.max(0, m.cantidad), 0);
      if (total > 0) {
        setExito({
          titulo: 'Auto cargado', monto: `${total} u.`,
          texto: 'Subiste lo que te faltaba para cubrir la ruta. Salís tranquilo.',
          deltas: [{ etiqueta: 'Productos movidos', valor: String(utiles.length) }],
        });
      }
    },

    entrar: (proveedorId, items, condicion) => {
      const c = ctx();
      const r = entrarMercaderia(estado, { proveedorId, items, condicionPago: condicion }, c);
      const compra = r.compras![0];
      const suben = r.sugerencias?.length ?? 0;

      void despachar(r, [{
        tipo: 'registrar_compra', id: compra.id,
        payload: {
          p_negocio_id: estado.negocioId, p_proveedor_id: proveedorId,
          p_items: items.map((i) => ({
            producto_id: i.productoId, cantidad: i.cantidad,
            costo_unitario_cent: i.costoUnitarioCent,
          })),
          p_condicion_pago: condicion, p_fecha: compra.fecha,
        },
      }]);

      setExito({
        titulo: 'Mercadería entrada',
        monto: `${items.reduce((a, i) => a + i.cantidad, 0)} u.`,
        texto: `Te salió ${plata(compra.totalCent)}. ${condicion === 'cuenta' ? 'Quedó anotado que se lo debés.' : 'Quedaste al día con él.'}`,
        deltas: [{ etiqueta: 'Te salió', valor: plata(compra.totalCent) }],
        extra: suben > 0 ? (
          <div className="warn-box">
            <Icono id="i-tag" />
            <div>
              <b>{suben} {suben === 1 ? 'producto te llegó' : 'productos te llegaron'} más caro{suben === 1 ? '' : 's'}</b>
              <span>Si no tocás tus precios, ganás menos sin darte cuenta.</span>
            </div>
            <button className="btn" onClick={() => { setExito(null); setHojaPrecios(true); }}>
              Revisar mis precios
            </button>
          </div>
        ) : undefined,
      });
      setRuta('cosas');
    },

    verProducto: (p) => setHojaProducto(p),
  };

  const confirmarCobro = (clienteId: Uuid, montoCent: Cent) => {
    const r = cobrar(estado, { clienteId, montoCent, medio: 'efectivo' }, ctx());
    const pago = r.pagos![0];
    const cliente = estado.clientes.find((x) => x.id === clienteId);
    const saldo = deudas.lista.find((d) => d.clienteId === clienteId)?.saldoCent ?? 0;

    void despachar(r, [{
      tipo: 'registrar_pago_cliente', id: pago.id,
      payload: {
        negocio_id: estado.negocioId, cliente_id: clienteId,
        monto_cent: montoCent, fecha: pago.fecha, medio: 'efectivo',
      },
    }]);

    setHojaCobro(null);
    setExito({
      titulo: '¡Cobrado!', monto: plata(montoCent),
      texto: saldo - montoCent > 0
        ? `${cliente?.nombre} todavía te debe ${plata(saldo - montoCent)}.`
        : `${cliente?.nombre} quedó al día con vos.`,
      deltas: [{ etiqueta: 'Te siguen debiendo', valor: plata(Math.max(0, deudas.totalCent - montoCent)) }],
    });
  };

  const resolverPrecios = (aplicarlas: boolean) => {
    const ids = pendientes.map((s) => s.id);
    const c = ctx();
    const r = aplicarlas ? aplicarSugerencias(estado, ids, c) : descartarSugerencias(estado, ids, c);

    void despachar(r, aplicarlas
      ? (r.precios ?? []).map((p, i) => ({
          tipo: 'aplicar_sugerencia' as const, id: ids[i],
          payload: { p_precio_id: p.id, p_precio_cent: p.precioCent },
        }))
      : []);

    setHojaPrecios(false);
    if (aplicarlas) {
      setExito({
        titulo: 'Precios actualizados',
        monto: `${ids.length} ${ids.length === 1 ? 'precio' : 'precios'}`,
        texto: 'Seguís ganando lo mismo que antes en cada uno de esos productos.',
        deltas: [{ etiqueta: 'Tu lista', valor: 'al día' }],
      });
    }
  };

  const rutaActiva = PADRE[ruta] ?? ruta;
  const Pantalla = {
    hoy: PantallaHoy, vender: PantallaVender, deudas: PantallaDeudas, cosas: PantallaCosas,
    productos: PantallaProductos, auto: PantallaAuto, clientes: PantallaClientes,
    ingreso: PantallaIngreso, proveedores: PantallaProveedores, numeros: PantallaNumeros,
  }[ruta];

  const clienteCobro = hojaCobro ? deudas.lista.find((d) => d.clienteId === hojaCobro) : null;

  return (
    <div className="app">
      <header className="hud">
        <div className="hud-top">
          <div className="brand">
            <div className="brand-mark"><Icono id="i-paw" /></div>
            <div>
              <div className="brand-name">Pompi Mayorista</div>
              <div className="brand-sub">
                {new Date(hoy).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </div>
          </div>
          {pendientes.length > 0 && (
            <button className="hud-btn" aria-label="Precios para revisar" onClick={() => setHojaPrecios(true)}>
              <Icono id="i-tag" />
            </button>
          )}
        </div>
        <div className="hud-money">
          <div className="mtile hot">
            <span>Cobré hoy</span>
            <b className="num">{plata(
              estado.ventas.filter((v) => v.fecha.slice(0, 10) === hoy.slice(0, 10))
                .reduce((a, v) => a + v.cobradoCent, 0) +
              estado.pagos.filter((p) => p.fecha.slice(0, 10) === hoy.slice(0, 10))
                .reduce((a, p) => a + p.montoCent, 0),
            )}</b>
          </div>
          <div className="mtile"><span>Me deben</span><b className="num">{plata(deudas.totalCent)}</b></div>
        </div>
      </header>

      <main>
        <Pantalla estado={estado} hoy={hoy} acc={acc} />
        {sinSubir > 0 && (
          <p className="sincro pend">
            <Icono id="i-cloud" /> {sinSubir} {sinSubir === 1 ? 'operación' : 'operaciones'} sin subir · se suben solas cuando haya señal
          </p>
        )}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${t.venta ? 'sell' : ''}`}
            aria-current={rutaActiva === t.id} onClick={() => setRuta(t.id)}>
            <Icono id={t.icono} /><span>{t.texto}</span>
          </button>
        ))}
      </nav>

      {clienteCobro && (
        <Hoja alCerrar={() => setHojaCobro(null)}>
          <h3>Cobrarle a {clienteCobro.nombre}</h3>
          <p className="sub">Te debe {plata(clienteCobro.saldoCent)} desde hace {clienteCobro.dias} días.</p>
          <input ref={montoCobro} className="amount-in num" inputMode="numeric" type="number"
            defaultValue={clienteCobro.saldoCent / 100} aria-label="Monto que te paga" />
          <div className="chips" style={{ margin: '12px 0 18px' }}>
            {[
              ['Me paga todo', clienteCobro.saldoCent],
              ['La mitad', Math.round(clienteCobro.saldoCent / 2)],
            ].map(([texto, valor]) => (
              <button key={texto as string} className="chip"
                onClick={() => { if (montoCobro.current) montoCobro.current.value = String((valor as number) / 100); }}>
                {texto}
              </button>
            ))}
          </div>
          <button className="btn lg block" onClick={() => {
            const v = Number(montoCobro.current?.value ?? 0);
            if (v > 0) confirmarCobro(clienteCobro.clienteId, Math.min(pesos(v), clienteCobro.saldoCent));
          }}>Listo, cobré</button>
          <button className="btn outline block" style={{ marginTop: 9 }}
            onClick={() => setHojaCobro(null)}>Ahora no</button>
        </Hoja>
      )}

      {hojaProducto && (
        <Hoja alCerrar={() => setHojaProducto(null)}>
          <h3>{hojaProducto.nombre}</h3>
          <p className="sub">{hojaProducto.variante}</p>
          <div className="kpi">
            <div><b>{hojaProducto.costoCent !== null ? plata(hojaProducto.costoCent) : '—'}</b><span>te cuesta</span></div>
            <div><b>{hojaProducto.precioCent !== null ? plata(hojaProducto.precioCent) : '—'}</b><span>lo vendés</span></div>
          </div>
          {hojaProducto.gananciaCent !== null && (
            <div className="card" style={{ marginTop: 12, background: 'var(--ok-soft)', borderColor: 'color-mix(in srgb,var(--ok) 30%,transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 14 }}>Te queda limpio</span>
                <b className="num" style={{ marginLeft: 'auto', fontFamily: 'Archivo', fontSize: 24, fontWeight: 700, color: 'var(--ok)' }}>
                  {plata(hojaProducto.gananciaCent)}
                </b>
              </div>
              <span style={{ fontSize: 12.8, color: 'var(--ink-2)' }}>por cada unidad que vendés</span>
            </div>
          )}
          <div className="kpi" style={{ marginTop: 12 }}>
            <div><b>{hojaProducto.enDeposito}</b><span>en tu casa</span></div>
            <div><b>{hojaProducto.enVehiculo}</b><span>en el auto</span></div>
          </div>
          {hojaProducto.historial.length > 1 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="eyebrow">A cuánto lo vendiste antes</div>
              <div className="hist">
                {hojaProducto.historial.filter((h) => h.hasta !== null).map((h) => (
                  <div key={h.desde}>
                    <span>hasta {new Date(h.hasta as string).toLocaleDateString('es-AR', { month: 'long' })}</span>
                    <b className="num">{plata(h.precioCent)}</b>
                  </div>
                ))}
                <div className="now">
                  <span>ahora</span>
                  <b className="num">{plata(hojaProducto.precioCent ?? 0)}</b>
                </div>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12.4, color: 'var(--ink-3)' }}>
                Los precios viejos no se borran nunca: quedan guardados con la fecha.
              </p>
            </div>
          )}
          <button className="btn ghost block" style={{ marginTop: 14 }}
            onClick={() => setHojaProducto(null)}>Cerrar</button>
        </Hoja>
      )}

      {hojaPrecios && pendientes.length > 0 && (
        <Hoja alCerrar={() => setHojaPrecios(false)}>
          <h3>Te llegaron más caros</h3>
          <p className="sub">Te propongo el precio nuevo para que sigas ganando lo mismo que antes. Vos decidís.</p>
          <div className="stack">
            {pendientes.map((s) => (
              <div className="row" key={s.id}>
                <span className="thumb"><Icono id="i-tag" /></span>
                <span className="row-main">
                  <b>{s.nombre}</b>
                  <span>te costaba {plata(s.costoAnteriorCent)} · ahora {plata(s.costoNuevoCent)}</span>
                </span>
                <span className="row-end">
                  <span style={{ fontSize: 12, color: 'var(--ink-3)', textDecoration: 'line-through' }}>
                    {plata(s.precioVigenteCent)}
                  </span>
                  <b style={{ color: 'var(--ok)' }}>{plata(s.precioSugeridoCent)}</b>
                </span>
              </div>
            ))}
          </div>
          <button className="btn lg block" style={{ marginTop: 14 }}
            onClick={() => resolverPrecios(true)}>Sí, actualizá mis precios</button>
          <button className="btn outline block" style={{ marginTop: 9 }}
            onClick={() => resolverPrecios(false)}>Los dejo como están</button>
        </Hoja>
      )}

      {exito && <Exito datos={exito} alCerrar={() => setExito(null)} />}
    </div>
  );
};
