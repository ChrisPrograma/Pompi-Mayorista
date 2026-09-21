import {
  useCallback, useEffect, useMemo, useRef, useState,
  type ChangeEvent, type MouseEvent,
} from 'react';
import { uuidv7 } from '../lib/uuid.ts';
import { aCentavos, pesos, type Cent } from '../domain/money.ts';
import { fechaCorta, fechaLarga, fechaYHora, horaLocal, mismoDiaLocal } from '../domain/fechas.ts';
import { saldoCliente } from '../domain/saldos.ts';
import type { Uuid } from '../domain/types.ts';
import {
  activarCliente, activarProducto, activarProveedor, altaCliente, altaProducto, altaProveedor,
  anularCompra, anularVenta, aplicar, aplicarSugerencias, cambiarPrecio, clienteParecido, cobrar,
  corregirIngreso, descartarSugerencias, editarCliente, editarProducto, editarProveedor, entrarMercaderia,
  estadoVacio, precioDe, productoConCodigo, productoParecido, vender,
  type Ctx, type EstadoApp, type Resultado,
} from '../app/estado.ts';
import { sinDatosDeEjemplo } from '../app/limpieza.ts';
import {
  cargarEstado, guardarEstado, almacenCola, idsEnCola, vaciarDatosLocales, limpiarColaDeEjemplo,
} from '../data/local.ts';
import { descargarEstado, unir } from '../data/descarga.ts';
import { Cola, type Operacion } from '../data/outbox.ts';
import {
  autorizarUsuario, hayBackend, quitarAutorizacion, reclamarNegocio,
  traerAutorizados, transporte, type UsuarioAutorizado,
} from '../data/servidor.ts';
import { salir, sesionGuardada, type Sesion } from '../data/sesion.ts';
import { PantallaAcceso } from './ingreso.tsx';
import {
  caballitoDeBatalla, productosDelProveedor, reciboDeIngreso, reciboDeVenta, sugerenciasPendientes,
  ventasDelCliente, vistaDeudas, vistaIngresos, vistaProductos,
  type ProductoVista,
} from './vistas.ts';
import {
  Alerta, BotonCompartir, Coach, Exito, Hoja, Icono, claseCategoria, plata,
  type DatosExito,
} from './componentes.tsx';
import { RECORRIDO, tour } from './recorrido.ts';
import {
  PantallaClientes, PantallaCosas, PantallaDeudas, PantallaHoy,
  PantallaIngreso, PantallaNumeros, PantallaProductos, PantallaProveedores,
  PantallaVender, type Acciones, type CorreccionIngreso, type Ruta,
} from './pantallas.tsx';

const TABS: { id: Ruta; icono: string; texto: string; venta?: boolean }[] = [
  { id: 'hoy', icono: 'i-home', texto: 'Hoy' },
  { id: 'deudas', icono: 'i-wallet', texto: 'Me deben' },
  { id: 'vender', icono: 'i-cart', texto: 'Vender', venta: true },
  { id: 'cosas', icono: 'i-box', texto: 'Mis cosas' },
  { id: 'numeros', icono: 'i-chart', texto: 'Números' },
];

const PADRE: Partial<Record<Ruta, Ruta>> = {
  productos: 'cosas', clientes: 'cosas',
  ingreso: 'cosas', proveedores: 'cosas',
};

/** Días como los nombra él, no como los numera el sistema. */
const DIAS_VISITA: { n: number; texto: string }[] = [
  { n: 1, texto: 'Lunes' }, { n: 2, texto: 'Martes' }, { n: 3, texto: 'Miércoles' },
  { n: 4, texto: 'Jueves' }, { n: 5, texto: 'Viernes' }, { n: 6, texto: 'Sábado' },
];

const cola = new Cola(almacenCola, transporte);

/**
 * Lo que él escribe en un campo de plata, en centavos.
 *
 * Acepta "3.200", "3200", "3.200,50" y "$ 3.200": son todas formas en que
 * alguien escribe un precio cuando tiene apuro. Los puntos se tiran (separador
 * de miles) y la coma es la decimal. Si no queda un número, devuelve 0 y la
 * pantalla no deja guardar — nunca un `NaN` que termine guardado como precio.
 */
/** Cómo se llama el negocio. Va en el encabezado y arriba de cada comprobante. */
const NEGOCIO = 'Pompi Mayorista';

export const App = () => {
  const [estado, setEstado] = useState<EstadoApp | null>(null);
  /**
   * Se lee del dispositivo, sin tocar la red: si ya entró alguna vez, entra.
   * Sin backend configurado no hay sesión que pedir y la app arranca directo.
   */
  const [sesion, setSesion] = useState<Sesion | null>(() => (hayBackend() ? sesionGuardada() : null));
  /** La hoja que se abre con el botón de la esquina. */
  const [hojaCuenta, setHojaCuenta] = useState(false);
  /** La pantalla de entrar/registrarse, abierta a mano desde esa hoja. */
  const [acceso, setAcceso] = useState<'entrar' | 'registro' | null>(null);
  const [ruta, setRuta] = useState<Ruta>('hoy');
  const [exito, setExito] = useState<DatosExito | null>(null);
  /** La venta cuyo detalle está abierto, o null. */
  const [fichaVenta, setFichaVenta] = useState<Uuid | null>(null);
  /** El ingreso cuyo detalle está abierto, o null. */
  const [fichaIngreso, setFichaIngreso] = useState<Uuid | null>(null);
  /**
   * El ingreso que está esperando confirmación para anularse.
   *
   * Un estado aparte y no un `confirm()` del navegador: el nativo no deja
   * explicar qué va a pasar con el stock ni con la deuda, que es justamente lo
   * único que hay que explicar antes de una acción que no se deshace.
   */
  const [confirmarAnular, setConfirmarAnular] = useState<Uuid | null>(null);
  /** La venta que está esperando confirmación para anularse. */
  const [confirmarAnularVenta, setConfirmarAnularVenta] = useState<Uuid | null>(null);
  const [hojaCobro, setHojaCobro] = useState<Uuid | null>(null);
  /** El ingreso que se está corrigiendo, si hay alguno. Ver `corregirIngreso`. */
  const [corrigiendo, setCorrigiendo] = useState<CorreccionIngreso | null>(null);
  const [hojaProducto, setHojaProducto] = useState<ProductoVista | null>(null);
  const [hojaPrecios, setHojaPrecios] = useState(false);
  /**
   * La hoja de comercio sirve para el alta y para la edición.
   *
   * `origen` existe porque el alta se puede disparar en medio de una venta: al
   * guardar hay que volver a la venta con el comercio ya elegido, no dejarlo
   * parado en una lista preguntándose qué pasó.
   */
  const [hojaCliente, setHojaCliente] = useState<
    { modo: 'alta'; origen: 'vender' | 'clientes' } | { modo: 'editar'; id: Uuid } | null>(null);
  const [fichaCliente, setFichaCliente] = useState<Uuid | null>(null);
  const [hojaProdForm, setHojaProdForm] = useState<
    { modo: 'alta' } | { modo: 'editar'; id: Uuid } | null>(null);
  const [hojaPrecioDe, setHojaPrecioDe] = useState<Uuid | null>(null);
  const [hojaProv, setHojaProv] = useState<
    { modo: 'alta' } | { modo: 'editar'; id: Uuid } | null>(null);
  const [fichaProv, setFichaProv] = useState<Uuid | null>(null);
  const [clientePre, setClientePre] = useState<Uuid | null>(null);
  /** Paso actual del recorrido guiado, o null si no está corriendo. */
  const [paso, setPaso] = useState<number | null>(null);

  /** Campos de las hojas. Uno solo por tipo: nunca hay dos hojas abiertas. */
  const [f, setF] = useState<Record<string, string>>({});
  const [nuevoDia, setNuevoDia] = useState<number | null>(null);
  const [sinSubir, setSinSubir] = useState(0);
  /** Por qué no se pudo traer nada del servidor, cuando el dispositivo tampoco tiene. */
  const [problemaDatos, setProblemaDatos] = useState<string | null>(null);
  /** Se incrementa para volver a intentar la descarga sin recargar la página. */
  const [intento, setIntento] = useState(0);
  /**
   * El error de la última vez que se intentó guardar una hoja.
   *
   * Existe porque sin esto una validación que falla no se ve: la excepción se
   * perdía y la hoja quedaba abierta, igual que antes de tocar el botón. Desde
   * afuera se siente como que la app se colgó.
   */
  const [errorHoja, setErrorHoja] = useState<string | null>(null);
  /** La hoja de "quién puede entrar", con la lista de mails autorizados. */
  const [hojaUsuarios, setHojaUsuarios] = useState(false);
  const [autorizados, setAutorizados] = useState<UsuarioAutorizado[] | null>(null);
  const [errorUsuarios, setErrorUsuarios] = useState<string | null>(null);
  const campo = (k: string) => f[k] ?? '';
  const setCampo = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const hoy = useMemo(() => new Date().toISOString(), [estado]);
  const montoCobro = useRef<HTMLInputElement>(null);

  // ---- carga inicial -------------------------------------------------------
  //
  // El orden importa y no es el obvio.
  //
  // 1. Primero se muestra lo del dispositivo. Es instantáneo, y sin señal es lo
  //    único que hay. La app nunca se queda esperando a la red para abrir.
  // 2. Recién después, si hay cuenta, se baja lo del servidor y se une.
  //
  // Bajar en CADA apertura y no solo la primera vez es lo que hace que cambiar
  // de teléfono, entrar desde la computadora o que el navegador limpie los datos
  // del sitio no le borre nada: sus datos están en Supabase y vuelven solos.
  //
  // LA APP ARRANCA VACÍA. No hay datos de ejemplo por ningún camino. Los había,
  // para que no abriera en blanco, y el precio era demasiado alto: un comercio
  // inventado no se distingue de uno real, y como nunca subía al servidor no
  // había forma de borrarlo desde el otro lado. Quedaba para siempre adentro de
  // su lista. Vale más una pantalla vacía que le dice qué hacer primero.
  useEffect(() => {
    let vivo = true;
    (async () => {
      // Operaciones de los datos de ejemplo que quedaron trabadas en la cola.
      // Se sacan SIEMPRE, no solo cuando hay filas de ejemplo que borrar: en un
      // aparato ya limpiado las filas no están pero las operaciones sí, y sin
      // esto el cartel diría "16 operaciones sin subir" para siempre.
      await limpiarColaDeEjemplo().catch(() => 0);

      let local = await cargarEstado().catch(() => null);

      /*
       * Datos de ejemplo de una versión vieja, guardados en este navegador.
       *
       * Se limpian acá, antes que nada, y no al entrar con cuenta: si
       * esperáramos al ingreso, alguien que abre la app sin cuenta los seguiría
       * viendo. Y se limpian FILA POR FILA, no solo mirando el negocio, porque
       * pueden estar mezclados con datos reales ya bajados del servidor.
       *
       * Se borra la base antes de volver a escribir porque guardar solo agrega y
       * pisa por id: nunca saca una fila. Sin el borrado, lo de ejemplo volvería
       * a aparecer en la próxima apertura.
       */
      if (local) {
        const limpio = sinDatosDeEjemplo(local);
        if (limpio === null) {
          await vaciarDatosLocales().catch(() => {});
          local = null;
        } else if (limpio !== local) {
          await vaciarDatosLocales().catch(() => {});
          await guardarEstado(limpio).catch(() => {});
          local = limpio;
        }
      }

      if (local && vivo) setEstado(local);

      if (hayBackend() && sesionGuardada()) {
        const r = await descargarEstado();
        if (!vivo) return;
        if (r.ok) {
          // La cola se lee DESPUÉS de bajar, para que lo que él cargó mientras
          // tanto también quede protegido de ser pisado.
          const enCola = await idsEnCola();
          if (!vivo) return;
          setEstado((actual) => {
            const unido = unir(actual, r.estado, enCola);
            void guardarEstado(unido).catch(() => {});
            return unido;
          });
          setProblemaDatos(null);
          return;
        }
        // Con datos en el dispositivo se sigue trabajando igual y se reintenta
        // en la próxima apertura. Sin datos no hay nada que mostrar, y decirlo es
        // mejor que abrir una app vacía que parece decir "no tenés nada cargado".
        if (!local) setProblemaDatos(r.detalle);
        return;
      }

      // Sin servidor configurado la app igual tiene que abrir y funcionar: es el
      // modo "todo en este teléfono". Arranca sin nada y con los ids del negocio
      // generados acá; si más adelante entra con cuenta, los del servidor mandan.
      //
      // Con servidor y sin sesión no se crea nada: lo que se ve es la pantalla de
      // ingreso, y los datos bajan cuando entre.
      if (!local && !hayBackend()) {
        const vacio = estadoVacio(uuidv7(), uuidv7());
        await guardarEstado(vacio).catch(() => {});
        if (vivo) setEstado(vacio);
      }
    })();
    return () => { vivo = false; };
  }, [sesion, intento]);

  // ---- quién puede entrar --------------------------------------------------
  //
  // La lista se pide cada vez que se abre la hoja y no una sola vez al arrancar:
  // cambia poco y no vale la pena tenerla al día todo el tiempo, pero cuando él
  // la mira tiene que ver lo que hay de verdad, no una copia de hace dos horas.
  const cargarAutorizados = useCallback(async () => {
    setErrorUsuarios(null);
    try {
      setAutorizados(await traerAutorizados());
    } catch {
      setAutorizados([]);
      setErrorUsuarios('No pudimos traer la lista. Fijate que tengas señal.');
    }
  }, []);

  const agregarAutorizado = async (email: string, rol: 'dueno' | 'vendedor') => {
    setErrorUsuarios(null);
    try {
      await autorizarUsuario(email, rol);
      setCampo('mailNuevo', ''); setCampo('rolNuevo', '');
      await cargarAutorizados();
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setErrorUsuarios(m.includes('Solo el dueno')
        ? 'Solo el dueño de la app puede autorizar usuarios.'
        : 'No se pudo agregar. Fijate que el mail esté bien escrito y que tengas señal.');
    }
  };

  const sacarAutorizado = async (email: string) => {
    setErrorUsuarios(null);
    try {
      await quitarAutorizacion(email);
      await cargarAutorizados();
    } catch {
      setErrorUsuarios('No se pudo quitar. Probá de nuevo con señal.');
    }
  };

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

  // Resalta el elemento del paso actual, una vez que la pantalla ya se dibujó.
  // Si ese elemento no existe en esta pantalla, el paso se muestra igual: el
  // recorrido no se traba nunca por un `data-tour` que no aparece.
  useEffect(() => {
    if (paso === null) return;
    const marca = RECORRIDO[paso]?.destaca;
    if (!marca) return;
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-tour="${marca}"]`);
      if (!el) return;
      el.classList.add('tour-target');
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 90);   // deja que React pinte la pantalla nueva antes de buscarlo
    return () => clearTimeout(t);
  }, [paso, ruta]);

  // ---- despacho ------------------------------------------------------------
  const ctx = (): Ctx => ({ nuevoId: () => uuidv7(), ahora: () => new Date().toISOString() });

  /**
   * Corre el guardado de una hoja y, si algo falla, lo MUESTRA.
   *
   * Todas las validaciones del dominio avisan tirando una excepción. Sin esto,
   * esa excepción moría en el manejador del click: la hoja quedaba abierta, sin
   * cartel y sin nada guardado. Es exactamente lo que pasaba al cargar un
   * producto con unidades iniciales y sin proveedor, y lo que hacía que pareciera
   * que el formulario se colgaba.
   */
  const guardando = (accion: () => void) => () => {
    try {
      setErrorHoja(null);
      accion();
    } catch (e) {
      setErrorHoja(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.');
    }
  };

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

  /**
   * El portón.
   *
   * Con backend configurado y sin sesión, entrar es obligatorio: los datos viven
   * en el servidor y sin saber quién es no hay nada que mostrar.
   *
   * Sin backend, en cambio, la pantalla solo aparece si él la abre desde el botón
   * de la esquina — y con un "Volver", porque la app funciona perfecto sin cuenta
   * guardando en el dispositivo. Bloquearlo ahí sería inventarle un obstáculo.
   */
  const entrarEsObligatorio = hayBackend() && !sesion;
  if (entrarEsObligatorio || acceso) {
    return (
      <PantallaAcceso
        modoInicial={acceso ?? 'entrar'}
        alEntrar={(s) => { setSesion(s); setAcceso(null); }}
        // Cada vez que entra se intenta reclamar el negocio. Es idempotente: si ya
        // es el dueño no hace nada, y si el sistema ya tiene otro dueño devuelve el
        // motivo para mostrárselo en vez de dejarlo con una app vacía sin explicación.
        alReclamar={reclamarNegocio}
        {...(entrarEsObligatorio ? {} : { alCerrar: () => setAcceso(null) })} />
    );
  }

  /**
   * No hay datos en el dispositivo y tampoco se pudieron traer.
   *
   * Es el único caso en que la app no puede abrir, y pasa una sola vez: la
   * primera, en un equipo nuevo y sin señal. Mostrar la app vacía sería peor que
   * este cartel — parecería decirle "no tenés nada cargado" justo cuando todo lo
   * suyo está guardado y a salvo del otro lado.
   */
  if (!estado && problemaDatos) {
    return (
      <div className="app">
        <div className="ingreso">
          <div className="ingreso-marca">
            <div className="brand-mark grande"><Icono id="i-paw" /></div>
            <h1>No pudimos traer tus datos</h1>
            <p>{problemaDatos}</p>
            <p>Lo tuyo está guardado del otro lado. Buscá señal y probá de nuevo.</p>
          </div>
          <div className="ingreso-form">
            <button className="btn lg block" type="submit"
              onClick={() => { setProblemaDatos(null); setIntento((n) => n + 1); }}>
              Reintentar
            </button>
          </div>
          <p className="ingreso-pie">
            <button className="ingreso-volver"
              onClick={() => { salir(); setSesion(null); setProblemaDatos(null); }}>
              Entrar con otra cuenta
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (!estado) return <div className="app"><div className="cargando">Abriendo…</div></div>;

  const deudas = vistaDeudas(estado, hoy);
  const pendientes = sugerenciasPendientes(estado);

  // ---- acciones ------------------------------------------------------------
  const irA = (r: Ruta) => {
    if (r !== 'vender') setClientePre(null);
    // Lo mismo con la corrección: si se va de la pantalla de ingreso, se cancela.
    // No se perdió nada — el ingreso original nunca se tocó.
    if (r !== 'ingreso') setCorrigiendo(null);
    setRuta(r);
  };


  // ---- recorrido guiado ----------------------------------------------------
  //
  // El resaltado se hace tocando el DOM a mano y no con estado de React a
  // propósito: los elementos a destacar viven adentro de nueve pantallas
  // distintas, y pasarles una prop a todas para algo que solo existe durante una
  // demo ensuciaría cada una de ellas para siempre. Acá queda en doce líneas,
  // en un solo lugar, y las pantallas solo declaran un `data-tour`.

  const limpiarResaltado = () => {
    document.querySelectorAll('.tour-target')
      .forEach((e) => e.classList.remove('tour-target'));
  };

  const terminarRecorrido = () => { setPaso(null); limpiarResaltado(); };

  const irAlPaso = (n: number) => {
    if (n >= RECORRIDO.length) { terminarRecorrido(); setRuta('hoy'); return; }
    const s = RECORRIDO[n];
    limpiarResaltado();
    // Un paso que muestra el pedido en curso necesita la venta ya empezada.
    setClientePre(s.ventaEnCurso ? (estado.clientes.find((c) => c.activo)?.id ?? null) : null);
    setRuta(s.ruta);
    setPaso(n);
  };

  const iniciarRecorrido = () => { cerrarHojas(); irAlPaso(0); };

  const cerrarHojas = () => {
    // Irse de la pantalla de ingreso cancela la corrección a medio hacer. El
    // ingreso original sigue intacto: todavía no se despachó nada.
    setCorrigiendo(null);
    setHojaCobro(null); setHojaProducto(null); setHojaPrecios(false);
    setHojaCliente(null); setFichaCliente(null); setHojaProdForm(null);
    setHojaPrecioDe(null); setHojaProv(null); setFichaProv(null); setExito(null);
  };

  const acc: Acciones = {
    ir: irA,

    iniciarRecorrido,
    recorridoDisponible: paso === null,

    email: sesion?.email ?? null,
    salir: () => { salir(); setSesion(null); },

    nuevoCliente: (origen) => {
      setF({}); setNuevoDia(null); setErrorHoja(null);
      setHojaCliente({ modo: 'alta', origen });
    },

    verCliente: (id) => setFichaCliente(id),

    verVenta: (id) => setFichaVenta(id),

    verIngreso: (id) => setFichaIngreso(id),

    /*
     * Corregir = anular y volver a cargar. La pantalla de ingreso arranca con
     * los datos viejos puestos, él cambia lo que estaba mal, y recién al
     * confirmar se despachan las dos cosas juntas. Si se arrepiente en el medio
     * no pasó nada: el ingreso original sigue intacto.
     */
    corregirIngreso: (id) => {
      const compra = estado.compras.find((c) => c.id === id);
      if (!compra || compra.anuladaEn) return;
      setFichaIngreso(null);
      setCorrigiendo({
        compraId: compra.id,
        proveedorId: compra.proveedorId!,
        items: Object.fromEntries(compra.items.map((it) => [
          it.productoId,
          { cantidad: it.cantidad, costo: it.costoUnitarioCent / 100 },
        ])),
        condicion: compra.condicionPago,
        cuando: `${fechaCorta(compra.fecha)} · ${horaLocal(compra.fecha)}`,
      });
      setRuta('ingreso');
    },

    nuevoProducto: () => { setF({}); setErrorHoja(null); setHojaProdForm({ modo: 'alta' }); },

    nuevoProveedor: () => { setF({}); setErrorHoja(null); setHojaProv({ modo: 'alta' }); },

    verProveedor: (id) => setFichaProv(id),

    vender: (clienteId, items, forma, cobradoCent) => {
      const c = ctx();
      const r = vender(estado, { clienteId, items, formaPago: forma, cobradoCent }, c);
      const v = r.ventas![0];
      const cliente = estado.clientes.find((x) => x.id === clienteId);
      const quedaDebiendo = Math.max(0, v.totalCent - v.cobradoCent);
      const unidades = items.reduce((a, i) => a + i.cantidad, 0);

      /*
       * `p_cobrado_cent` se manda siempre. La función del servidor lo tenía
       * desde el principio pero la app nunca lo usaba: dejaba que el servidor
       * dedujera "cuenta → 0, cualquier otra cosa → todo". Con el pago parcial
       * esa deducción ya no alcanza, y el número que vale es el que él tipeó.
       */
      void despachar(r, [{
        tipo: 'registrar_venta', id: v.id,
        payload: {
          p_negocio_id: estado.negocioId, p_cliente_id: clienteId,
          p_items: items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad })),
          p_forma_pago: forma, p_cobrado_cent: v.cobradoCent,
          p_fecha: v.fecha, p_lista_id: estado.listaId,
        },
      }]);

      const saldo = deudas.lista.find((d) => d.clienteId === clienteId)?.saldoCent ?? 0;

      setExito({
        titulo: '¡Venta cerrada!',
        monto: plata(v.totalCent),
        texto:
          quedaDebiendo === 0
            ? `${cliente?.nombre} te pagó todo en el momento.`
            : v.cobradoCent > 0
              ? `${cliente?.nombre} te dio una parte. El resto quedó anotado en su cuenta.`
              : `Quedó anotado que ${cliente?.nombre} te lo debe. No hace falta que te acuerdes.`,
        deltas:
          quedaDebiendo === 0
            ? [{ etiqueta: 'Cobraste', valor: plata(v.cobradoCent) },
               { etiqueta: 'Productos', valor: `${unidades} u.` }]
            : v.cobradoCent > 0
              ? [{ etiqueta: 'Cobraste', valor: plata(v.cobradoCent) },
                 { etiqueta: 'Ahora te debe', valor: plata(saldo + quedaDebiendo) }]
              : [{ etiqueta: 'Ahora te debe', valor: plata(saldo + quedaDebiendo) },
                 { etiqueta: 'Productos', valor: `${unidades} u.` }],
        // La venta ya está aplicada al estado, pero `estado` en esta función es
        // el de antes: el recibo se arma con la venta, que se basta sola.
        recibo: reciboDeVenta(estado, v, NEGOCIO),
      });
      setClientePre(null);
      setRuta('hoy');
    },

    cobrar: (clienteId) => setHojaCobro(clienteId),

    entrar: (proveedorId, items, condicion, corrigeId) => {
      const c = ctx();
      /*
       * Una sola función para las dos cosas: entrada nueva, o corrección. La
       * corrección devuelve la anulación de la vieja Y el alta de la nueva en un
       * mismo resultado, así el estado se mueve una sola vez y no hay un
       * instante en el que el stock esté a medio camino.
       */
      const r = corrigeId
        ? corregirIngreso(estado, { compraId: corrigeId, proveedorId, items, condicionPago: condicion }, c)
        : entrarMercaderia(estado, { proveedorId, items, condicionPago: condicion }, c);
      // La corrección devuelve dos compras: primero la anulada, después la nueva.
      const compra = r.compras![r.compras!.length - 1];
      const anulada = corrigeId ? r.compras![0] : null;
      const suben = r.sugerencias?.length ?? 0;

      const alta = {
        tipo: 'registrar_compra' as const, id: compra.id,
        payload: {
          p_negocio_id: estado.negocioId, p_proveedor_id: proveedorId,
          p_items: items.map((i) => ({
            producto_id: i.productoId, cantidad: i.cantidad,
            costo_unitario_cent: i.costoUnitarioCent,
          })),
          p_condicion_pago: condicion, p_fecha: compra.fecha,
        },
      };

      /*
       * El ORDEN de las dos operaciones importa y no es casual: primero se anula
       * la vieja y después entra la nueva, igual que en el estado local. Al
       * revés, el servidor tendría por un momento las dos compras sumando stock.
       * Van en una sola llamada a `despachar`, así que o se encolan las dos o no
       * se encola ninguna.
       *
       * La anulación lleva id propio, como siempre: reusar el de la compra
       * pisaría su `registrar_compra` si todavía estuviera esperando subir.
       */
      void despachar(r, corrigeId
        ? [
            {
              tipo: 'anular_compra' as const, id: uuidv7(),
              payload: { p_id: corrigeId, p_fecha: anulada!.anuladaEn! },
            },
            alta,
          ]
        : [alta]);

      setCorrigiendo(null);

      setExito({
        titulo: corrigeId ? 'Ingreso corregido' : 'Mercadería entrada',
        monto: `${items.reduce((a, i) => a + i.cantidad, 0)} u.`,
        texto: corrigeId
          ? `Quedó en ${plata(compra.totalCent)}. El anterior figura anulado y el stock ya está ajustado por la diferencia.`
          : `Te salió ${plata(compra.totalCent)}. ${condicion === 'cuenta' ? 'Quedó anotado que se lo debés.' : 'Quedaste al día con él.'}`,
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

  /**
   * La fila del catálogo que se manda al servidor.
   *
   * Es la misma para el alta y para la edición, porque del otro lado es un
   * upsert por id. Los `?? null` importan: sin ellos, vaciar un campo no lo
   * borraría en el servidor — la clave simplemente no viajaría y el dato viejo
   * quedaría vivo allá mientras acá ya no está.
   */
  const filaCliente = (c: { id: Uuid; nombre: string; zona?: string; rubro?: string;
    contacto?: string; diaVisita?: number; activo: boolean }): Operacion => ({
    tipo: 'guardar_cliente', id: c.id,
    payload: {
      negocio_id: estado.negocioId, nombre: c.nombre,
      zona: c.zona ?? null, rubro: c.rubro ?? null, contacto: c.contacto ?? null,
      dia_visita: c.diaVisita ?? null, activo: c.activo,
    },
  });

  const guardarCliente = () => {
    const hoja = hojaCliente;
    if (!hoja) return;

    if (hoja.modo === 'editar') {
      const r = editarCliente(estado, {
        id: hoja.id,
        nombre: campo('nombre'),
        zona: campo('zona'),
        rubro: campo('rubro'),
        contacto: campo('contacto'),
        diaVisita: nuevoDia,
      });
      void despachar(r, [filaCliente(r.clientes![0])]);
      setHojaCliente(null);
      return;
    }

    const r = altaCliente(estado, {
      nombre: campo('nombre'),
      zona: campo('zona') || undefined,
      rubro: campo('rubro') || undefined,
      contacto: campo('contacto') || undefined,
      diaVisita: nuevoDia ?? undefined,
    }, ctx());
    const c = r.clientes![0];

    void despachar(r, [filaCliente(c)]);
    setHojaCliente(null);

    if (hoja.origen === 'vender') {
      // Venía en medio de una venta: se sigue con el comercio recién cargado.
      setClientePre(c.id);
      setRuta('vender');
    } else {
      setExito({
        titulo: 'Comercio agregado',
        monto: c.nombre,
        texto: 'Ya podés venderle y llevarle la cuenta de lo que te deba.',
        deltas: [{ etiqueta: 'Tus comercios', valor: String(estado.clientes.filter((x) => x.activo).length + 1) }],
      });
    }
  };

  /** Abre la hoja de edición con los datos que ya tiene cargados. */
  const abrirEditarCliente = (id: Uuid) => {
    const c = estado.clientes.find((x) => x.id === id);
    if (!c) return;
    setF({ nombre: c.nombre, zona: c.zona ?? '', rubro: c.rubro ?? '', contacto: c.contacto ?? '' });
    setNuevoDia(c.diaVisita ?? null);
    setFichaCliente(null);
    setHojaCliente({ modo: 'editar', id });
  };

  const cambiarActivoCliente = (id: Uuid, activo: boolean) => {
    const r = activarCliente(estado, id, activo);
    void despachar(r, [filaCliente(r.clientes![0])]);
    setFichaCliente(null);
    if (!activo) {
      setExito({
        titulo: 'Comercio archivado',
        monto: r.clientes![0].nombre,
        texto: 'No te aparece más para venderle. Sus ventas y su deuda siguen en el historial: nada se borró.',
        deltas: [{ etiqueta: 'Se puede reactivar', valor: 'sí' }],
      });
    }
  };

  // ---- productos -----------------------------------------------------------

  const filaProducto = (p: { id: Uuid; codigo?: string; nombre: string; variante?: string;
    descripcion?: string; categoria?: string; proveedorId?: Uuid; unidad: string;
    sugeridoEnVehiculo?: number; activo: boolean }): Operacion => ({
    tipo: 'guardar_producto', id: p.id,
    payload: {
      negocio_id: estado.negocioId, nombre: p.nombre,
      codigo: p.codigo ?? null,
      variante: p.variante ?? null, descripcion: p.descripcion ?? null,
      categoria: p.categoria ?? null,
      proveedor_id: p.proveedorId ?? null, unidad: p.unidad,
      sugerido_en_vehiculo: p.sugeridoEnVehiculo ?? null, activo: p.activo,
    },
  });

  const guardarProducto = () => {
    const hoja = hojaProdForm;
    if (!hoja) return;

    if (hoja.modo === 'editar') {
      const r = editarProducto(estado, {
        id: hoja.id,
        nombre: campo('nombre'),
        codigo: campo('codigo'),
        variante: campo('variante'),
        descripcion: campo('descripcion'),
        categoria: campo('categoria'),
        proveedorId: campo('proveedor') || null,
      });
      void despachar(r, [filaProducto(r.productos![0])]);
      setHojaProdForm(null);
      return;
    }

    const precioCent = aCentavos(campo('precio'));
    const cantidad = Number(campo('cantidad')) || 0;
    const costoCent = aCentavos(campo('costo'));

    const r = altaProducto(estado, {
      nombre: campo('nombre'),
      precioCent,
      codigo: campo('codigo') || undefined,
      variante: campo('variante') || undefined,
      descripcion: campo('descripcion') || undefined,
      categoria: campo('categoria') || undefined,
      proveedorId: campo('proveedor') || undefined,
      ...(cantidad > 0 && costoCent > 0
        ? { cargaInicial: { cantidad, costoUnitarioCent: costoCent } }
        : {}),
    }, ctx());

    const p = r.productos![0];
    const precio = r.precios![0];
    const compra = r.compras?.[0];

    const ops: Operacion[] = [filaProducto(p), {
      tipo: 'cambiar_precio', id: precio.id,
      payload: {
        p_producto_id: p.id, p_lista_id: estado.listaId,
        p_precio_cent: precio.precioCent, p_origen: 'manual', p_motivo: 'precio inicial',
      },
    }];
    if (compra) {
      ops.push({
        tipo: 'registrar_compra', id: compra.id,
        payload: {
          p_negocio_id: estado.negocioId, p_proveedor_id: compra.proveedorId ?? null,
          p_items: compra.items.map((i) => ({
            producto_id: i.productoId, cantidad: i.cantidad,
            costo_unitario_cent: i.costoUnitarioCent,
          })),
          p_condicion_pago: 'contado', p_fecha: compra.fecha,
        },
      });
    }

    void despachar(r, ops);
    setHojaProdForm(null);
    setExito({
      titulo: 'Producto agregado',
      monto: p.nombre,
      texto: compra
        ? `Lo vendés a ${plata(precio.precioCent)} y quedaron ${compra.items[0].cantidad} unidades en tu casa.`
        : `Lo vendés a ${plata(precio.precioCent)}. El costo se carga cuando te llegue mercadería.`,
      deltas: [{ etiqueta: 'Lo vendés a', valor: plata(precio.precioCent) }],
    });
  };

  const abrirEditarProducto = (id: Uuid) => {
    const p = estado.productos.find((x) => x.id === id);
    if (!p) return;
    setF({
      codigo: p.codigo ?? '', nombre: p.nombre, variante: p.variante ?? '',
      descripcion: p.descripcion ?? '',
      categoria: p.categoria ?? '', proveedor: p.proveedorId ?? '',
    });
    setHojaProducto(null);
    setHojaProdForm({ modo: 'editar', id });
  };

  const cambiarActivoProducto = (id: Uuid, activo: boolean) => {
    const r = activarProducto(estado, id, activo);
    void despachar(r, [filaProducto(r.productos![0])]);
    setHojaProducto(null);
    if (!activo) {
      setExito({
        titulo: 'Producto archivado',
        monto: r.productos![0].nombre,
        texto: 'No te aparece más para vender. Las ventas viejas y el stock que tenía quedan como estaban.',
        deltas: [{ etiqueta: 'Se puede reactivar', valor: 'sí' }],
      });
    }
  };

  const guardarPrecio = (productoId: Uuid) => {
    const precioCent = aCentavos(campo('precio'));
    if (precioCent <= 0) return;

    const r = cambiarPrecio(estado, { productoId, precioCent, motivo: 'cambio a mano' }, ctx());
    setHojaPrecioDe(null);
    setHojaProducto(null);

    // Sin fila nueva: puso el mismo precio que ya tenía. No hay nada que guardar.
    if (!r.precios?.length) return;

    void despachar(r, [{
      tipo: 'cambiar_precio', id: r.precios[0].id,
      payload: {
        p_producto_id: productoId, p_lista_id: estado.listaId,
        p_precio_cent: precioCent, p_origen: 'manual', p_motivo: 'cambio a mano',
      },
    }]);

    const anterior = r.preciosCerrados?.[0]?.precioCent;
    setExito({
      titulo: 'Precio actualizado',
      monto: plata(precioCent),
      texto: anterior !== undefined
        ? `Antes lo vendías a ${plata(anterior)}. Ese precio queda guardado con la fecha de hoy: las ventas que ya hiciste no se tocan.`
        : 'Desde ahora es el precio que se usa al vender.',
      deltas: [{ etiqueta: 'Precio nuevo', valor: plata(precioCent) }],
    });
  };

  // ---- proveedores ---------------------------------------------------------

  const filaProveedor = (p: { id: Uuid; nombre: string; zona?: string; rubro?: string;
    contacto?: string; activo: boolean }): Operacion => ({
    tipo: 'guardar_proveedor', id: p.id,
    payload: {
      negocio_id: estado.negocioId, nombre: p.nombre,
      zona: p.zona ?? null, rubro: p.rubro ?? null,
      contacto: p.contacto ?? null, activo: p.activo,
    },
  });

  const guardarProveedor = () => {
    const hoja = hojaProv;
    if (!hoja) return;
    const r = hoja.modo === 'editar'
      ? editarProveedor(estado, {
          id: hoja.id, nombre: campo('nombre'),
          zona: campo('zona'), rubro: campo('rubro'), contacto: campo('contacto'),
        })
      : altaProveedor(estado, {
          nombre: campo('nombre'),
          zona: campo('zona') || undefined,
          rubro: campo('rubro') || undefined,
          contacto: campo('contacto') || undefined,
        }, ctx());

    const p = r.proveedores![0];
    void despachar(r, [filaProveedor(p)]);
    setHojaProv(null);
    if (hoja.modo === 'alta') {
      setExito({
        titulo: 'Proveedor agregado', monto: p.nombre,
        texto: 'Ya lo podés elegir cuando te llegue mercadería.',
        deltas: [{ etiqueta: 'Tus proveedores', valor: String(estado.proveedores.filter((x) => x.activo).length + 1) }],
      });
    }
  };

  const abrirEditarProveedor = (id: Uuid) => {
    const p = estado.proveedores.find((x) => x.id === id);
    if (!p) return;
    setF({ nombre: p.nombre, zona: p.zona ?? '', rubro: p.rubro ?? '', contacto: p.contacto ?? '' });
    setFichaProv(null);
    setHojaProv({ modo: 'editar', id });
  };

  /**
   * Anular un ingreso de mercadería.
   *
   * Lo pesado pasa en `anularCompra`, que es una función pura y tiene sus tests.
   * Acá solo se despacha y se le cuenta qué pasó, con los dos números que le
   * importan: cuántas unidades salieron del stock y cómo le quedó la deuda con
   * ese proveedor.
   */
  const anularIngreso = (compraId: Uuid) => {
    const compra = estado.compras.find((c) => c.id === compraId);
    if (!compra) return;

    const c = ctx();
    const r = anularCompra(estado, compraId, c);
    const unidades = compra.items.reduce((a, i) => a + i.cantidad, 0);
    const prov = estado.proveedores.find((x) => x.id === compra.proveedorId);

    // Cuánto le va a quedar debiendo a ese proveedor después de anular.
    const deudaDespues = estado.compras
      .filter((x) => x.proveedorId === compra.proveedorId
        && x.condicionPago === 'cuenta'
        && !x.anuladaEn
        && x.id !== compraId)
      .reduce((a, x) => a + x.totalCent, 0);

    /*
     * `uuidv7()` como id de la operación y la compra en el payload. Es la única
     * operación que no usa el id de la fila que toca, y tiene que ser así: si la
     * compra todavía está esperando subir, su `registrar_compra` está guardado
     * en la cola con ESE id, y reusarlo lo pisaría — la compra nunca llegaría al
     * servidor y la anulación fallaría porque no existe.
     */
    void despachar(r, [{
      tipo: 'anular_compra', id: uuidv7(),
      payload: { p_id: compraId, p_fecha: r.compras![0].anuladaEn },
    }]);

    setConfirmarAnular(null);
    setFichaIngreso(null);
    setExito({
      titulo: 'Ingreso anulado',
      monto: plata(compra.totalCent),
      texto: compra.condicionPago === 'cuenta'
        ? `Se descontó del stock y ya no figura como deuda con ${prov?.nombre ?? 'el proveedor'}.`
        : 'Se descontó del stock. La entrada queda en el historial, marcada como anulada.',
      deltas: compra.condicionPago === 'cuenta'
        ? [{ etiqueta: 'Salieron del stock', valor: `${unidades} u.` },
           { etiqueta: 'Ahora le debés', valor: plata(deudaDespues) }]
        : [{ etiqueta: 'Salieron del stock', valor: `${unidades} u.` },
           { etiqueta: 'Productos', valor: String(compra.items.length) }],
    });
  };

  /**
   * Anular una venta.
   *
   * Los tres números que le importan y que se le muestran: cuántas unidades
   * vuelven al stock, cuánto sale de la caja del día, y cómo le queda la deuda
   * de ese comercio.
   */
  const anularVentaHecha = (ventaId: Uuid) => {
    const venta = estado.ventas.find((v) => v.id === ventaId);
    if (!venta) return;

    const c = ctx();
    const r = anularVenta(estado, ventaId, c);
    const unidades = venta.items.reduce((a, i) => a + i.cantidad, 0);

    // Cómo queda la deuda de ese comercio una vez anulada esta venta.
    const deudaDespues = saldoCliente(
      venta.clienteId,
      estado.ventas.map((v) => (v.id === ventaId ? { ...v, anuladaEn: c.ahora() } : v)),
      estado.pagos,
      hoy,
    ).saldoCent;

    // Id propio, la venta en el payload: mismo motivo que en la anulación de
    // ingresos — si la venta todavía espera subir, su `registrar_venta` está en
    // la cola con ESE id y reusarlo lo pisaría.
    void despachar(r, [{
      tipo: 'anular_venta', id: uuidv7(),
      payload: { p_id: ventaId, p_fecha: r.ventas![0].anuladaEn },
    }]);

    setConfirmarAnularVenta(null);
    setFichaVenta(null);
    setExito({
      titulo: 'Venta anulada',
      monto: plata(venta.totalCent),
      texto: venta.cobradoCent > 0
        ? `La mercadería volvió al stock y ${plata(venta.cobradoCent)} salieron de la caja de hoy.`
        : 'La mercadería volvió al stock y la venta ya no figura como deuda.',
      deltas: [
        { etiqueta: 'Volvieron al stock', valor: `${unidades} u.` },
        { etiqueta: 'Ahora te debe', valor: plata(deudaDespues) },
      ],
    });
  };

  const cambiarActivoProveedor = (id: Uuid, activo: boolean) => {
    const r = activarProveedor(estado, id, activo);
    void despachar(r, [filaProveedor(r.proveedores![0])]);
    setFichaProv(null);
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

    /*
     * Se manda `cambiar_precio`, NO `aplicar_sugerencia`.
     *
     * `aplicar_sugerencia` recibe el id de la sugerencia, y las sugerencias de
     * acá se generan en el dispositivo con un id propio: ese id no existe del
     * lado del servidor. La función habría rebotado con "la sugerencia no
     * existe" — un 4xx, o sea error permanente — y el precio nuevo nunca habría
     * llegado a la base, aunque en la pantalla se viera aplicado.
     *
     * Lo que importa subir es el precio, y `cambiar_precio` hace exactamente eso
     * y con la misma garantía: cierra la fila anterior y abre la nueva en una
     * transacción. La sugerencia es contabilidad interna de la pantalla.
     */
    void despachar(r, aplicarlas
      ? (r.precios ?? []).map((p) => ({
          tipo: 'cambiar_precio' as const, id: p.id,
          payload: {
            p_producto_id: p.productoId, p_lista_id: p.listaId,
            p_precio_cent: p.precioCent, p_origen: 'sugerido',
            p_motivo: 'aumento de costo',
          },
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
    productos: PantallaProductos, clientes: PantallaClientes,
    ingreso: PantallaIngreso, proveedores: PantallaProveedores, numeros: PantallaNumeros,
  }[ruta];

  const clienteCobro = hojaCobro ? deudas.lista.find((d) => d.clienteId === hojaCobro) : null;

  return (
    <div className={`app ${paso !== null ? 'en-recorrido' : ''}`}>
      <header className="hud">
        <div className="hud-top">
         <div className="brand">
          {/*
            * El enlace envuelve SOLO el ícono, como en Instagram o TikTok.
            *
            * El clic común no navega: se cancela y se cambia de pantalla sin
            * recargar, que es lo que tiene que pasar en una app que funciona sin
            * señal — una recarga de verdad la dejaría en blanco hasta que el
            * service worker responda.
            *
            * Pero el `href` está y apunta a la raíz, y eso habilita lo que un
            * botón no puede: clic derecho para copiar la dirección, arrastrarlo
            * al escritorio para dejar un acceso directo, y ctrl+clic para abrir
            * la app en otra pestaña.
            *
            * `title` en el enlace Y en la imagen: es de ahí de donde Windows saca
            * el NOMBRE del acceso directo. Sin eso quedaría "icono-192".
            *
            * El `aria-label` dice exactamente lo mismo, sin agregarle "ir al
            * inicio" ni nada: el nombre accesible es otro de los textos que el
            * navegador puede usar para el acceso directo, y cualquier cosa de
            * más terminaría pegada en el nombre del archivo.
            *
            * `draggable={false}` en la imagen es lo que hace que funcione el
            * arrastre. Si la imagen se puede arrastrar sola, el navegador le da
            * prioridad y arrastra el archivo .png en vez del enlace.
            */}
          <a className="brand-logo" href="/"
            title={NEGOCIO} aria-label={NEGOCIO}
            onClick={(ev: MouseEvent<HTMLAnchorElement>) => {
              // Ctrl/⌘/shift/alt-clic y el botón del medio son "abrir en otra
              // pestaña". Si los cancelara, rompería lo que vine a habilitar.
              if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
              ev.preventDefault();
              irA('hoy');
            }}>
            {/*
              * `icono-192.png` sin barra al principio: la ruta es relativa a
              * propósito. El empaquetador la reescribe al nombre con hash, y el
              * manifest declara el alcance de la app como `./`. Una ruta absoluta
              * rompería las dos cosas.
              */}
            <img src="icono-192.png" alt={NEGOCIO} title={NEGOCIO}
              width={34} height={34} draggable={false} />
          </a>

          {/*
            * El nombre y la fecha quedan AFUERA del enlace. Dos motivos: así el
            * arrastre lleva el ícono limpio y no un bloque con la fecha de hoy
            * pegada, y así el texto no toma el cursor de enlace.
            */}
          <div className="brand-texto">
            <div className="brand-name">{NEGOCIO}</div>
            <div className="brand-sub">{fechaLarga(hoy)}</div>
          </div>
         </div>

          <div className="hud-acciones">
            {pendientes.length > 0 && (
              <button className="hud-btn" aria-label="Precios para revisar" onClick={() => setHojaPrecios(true)}>
                <Icono id="i-tag" />
              </button>
            )}
            {/* Siempre visible, tenga cuenta o no: si no la tiene, es justamente
                el lugar donde se entera de que puede crearla. El punto naranja
                avisa que está usando la app sin cuenta. */}
            <button className="hud-btn" aria-label="Mi cuenta" onClick={() => setHojaCuenta(true)}>
              <Icono id="i-user" />
              {!sesion && <i className="punto" />}
            </button>
          </div>
        </div>
        <div className="hud-money" {...tour('resumen')}>
          <div className="mtile hot">
            <span>Cobré hoy</span>
            {/*
              * El día es el de acá, no el de UTC: ver `src/domain/fechas.ts`.
              * Comparando el texto ISO, a las 21 hs este número se le ponía en
              * cero mientras todavía estaba vendiendo.
              */}
            <b className="num">{plata(
              estado.ventas.filter((v) => !v.anuladaEn && mismoDiaLocal(v.fecha, hoy))
                .reduce((a, v) => a + v.cobradoCent, 0) +
              estado.pagos.filter((p) => mismoDiaLocal(p.fecha, hoy))
                .reduce((a, p) => a + p.montoCent, 0),
            )}</b>
          </div>
          <div className="mtile"><span>Me deben</span><b className="num">{plata(deudas.totalCent)}</b></div>
        </div>
      </header>

      <main>
        <Pantalla
          key={ruta === 'vender' ? `vender-${clientePre ?? 'inicio'}` : ruta}
          estado={estado} hoy={hoy} acc={acc}
          clienteInicial={ruta === 'vender' ? clientePre : null}
          corrigiendo={ruta === 'ingreso' ? corrigiendo : null} />
        {sinSubir > 0 && (
          <p className="sincro pend">
            <Icono id="i-cloud" /> {sinSubir} {sinSubir === 1 ? 'operación' : 'operaciones'} sin subir · se suben solas cuando haya señal
          </p>
        )}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${t.venta ? 'sell' : ''}`}
            aria-current={rutaActiva === t.id} onClick={() => irA(t.id)}>
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
          {/*
            * De qué ventas viene esa deuda.
            *
            * Es la pregunta que hace el comercio cuando le dicen un número:
            * "¿de qué?". Cada una abre su detalle, con el comprobante para
            * volver a mandárselo — que suele ser lo que destraba el cobro.
            */}
          {(() => {
            const pendientes = ventasDelCliente(estado, clienteCobro.clienteId, 4)
              .filter((x) => x.debeCent > 0);
            if (pendientes.length === 0) return null;
            return (
              <>
                <p className="eyebrow">De qué viene · tocá para el comprobante</p>
                <div className="stack" style={{ marginBottom: 16 }}>
                  {pendientes.map((x) => (
                    <button className="row" key={x.id}
                      onClick={() => { setHojaCobro(null); setFichaVenta(x.id); }}>
                      <span className="row-main">
                        <b>{x.cuando}</b>
                        <span>{x.unidades} u. de {plata(x.totalCent)}</span>
                      </span>
                      <span className="row-end">
                        <b>{plata(x.debeCent)}</b>
                        <span>debe</span>
                      </span>
                      <Icono id="i-arrow" clase="ico-s ico-arrow" />
                    </button>
                  ))}
                </div>
              </>
            );
          })()}

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
            <div><b>{hojaProducto.enStock}</b><span>en stock</span></div>
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
          <div className="chips" style={{ marginTop: 14 }}>
            <button className="chip" onClick={() => {
              setCampo('precio', String((hojaProducto.precioCent ?? 0) / 100));
              setHojaPrecioDe(hojaProducto.id);
            }}>Cambiar el precio</button>
            <button className="chip" onClick={() => abrirEditarProducto(hojaProducto.id)}>
              Corregir datos
            </button>
          </div>
          <button className="btn ghost block" style={{ marginTop: 14 }}
            onClick={() => setHojaProducto(null)}>Cerrar</button>
          <button className="btn ghost block" style={{ marginTop: 6, color: 'var(--bad)' }}
            onClick={() => cambiarActivoProducto(hojaProducto.id, false)}>
            Dejar de vender este producto
          </button>
        </Hoja>
      )}

      {hojaPrecioDe && (() => {
        const p = estado.productos.find((x) => x.id === hojaPrecioDe);
        const actual = precioDe(estado, hojaPrecioDe);
        const nuevo = aCentavos(campo('precio'));
        return (
          <Hoja alCerrar={() => setHojaPrecioDe(null)}>
            <h3>Cambiar el precio</h3>
            <p className="sub">{p?.nombre}{p?.variante ? ` · ${p.variante}` : ''}</p>

            <label className="campo">
              <span>¿A cuánto lo vendés ahora?</span>
              <input className="amount-in num" inputMode="decimal" value={campo('precio')}
                onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('precio', ev.target.value)}
                aria-label="Precio nuevo" />
            </label>

            {actual !== null && nuevo > 0 && nuevo !== actual && (
              <div style={{ margin: '12px 0' }}>
                <Alerta tipo={nuevo > actual ? 'ok' : 'warn'} icono="i-tag"
                  titulo={nuevo > actual
                    ? `Sube ${Math.round(((nuevo - actual) / actual) * 100)}%`
                    : `Baja ${Math.round(((actual - nuevo) / actual) * 100)}%`}
                  texto={`Venías vendiéndolo a ${plata(actual)}. Ese precio queda guardado con la fecha de hoy.`} />
              </div>
            )}

            <button className="btn lg block" disabled={nuevo <= 0}
              onClick={() => guardarPrecio(hojaPrecioDe)}>Guardar el precio nuevo</button>
            <button className="btn outline block" style={{ marginTop: 9 }}
              onClick={() => setHojaPrecioDe(null)}>Cancelar</button>
          </Hoja>
        );
      })()}

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

      {hojaCliente && (() => {
        const editando = hojaCliente.modo === 'editar';
        const repetido = clienteParecido(estado, campo('nombre'));
        // Al editar, encontrarse a uno mismo no es un duplicado.
        const duplicado = repetido && (!editando || repetido.id !== hojaCliente.id);
        return (
          <Hoja alCerrar={() => setHojaCliente(null)}>
            <h3>{editando ? 'Datos del comercio' : 'Comercio nuevo'}</h3>
            <p className="sub">
              {editando
                ? 'Cambiá lo que haga falta. Sus ventas y su deuda no se tocan.'
                : 'Con el nombre alcanza. El resto lo completás cuando tengas tiempo.'}
            </p>

            <label className="campo">
              <span>¿Cómo se llama?</span>
              <input className="texto" id="cliente-nombre" autoFocus value={campo('nombre')}
                placeholder="Pet Shop Huellitas"
                onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('nombre', ev.target.value)} />
            </label>

            {duplicado && (
              <div style={{ marginBottom: 14 }}>
                <Alerta tipo="warn" icono="i-alert"
                  titulo="Ya tenés un comercio con ese nombre"
                  texto="Fijate que no lo estés cargando dos veces." />
              </div>
            )}

            <label className="campo">
              <span>Ubicación <em>· opcional</em></span>
              <input className="texto" id="cliente-zona" value={campo('zona')}
                placeholder="Morón"
                onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('zona', ev.target.value)} />
            </label>

            <label className="campo">
              <span>Rubro <em>· opcional</em></span>
              <input className="texto" id="cliente-rubro" value={campo('rubro')}
                placeholder="Veterinaria, pet shop, forrajería"
                onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('rubro', ev.target.value)} />
            </label>

            <label className="campo">
              <span>Teléfono o contacto <em>· opcional</em></span>
              <input className="texto" id="cliente-contacto" inputMode="tel" value={campo('contacto')}
                placeholder="11 5555-4444"
                onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('contacto', ev.target.value)} />
            </label>

            <div className="campo">
              <span>¿Qué día lo visitás? <em>· opcional</em></span>
              <div className="chips">
                {DIAS_VISITA.map((d) => (
                  <button key={d.n} className="chip" aria-pressed={nuevoDia === d.n}
                    onClick={() => setNuevoDia(nuevoDia === d.n ? null : d.n)}>
                    {d.texto}
                  </button>
                ))}
              </div>
            </div>

            {errorHoja && (
              <div style={{ marginBottom: 14 }}>
                <Alerta tipo="bad" icono="i-alert" titulo="No se pudo guardar" texto={errorHoja} />
              </div>
            )}

            <button className="btn lg block" disabled={!campo('nombre').trim()} onClick={guardando(guardarCliente)}>
              {editando ? 'Guardar los cambios'
                : hojaCliente.origen === 'vender' ? 'Guardar y seguir con la venta'
                : 'Guardar comercio'}
            </button>
            <button className="btn outline block" style={{ marginTop: 9 }}
              onClick={() => setHojaCliente(null)}>Cancelar</button>
          </Hoja>
        );
      })()}

      {/* ---------------------------------------------------------------
        * El detalle de una venta ya hecha.
        *
        * Se arma desde la venta guardada, con sus precios congelados: es lo que
        * pasó, no lo que pasaría si la hiciera hoy. Desde acá vuelve a salir el
        * comprobante, que es lo que le van a pedir dos días después por WhatsApp.
        * --------------------------------------------------------------- */}
      {fichaVenta && (() => {
        const v = estado.ventas.find((x) => x.id === fichaVenta);
        if (!v) return null;
        const cliente = estado.clientes.find((c) => c.id === v.clienteId);
        const debe = Math.max(0, v.totalCent - v.cobradoCent);
        const estadoCobro = v.anuladaEn
          ? 'Anulada'
          : debe === 0 ? 'Cobrado' : v.cobradoCent > 0 ? 'Pago parcial' : 'Queda en cuenta';

        return (
          <Hoja alCerrar={() => setFichaVenta(null)}>
            <h3>{cliente?.nombre ?? 'Venta'}</h3>
            <p className="sub">{fechaYHora(v.fecha)} · {estadoCobro}</p>

            {v.anuladaEn && (
              <Alerta tipo="warn" icono="i-alert" titulo="Esta venta está anulada"
                texto={`Se anuló el ${fechaYHora(v.anuladaEn)}. La mercadería volvió al stock y la venta no cuenta en la caja ni en lo que te deben.`} />
            )}

            <div className="stack" style={{ marginTop: 12 }}>
              {v.items.map((it) => {
                const p = estado.productos.find((x) => x.id === it.productoId);
                return (
                  <div className="row" key={it.id}>
                    <span className="row-main">
                      <b>
                        {p?.codigo && <span className="cod">{p.codigo}</span>}
                        {p?.nombre ?? 'Producto'}
                      </b>
                      <span>{it.cantidad} × {plata(it.precioUnitarioCent)}</span>
                    </span>
                    <span className="row-end">
                      <b>{plata(it.precioUnitarioCent * it.cantidad)}</b>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="tot-fila">
                <span style={{ fontWeight: 700 }}>Total</span>
                <b className="num">{plata(v.totalCent)}</b>
              </div>
              {/* En pasado si está anulada: hoy ya no debe nada de esta venta. */}
              <div className="tot-fila">
                <span>{v.anuladaEn ? 'Había pagado' : 'Pagó'}</span>
                <b className="num">{plata(v.cobradoCent)}</b>
              </div>
              {debe > 0 && (
                <div className={`tot-fila ${v.anuladaEn ? '' : 'debe'}`}>
                  <span>{v.anuladaEn ? 'Quedaba debiendo' : 'Queda debiendo'}</span>
                  <b className="num">{plata(debe)}</b>
                </div>
              )}
            </div>

            {/*
              * El comprobante se puede mandar SIEMPRE, incluso anulado, y eso es
              * un cambio de criterio a pedido del cliente.
              *
              * Antes no se ofrecía, con un buen motivo: mandar el comprobante de
              * una venta dada de baja es peor que no mandar nada. Lo que faltaba
              * era la otra mitad del caso — si ya le mandó el comprobante y
              * después anuló la venta, tiene que poder avisarle. El comprobante
              * anulado lleva una banda roja arriba de todo que lo dice antes que
              * cualquier importe, así que no se puede confundir con uno vigente.
              */}
            <BotonCompartir datos={reciboDeVenta(estado, v, NEGOCIO)} secundario />
            <button className="btn block" style={{ marginTop: v.anuladaEn ? 12 : 8 }}
              onClick={() => setFichaVenta(null)}>Cerrar</button>

            {!v.anuladaEn && (
              <button className="btn ghost block" style={{ marginTop: 6, color: 'var(--bad)' }}
                onClick={() => setConfirmarAnularVenta(v.id)}>
                Anular esta venta
              </button>
            )}
          </Hoja>
        );
      })()}

      {/* La confirmación de la venta. Dice con números qué va a pasar. */}
      {confirmarAnularVenta && (() => {
        const v = estado.ventas.find((x) => x.id === confirmarAnularVenta);
        if (!v) return null;
        const cliente = estado.clientes.find((c) => c.id === v.clienteId);
        const unidades = v.items.reduce((a, i) => a + i.cantidad, 0);
        const debe = Math.max(0, v.totalCent - v.cobradoCent);

        return (
          <Hoja alCerrar={() => setConfirmarAnularVenta(null)}>
            <h3>¿Anular esta venta?</h3>
            <p className="sub">Esto no se puede deshacer desde la app.</p>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="tot-fila">
                <span>Vuelven al stock</span>
                <b className="num">{unidades} u.</b>
              </div>
              {v.cobradoCent > 0 && (
                <div className="tot-fila">
                  <span>Sale de la caja de hoy</span>
                  <b className="num">{plata(v.cobradoCent)}</b>
                </div>
              )}
              {debe > 0 && (
                <div className="tot-fila">
                  <span>{cliente?.nombre ?? 'El comercio'} deja de deberte</span>
                  <b className="num">{plata(debe)}</b>
                </div>
              )}
            </div>

            {v.cobradoCent > 0 && (
              <p className="sub" style={{ marginTop: 12 }}>
                Ojo: esto saca la venta de los números, pero la plata que ya te dio
                no se devuelve sola. Si se la tenés que devolver, es aparte.
              </p>
            )}

            <button className="btn accent lg block" style={{ marginTop: 14, background: 'var(--bad)' }}
              onClick={() => anularVentaHecha(v.id)}>
              Sí, anular la venta
            </button>
            <button className="btn outline block" style={{ marginTop: 8 }}
              onClick={() => setConfirmarAnularVenta(null)}>
              No, dejarla como está
            </button>
          </Hoja>
        );
      })()}

      {/* ---------------------------------------------------------------
        * El detalle de un ingreso de mercadería, con la anulación.
        *
        * Anular NO borra: asienta los movimientos que compensan la entrada y
        * marca la compra. Por eso un ingreso anulado se sigue viendo acá, con
        * su cartel: él tiene que poder revisar qué anuló, sobre todo si se
        * equivocó al anular.
        * --------------------------------------------------------------- */}
      {fichaIngreso && (() => {
        const c = estado.compras.find((x) => x.id === fichaIngreso);
        if (!c) return null;
        const prov = estado.proveedores.find((p) => p.id === c.proveedorId);
        const unidades = c.items.reduce((a, i) => a + i.cantidad, 0);

        return (
          <Hoja alCerrar={() => setFichaIngreso(null)}>
            <h3>{prov?.nombre ?? 'Ingreso sin proveedor'}</h3>
            {/* Anulado manda: decir "se lo debés" arriba de un cartel que
                avisa que ya no le debe nada sería contradecirse en dos renglones. */}
            <p className="sub">
              {fechaYHora(c.fecha)} · {c.anuladaEn
                ? 'Anulado'
                : c.condicionPago === 'cuenta' ? 'Se lo debés' : 'Pagado'}
            </p>

            {c.anuladaEn && (
              <Alerta tipo="warn" icono="i-alert" titulo="Este ingreso está anulado"
                texto={`Se anuló el ${fechaYHora(c.anuladaEn)}. La mercadería ya se descontó del stock y no cuenta como deuda.`} />
            )}

            <div className="stack" style={{ marginTop: 12 }}>
              {c.items.map((it) => {
                const p = estado.productos.find((x) => x.id === it.productoId);
                return (
                  <div className="row" key={it.id}>
                    <span className="row-main">
                      <b>
                        {p?.codigo && <span className="cod">{p.codigo}</span>}
                        {p?.nombre ?? 'Producto'}
                      </b>
                      <span>{it.cantidad} × {plata(it.costoUnitarioCent)} de costo</span>
                    </span>
                    <span className="row-end">
                      <b>{plata(it.costoUnitarioCent * it.cantidad)}</b>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="tot-fila">
                <span style={{ fontWeight: 700 }}>Total del ingreso</span>
                <b className="num">{plata(c.totalCent)}</b>
              </div>
              <div className="tot-fila">
                <span>Unidades</span>
                <b className="num">{unidades}</b>
              </div>
            </div>

            {/*
              * El comprobante de la entrada. Sirve para dos cosas de verdad:
              * mandarle al proveedor lo que él anotó —"esto es lo que me
              * llegó"— y, si la anuló o la corrigió, avisarle que la anterior
              * quedó sin efecto. Los importes de este comprobante son de COSTO,
              * no de venta.
              */}
            <BotonCompartir datos={reciboDeIngreso(estado, c, NEGOCIO)} secundario />

            {/*
              * Corregir va ANTES que anular, y no es un detalle de orden: de las
              * dos, corregir es casi siempre la que quiere. Cargó 100 donde iban
              * 10, o puso mal un costo; anular a secas lo deja con el stock
              * arreglado pero sin la entrada que de verdad ocurrió.
              */}
            {!c.anuladaEn && (
              <button className="btn outline block" style={{ marginTop: 8 }}
                onClick={() => acc.corregirIngreso(c.id)}>
                Corregir este ingreso
              </button>
            )}

            <button className="btn block" style={{ marginTop: c.anuladaEn ? 12 : 8 }}
              onClick={() => setFichaIngreso(null)}>Cerrar</button>

            {!c.anuladaEn && (
              <button className="btn ghost block" style={{ marginTop: 6, color: 'var(--bad)' }}
                onClick={() => setConfirmarAnular(c.id)}>
                Anular este ingreso
              </button>
            )}
          </Hoja>
        );
      })()}

      {/* La confirmación. Dice exactamente qué va a pasar, con los números. */}
      {confirmarAnular && (() => {
        const c = estado.compras.find((x) => x.id === confirmarAnular);
        if (!c) return null;
        const unidades = c.items.reduce((a, i) => a + i.cantidad, 0);
        const prov = estado.proveedores.find((p) => p.id === c.proveedorId);

        /*
         * Cuánto stock queda después. Si alguno queda en negativo hay que
         * decirlo: significa que ya vendió parte de esa mercadería, y anular
         * igual es correcto, pero él tiene que saber que el número va a quedar
         * en rojo y por qué.
         */
        const enRojo = c.items.filter((it) => {
          const actual = vistaProductos(estado).find((p) => p.id === it.productoId)?.enStock ?? 0;
          return actual - it.cantidad < 0;
        }).length;

        return (
          <Hoja alCerrar={() => setConfirmarAnular(null)}>
            <h3>¿Anular este ingreso?</h3>
            <p className="sub">Esto no se puede deshacer desde la app.</p>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="tot-fila">
                <span>Salen del stock</span>
                <b className="num">{unidades} u.</b>
              </div>
              {c.condicionPago === 'cuenta' ? (
                <div className="tot-fila">
                  <span>Dejás de deberle a {prov?.nombre ?? 'el proveedor'}</span>
                  <b className="num">{plata(c.totalCent)}</b>
                </div>
              ) : (
                <div className="tot-fila">
                  <span>Era una compra al contado</span>
                  <b className="num">sin deuda</b>
                </div>
              )}
            </div>

            <p className="sub" style={{ marginTop: 12 }}>
              El costo de estos productos vuelve al de la compra anterior, así que
              la ganancia que muestra la app puede cambiar. Las ventas ya hechas no
              se tocan: su costo quedó congelado cuando las hiciste.
            </p>

            {enRojo > 0 && (
              <Alerta tipo="warn" icono="i-alert"
                titulo={enRojo === 1 ? 'Un producto va a quedar en negativo' : `${enRojo} productos van a quedar en negativo`}
                texto="Es porque ya vendiste parte de esta mercadería. Anular igual es correcto: el número en rojo te está avisando que hay algo mal cargado." />
            )}

            <button className="btn accent lg block" style={{ marginTop: 14, background: 'var(--bad)' }}
              onClick={() => anularIngreso(c.id)}>
              Sí, anular el ingreso
            </button>
            <button className="btn outline block" style={{ marginTop: 8 }}
              onClick={() => setConfirmarAnular(null)}>
              No, dejarlo como está
            </button>
          </Hoja>
        );
      })()}

      {fichaCliente && (() => {
        const c = estado.clientes.find((x) => x.id === fichaCliente);
        if (!c) return null;
        const d = deudas.lista.find((x) => x.clienteId === c.id);
        const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const caballito = caballitoDeBatalla(estado, c.id);
        const ventasCliente = ventasDelCliente(estado, c.id);
        return (
          <Hoja alCerrar={() => setFichaCliente(null)}>
            <h3>{c.nombre}</h3>
            <p className="sub">
              {[c.zona, c.diaVisita !== undefined ? `lo visitás los ${DIAS[c.diaVisita]}` : null]
                .filter(Boolean).join(' · ') || 'Sin zona ni día cargados'}
            </p>

            <div className="kpi">
              <div>
                <b>{d ? plata(d.saldoCent) : '$ 0'}</b>
                <span>{d ? `te debe hace ${d.dias} días` : 'está al día'}</span>
              </div>
              <div>
                <b style={{ fontSize: c.contacto ? 18 : undefined }}>{c.contacto ?? '—'}</b>
                <span>contacto</span>
              </div>
            </div>

            {/*
              * El caballito de batalla: lo que ese comercio siempre se lleva.
              *
              * Se cuenta por unidades y no por plata — es lo que más se lleva,
              * no lo más caro—, y las ventas anuladas no entran. Sirve parado en
              * la vereda: qué ofrecerle primero, y darse cuenta de que hoy no se
              * lo está llevando.
              */}
            <div className="caballito">
              <span className="caballito-ico" aria-hidden="true">⭐</span>
              {caballito ? (
                <span>
                  <b>Caballito de batalla</b>
                  <span>
                    {caballito.codigo && <span className="cod">{caballito.codigo}</span>}
                    {caballito.nombre}
                    {' · '}
                    {caballito.unidades === 1 ? '1 u. comprada' : `${caballito.unidades} u. compradas`}
                  </span>
                </span>
              ) : (
                <span>
                  <b>Sin producto destacado aún</b>
                  <span>Cuando le vendas, acá va a salir lo que más se lleva.</span>
                </span>
              )}
            </div>

            {/*
              * Sus últimas ventas, con el comprobante adentro.
              *
              * Hasta ahora la única puerta al detalle de una venta era "Lo que
              * vendiste hoy": la venta de ayer no se podía abrir, y el
              * "mandámelo de nuevo" de dos días después no tenía respuesta.
              * Desde acá se llega a cualquiera.
              */}
            {ventasCliente.length > 0 && (
              <>
                <p className="eyebrow" style={{ marginTop: 14 }}>
                  Sus últimas ventas · tocá para el comprobante
                </p>
                <div className="stack">
                  {ventasCliente.map((x) => (
                    <button className={`row ${x.anulada ? 'anulada' : ''}`} key={x.id}
                      onClick={() => { setFichaCliente(null); setFichaVenta(x.id); }}>
                      <span className="thumb"><Icono id="i-cart" /></span>
                      <span className="row-main">
                        <b>{x.cuando}</b>
                        <span>{x.unidades} u.{x.anulada ? ' · anulada' : ''}</span>
                      </span>
                      <span className="row-end">
                        <b>{plata(x.totalCent)}</b>
                        <span>
                          {x.anulada ? 'anulada'
                            : x.debeCent > 0 ? `debe ${plata(x.debeCent)}` : 'cobrada'}
                        </span>
                      </span>
                      <Icono id="i-arrow" clase="ico-s ico-arrow" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {d && (
              <button className="btn lg block" style={{ marginTop: 14 }}
                onClick={() => { setFichaCliente(null); setHojaCobro(c.id); }}>
                Registrar un cobro
              </button>
            )}
            <button className="btn outline block" style={{ marginTop: 9 }}
              onClick={() => abrirEditarCliente(c.id)}>Corregir los datos</button>
            <button className="btn ghost block" style={{ marginTop: 6 }}
              onClick={() => setFichaCliente(null)}>Cerrar</button>
            <button className="btn ghost block" style={{ marginTop: 6, color: 'var(--bad)' }}
              onClick={() => cambiarActivoCliente(c.id, false)}>
              Ya no le vendo más
            </button>
          </Hoja>
        );
      })()}

      {hojaProdForm && (() => {
        const editando = hojaProdForm.modo === 'editar';
        const repetido = productoParecido(estado, campo('nombre'), campo('variante'));
        const duplicado = repetido && (!editando || repetido.id !== hojaProdForm.id);
        // Se avisa mientras escribe, no al guardar: corregir un código con el
        // formulario abierto es un segundo; descubrirlo después de guardar, no.
        const codigoRepetido = productoConCodigo(
          estado, campo('codigo'), editando ? hojaProdForm.id : undefined,
        );
        const precioCent = aCentavos(campo('precio'));
        const costoCent = aCentavos(campo('costo'));
        const proveedores = estado.proveedores.filter((p) => p.activo);
        return (
          <Hoja alCerrar={() => setHojaProdForm(null)}>
            <h3>{editando ? 'Datos del producto' : 'Producto nuevo'}</h3>
            <p className="sub">
              {editando
                ? 'El precio y el stock no se tocan acá: cada uno tiene su propio camino.'
                : 'Lo mínimo es el nombre y a cuánto lo vendés.'}
            </p>

            {/*
              * El código va PRIMERO porque es como él identifica el producto en
              * su planilla: cuando busca algo, busca el número, no el nombre.
              */}
            <label className="campo">
              <span>Código <em>· opcional</em></span>
              <input className="texto num" inputMode="numeric" value={campo('codigo')}
                placeholder="101"
                onChange={(ev: ChangeEvent<HTMLInputElement>) =>
                  // Solo dígitos y hasta 10: es lo mismo que valida la base, así
                  // que el error se evita al escribir en vez de avisarse al guardar.
                  setCampo('codigo', ev.target.value.replace(/[^0-9]/g, '').slice(0, 10))} />
            </label>

            {codigoRepetido && (
              <div style={{ marginBottom: 14 }}>
                <Alerta tipo="bad" icono="i-alert"
                  titulo={`El código ${campo('codigo')} ya lo usa "${codigoRepetido.nombre}"`}
                  texto="Dos productos con el mismo código dejan de poder cruzarse con la planilla." />
              </div>
            )}

            <label className="campo">
              <span>¿Qué es?</span>
              <input className="texto" autoFocus value={campo('nombre')}
                placeholder="Collar de nylon reforzado"
                onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('nombre', ev.target.value)} />
            </label>

            <label className="campo">
              <span>Talle, color o presentación <em>· opcional</em></span>
              <input className="texto" value={campo('variante')} placeholder="Talle 2 · surtido"
                onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('variante', ev.target.value)} />
            </label>

            <label className="campo">
              <span>Rubro <em>· opcional</em></span>
              <input className="texto" value={campo('categoria')}
                placeholder="Collares, juguetes, higiene"
                onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('categoria', ev.target.value)} />
            </label>

            <label className="campo">
              <span>Descripción <em>· opcional</em></span>
              <input className="texto" value={campo('descripcion')}
                placeholder="Nylon reforzado con costura doble"
                onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('descripcion', ev.target.value)} />
            </label>

            {duplicado && (
              <div style={{ marginBottom: 14 }}>
                <Alerta tipo="warn" icono="i-alert"
                  titulo="Ya tenés un producto igual"
                  texto="Mismo nombre y misma presentación. Fijate que no lo estés cargando dos veces." />
              </div>
            )}

            {!editando && (
              <label className="campo">
                <span>¿A cuánto lo vendés?</span>
                <input className="amount-in num" inputMode="decimal" value={campo('precio')}
                  placeholder="3200"
                  onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('precio', ev.target.value)} />
              </label>
            )}

            <div className="campo">
              <span>¿Quién te lo vende? <em>· opcional</em></span>
              <div className="chips">
                {proveedores.map((p) => (
                  <button key={p.id} className="chip" aria-pressed={campo('proveedor') === p.id}
                    onClick={() => setCampo('proveedor', campo('proveedor') === p.id ? '' : p.id)}>
                    {p.nombre}
                  </button>
                ))}
              </div>
            </div>

            {!editando && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="eyebrow">¿Ya tenés unidades en tu casa?</div>
                <p style={{ margin: '4px 0 10px', fontSize: 12.8, color: 'var(--ink-2)' }}>
                  Si lo dejás vacío, el producto queda cargado igual. El costo entra solo cuando
                  te llegue mercadería — hasta entonces la ganancia se ve más alta de lo real.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <label className="campo" style={{ flex: 1, marginBottom: 0 }}>
                    <span>Cuántas</span>
                    <input className="texto num" inputMode="numeric" value={campo('cantidad')}
                      placeholder="0"
                      onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('cantidad', ev.target.value)} />
                  </label>
                  <label className="campo" style={{ flex: 1, marginBottom: 0 }}>
                    <span>Te cuesta c/u</span>
                    <input className="texto num" inputMode="decimal" value={campo('costo')}
                      placeholder="0"
                      onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('costo', ev.target.value)} />
                  </label>
                </div>
                {precioCent > 0 && costoCent > 0 && costoCent < precioCent && (
                  <p style={{ margin: '10px 0 0', fontSize: 12.8, color: 'var(--ok)' }}>
                    Te quedan limpios {plata(precioCent - costoCent)} por unidad.
                  </p>
                )}
                {precioCent > 0 && costoCent >= precioCent && (
                  <p style={{ margin: '10px 0 0', fontSize: 12.8, color: 'var(--bad)' }}>
                    Ojo: te cuesta más de lo que lo vendés. Perdés {plata(costoCent - precioCent)} por unidad.
                  </p>
                )}
                {Number(campo('cantidad')) > 0 && costoCent <= 0 && (
                  <p style={{ margin: '10px 0 0', fontSize: 12.8, color: 'var(--ink-3)' }}>
                    Falta el costo: sin eso no se puede cargar el stock inicial.
                  </p>
                )}
              </div>
            )}

            {errorHoja && (
              <div style={{ marginBottom: 14 }}>
                <Alerta tipo="bad" icono="i-alert" titulo="No se pudo guardar" texto={errorHoja} />
              </div>
            )}

            <button className="btn lg block"
              disabled={!campo('nombre').trim() || (!editando && precioCent <= 0) || !!codigoRepetido}
              onClick={guardando(guardarProducto)}>
              {editando ? 'Guardar los cambios' : 'Guardar producto'}
            </button>
            <button className="btn outline block" style={{ marginTop: 9 }}
              onClick={() => setHojaProdForm(null)}>Cancelar</button>
          </Hoja>
        );
      })()}

      {fichaProv && (() => {
        const p = estado.proveedores.find((x) => x.id === fichaProv);
        if (!p) return null;
        // Sin las anuladas: una compra anulada no genera deuda.
        const debo = estado.compras
          .filter((c) => c.proveedorId === p.id && c.condicionPago === 'cuenta' && !c.anuladaEn)
          .reduce((a, c) => a + c.totalCent, 0);
        // Los últimos ingresos de este proveedor, para poder entrar a anularlos.
        const ingresos = vistaIngresos(estado, estado.compras.filter((c) => c.proveedorId === p.id))
          .slice(0, 6);
        const productos = productosDelProveedor(estado, p.id);
        return (
          <Hoja alCerrar={() => setFichaProv(null)}>
            <h3>{p.nombre}</h3>
            <p className="sub">{p.rubro ?? 'Sin rubro cargado'}</p>
            <div className="kpi">
              <div><b>{plata(debo)}</b><span>le debés</span></div>
              <div>
                <b style={{ fontSize: p.contacto ? 18 : undefined }}>{p.contacto ?? '—'}</b>
                <span>contacto</span>
              </div>
            </div>
            {/*
              * Lo que le compra, con el código de su planilla y el costo de hoy.
              * El costo sale del mismo lugar del que sale la ganancia, así que
              * si anuló un ingreso, acá se ve el costo que volvió a quedar.
              */}
            {productos.length > 0 && (
              <>
                <p className="eyebrow" style={{ marginTop: 14 }}>
                  Lo que le comprás · {productos.length === 1 ? '1 producto' : `${productos.length} productos`}
                </p>
                <div className="stack">
                  {productos.map((x) => (
                    <button className="row" key={x.id}
                      onClick={() => { setFichaProv(null); acc.verProducto(x); }}>
                      <span className={`thumb ${claseCategoria(x.categoria)}`}><Icono id="i-box" /></span>
                      <span className="row-main">
                        <b>
                          {x.codigo && <span className="cod">{x.codigo}</span>}
                          {x.nombre}
                        </b>
                        <span>{x.enStock} en stock</span>
                      </span>
                      <span className="row-end">
                        <b>{x.costoCent !== null ? plata(x.costoCent) : '—'}</b>
                        <span>te cuesta</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {ingresos.length > 0 && (
              <>
                <p className="eyebrow" style={{ marginTop: 14 }}>Lo último que te trajo</p>
                <div className="stack">
                  {ingresos.map((x) => (
                    <button className={`row ${x.anulada ? 'anulada' : ''}`} key={x.id}
                      onClick={() => { setFichaProv(null); setFichaIngreso(x.id); }}>
                      <span className="row-main">
                        <b>{fechaCorta(estado.compras.find((c) => c.id === x.id)!.fecha)}</b>
                        <span>{x.unidades} u. · {x.anulada ? 'anulado' : x.condicionPago === 'cuenta' ? 'se lo debés' : 'pagado'}</span>
                      </span>
                      <span className="row-end"><b>{plata(x.totalCent)}</b></span>
                      <Icono id="i-arrow" clase="ico-s ico-arrow" />
                    </button>
                  ))}
                </div>
              </>
            )}

            <button className="btn lg block" style={{ marginTop: 14 }}
              onClick={() => { setFichaProv(null); irA('ingreso'); }}>
              Cargar mercadería de él
            </button>
            <button className="btn outline block" style={{ marginTop: 9 }}
              onClick={() => abrirEditarProveedor(p.id)}>Corregir los datos</button>
            <button className="btn ghost block" style={{ marginTop: 6 }}
              onClick={() => setFichaProv(null)}>Cerrar</button>
            <button className="btn ghost block" style={{ marginTop: 6, color: 'var(--bad)' }}
              onClick={() => cambiarActivoProveedor(p.id, false)}>
              Ya no le compro más
            </button>
          </Hoja>
        );
      })()}

      {hojaProv && (
        <Hoja alCerrar={() => setHojaProv(null)}>
          <h3>{hojaProv.modo === 'editar' ? 'Datos del proveedor' : 'Proveedor nuevo'}</h3>
          <p className="sub">Con el nombre alcanza.</p>

          <label className="campo">
            <span>¿Cómo se llama?</span>
            <input className="texto" autoFocus value={campo('nombre')}
              placeholder="Distribuidora Canina"
              onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('nombre', ev.target.value)} />
          </label>

          <label className="campo">
            <span>Ubicación <em>· opcional</em></span>
            <input className="texto" value={campo('zona')} placeholder="Once"
              onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('zona', ev.target.value)} />
          </label>

          <label className="campo">
            <span>Rubro <em>· opcional</em></span>
            <input className="texto" value={campo('rubro')} placeholder="Collares, correas y arneses"
              onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('rubro', ev.target.value)} />
          </label>

          <label className="campo">
            <span>Teléfono o contacto <em>· opcional</em></span>
            <input className="texto" inputMode="tel" value={campo('contacto')}
              placeholder="11 5555-4444"
              onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('contacto', ev.target.value)} />
          </label>

          {errorHoja && (
            <div style={{ marginBottom: 14 }}>
              <Alerta tipo="bad" icono="i-alert" titulo="No se pudo guardar" texto={errorHoja} />
            </div>
          )}

          <button className="btn lg block" disabled={!campo('nombre').trim()} onClick={guardando(guardarProveedor)}>
            {hojaProv.modo === 'editar' ? 'Guardar los cambios' : 'Guardar proveedor'}
          </button>
          <button className="btn outline block" style={{ marginTop: 9 }}
            onClick={() => setHojaProv(null)}>Cancelar</button>
        </Hoja>
      )}

      {paso !== null && RECORRIDO[paso] && (
        <Coach
          paso={paso} total={RECORRIDO.length}
          titulo={RECORRIDO[paso].titulo} texto={RECORRIDO[paso].texto}
          alSiguiente={() => irAlPaso(paso + 1)}
          alSalir={() => terminarRecorrido()} />
      )}

      {hojaCuenta && (
        <Hoja alCerrar={() => setHojaCuenta(false)}>
          <h3>Mi cuenta</h3>
          {sesion ? (
            <>
              <p className="sub">Entraste como <b>{sesion.email}</b>.</p>
              <Alerta tipo="ok" icono="i-cloud" titulo="Tus datos se guardan en el servidor"
                texto="Los vas a ver igual desde otro teléfono, y no se pierden si cambiás de celular." />
              {/*
                * La app ya baja sola al abrir. Este botón es para el caso en que
                * cargó algo desde otro aparato y lo quiere ver acá sin cerrar y
                * volver a abrir. No pisa nada que él haya hecho: lo que está en
                * la cola gana siempre (ver `unir` en descarga.ts).
                */}
              <button className="btn outline block" style={{ marginTop: 14 }}
                onClick={() => { setHojaCuenta(false); setIntento((n) => n + 1); }}>
                Traer los datos del servidor
              </button>
              <button className="btn outline block" style={{ marginTop: 9 }}
                onClick={() => {
                  setHojaCuenta(false); setHojaUsuarios(true);
                  setF({}); void cargarAutorizados();
                }}>
                Quién puede entrar
              </button>
              <button className="btn outline block" style={{ marginTop: 9 }}
                onClick={() => { setHojaCuenta(false); acc.salir(); }}>
                Salir de esta cuenta
              </button>
            </>
          ) : hayBackend() ? (
            <>
              <p className="sub">Todavía no entraste con una cuenta.</p>
              <button className="btn lg block" onClick={() => { setHojaCuenta(false); setAcceso('registro'); }}>
                Crear mi cuenta
              </button>
              <button className="btn outline block" style={{ marginTop: 9 }}
                onClick={() => { setHojaCuenta(false); setAcceso('entrar'); }}>
                Ya tengo cuenta, entrar
              </button>
            </>
          ) : (
            <>
              <p className="sub">Estás usando la app sin cuenta.</p>
              <Alerta tipo="warn" icono="i-phone" titulo="Todo se guarda en este teléfono"
                texto="Funciona perfecto, pero los datos viven solo acá: no los vas a ver desde otro celular, y si borrás los datos del navegador se pierden." />
              <p style={{ fontSize: 12.8, color: 'var(--ink-3)', lineHeight: 1.5, margin: '12px 0 0' }}>
                Falta conectar el servidor. Es un paso de configuración, no algo que se arregle
                desde acá: ver <b>docs/donde-se-hacen-los-cambios.md</b>.
              </p>
              <button className="btn ghost block" style={{ marginTop: 14 }}
                onClick={() => setHojaCuenta(false)}>Entendido</button>
            </>
          )}
        </Hoja>
      )}

      {hojaUsuarios && (
        <Hoja alCerrar={() => setHojaUsuarios(false)}>
          <h3>Quién puede entrar</h3>
          <p className="sub">
            Escribí el mail de quien quieras que use la app. Cuando esa persona se
            registre con ese mail, entra sola. Nadie más puede entrar.
          </p>

          <label className="campo">
            <span>Mail de la persona</span>
            <input className="texto" type="email" inputMode="email" autoComplete="off"
              value={campo('mailNuevo')} placeholder="alguien@gmail.com"
              onChange={(ev: ChangeEvent<HTMLInputElement>) => setCampo('mailNuevo', ev.target.value)} />
          </label>

          {/*
            * El rol no es un detalle administrativo: es quién puede seguir
            * invitando gente. Si todos entraran como "vendedor", el único que
            * podría sumar a alguien sería quien creó la cuenta al principio, y el
            * dueño del negocio quedaría dependiendo de él para cada empleado.
            */}
          <div className="campo">
            <span>¿Qué va a poder hacer?</span>
            <div className="chips">
              <button type="button" className={`chip ${campo('rolNuevo') !== 'dueno' ? 'on' : ''}`}
                aria-pressed={campo('rolNuevo') !== 'dueno'}
                onClick={() => setCampo('rolNuevo', 'vendedor')}>
                Cargar y ver todo
              </button>
              <button type="button" className={`chip ${campo('rolNuevo') === 'dueno' ? 'on' : ''}`}
                aria-pressed={campo('rolNuevo') === 'dueno'}
                onClick={() => setCampo('rolNuevo', 'dueno')}>
                Dueño · también invita
              </button>
            </div>
          </div>

          <button className="btn lg block"
            disabled={!campo('mailNuevo').includes('@')}
            onClick={() => void agregarAutorizado(
              campo('mailNuevo'), campo('rolNuevo') === 'dueno' ? 'dueno' : 'vendedor',
            )}>
            Darle permiso
          </button>

          {errorUsuarios && (
            <div style={{ marginTop: 14 }}>
              <Alerta tipo="bad" icono="i-alert" titulo="No se pudo" texto={errorUsuarios} />
            </div>
          )}

          <p className="eyebrow" style={{ marginTop: 18 }}>Con permiso hoy</p>
          <div className="stack">
            {autorizados === null && <p className="sub">Buscando…</p>}
            {autorizados?.length === 0 && (
              <Alerta tipo="ok" icono="i-user" titulo="Todavía no invitaste a nadie"
                texto="Por ahora entrás solo vos. Agregá un mail arriba para sumar a alguien." />
            )}
            {autorizados?.map((u) => (
              <div className="row" key={u.email}>
                <span className="thumb"><Icono id="i-user" /></span>
                <span className="row-main">
                  <b>{u.email}</b>
                  <span>{u.rol === 'dueno' ? 'Dueño' : 'Puede cargar y ver todo'}
                    {u.usadoEn ? ' · ya entró' : ' · todavía no se registró'}</span>
                </span>
                {u.rol !== 'dueno' && (
                  <button className="alert-act" onClick={() => void sacarAutorizado(u.email)}>
                    Quitar
                  </button>
                )}
              </div>
            ))}
          </div>

          {/*
            * Se dice explícitamente qué NO hace quitar el permiso. Si alguien
            * cree que borra las ventas de esa persona, va a tener un susto —o,
            * peor, va a contar con un borrado que nunca ocurrió.
            */}
          <p className="ingreso-pie" style={{ marginTop: 16, color: 'var(--ink-3)' }}>
            Quitarle el permiso a alguien no borra nada de lo que cargó. Sus ventas y
            sus cobros siguen siendo parte de tu historial.
          </p>

          <button className="btn outline block" style={{ marginTop: 14 }}
            onClick={() => setHojaUsuarios(false)}>Listo</button>
        </Hoja>
      )}

      {exito && <Exito datos={exito} alCerrar={() => setExito(null)} />}
    </div>
  );
};
