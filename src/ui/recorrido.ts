/**
 * El recorrido guiado que se le muestra al cliente.
 *
 * REESCRITO DESDE CERO el 21/09. El anterior venía del boceto de presentación y
 * había quedado desfasado de la app de verdad: hablaba de "tres pasos" cuando
 * hoy son dos, no mencionaba el cobro parcial, el comprobante, la anulación ni
 * la ficha del comercio, y describía funciones que ya no existen. Un recorrido
 * que explica una app que no es la que el usuario tiene adelante es peor que no
 * tener recorrido: lo manda a buscar cosas que no están.
 *
 * Reglas que se siguieron al escribirlo, para cuando haya que tocarlo:
 *
 *  1. Un paso = una función que EXISTE hoy en la app. Si una función se saca,
 *     se saca su paso en el mismo lote.
 *  2. El orden es el del día de trabajo, no el del menú: vender, cobrar, entrar
 *     mercadería, corregir, y recién al final lo de fondo (números, sin señal).
 *  3. El texto dice qué hace la app y para qué le sirve, en su idioma. Nada de
 *     "el sistema permite gestionar".
 *  4. Lo que pasa adentro de una hoja o un modal se CUENTA en el texto del paso
 *     de la pantalla que lo abre: el recorrido navega entre pantallas, no puede
 *     resaltar algo que todavía no está dibujado.
 *  5. **REVISAR ESTE ARCHIVO ES PARTE DE CADA CAMBIO.** Acordado con Maclarens el
 *     01/10. Si un lote agrega, saca o cambia una función que el cliente usa, en
 *     ese mismo lote se toca el recorrido — no "más adelante". El recorrido es la
 *     única documentación que el cliente lee, y es la que más fácil se despega
 *     porque nadie la abre trabajando. Ya pasó una vez y hubo que reescribirlo
 *     entero. El test `cada pantalla está en el recorrido o exenta a propósito`
 *     obliga a tomar la decisión cuando se agrega una pantalla; el resto —una
 *     función nueva adentro de una pantalla que ya existe— no lo puede atrapar
 *     ningún test, y por eso está escrito acá.
 *
 * Es data, no código: agregar un paso es agregar una línea acá.
 *
 * `destaca` es el valor de un atributo `data-tour` puesto en la pantalla. Si el
 * elemento no está en ese momento —porque esa lista todavía está vacía—, el paso
 * igual se muestra: el recorrido nunca se traba por un elemento que no aparece.
 * Hay un test que verifica que cada `destaca` de acá exista de verdad en alguna
 * pantalla, así un paso no puede quedar apuntando a la nada.
 */

import type { Ruta } from './pantallas.tsx';

/**
 * Los lugares de la app que el recorrido puede señalar.
 *
 * Es una lista cerrada, y eso es todo el punto: el paso declara `destaca` con
 * uno de estos nombres y la pantalla marca el elemento con el MISMO nombre, los
 * dos tipados contra esta lista. Si alguien saca una marca de una pantalla y se
 * olvida del paso, o escribe mal el nombre, no compila.
 *
 * Antes esto lo controlaba un test que leía los archivos de las pantallas con
 * `node:fs`. Funcionaba, pero metía Node adentro del chequeo de tipos de una app
 * que corre en el navegador, y eso fue exactamente lo que rompió el deploy del
 * 21/09: `tsc` de Vercel no tiene los tipos de Node. Un tipo hace el mismo
 * trabajo, antes y sin dependencias.
 */
export const ANCLAS = [
  'resumen', 'misiones', 'alerta', 'vender-ya', 'me-llego', 'cargar-gasto',
  'ultimas-actividades', 'filtros-actividad',
  'lista-clientes', 'cliente-nuevo', 'lista-productos', 'buscador-venta',
  'lista-deudas', 'hub',
  'producto-nuevo', 'lista-productos-todos', 'buscador',
  'lista-clientes-todos', 'lista-proveedores-todos', 'capital', 'salidas',
  'ganancia', 'reportes',
] as const;

export type Ancla = (typeof ANCLAS)[number];

/**
 * Marca un elemento de una pantalla como destino de un paso.
 *
 * Se usa esparcido en el JSX: `<div {...tour('ventas-hoy')}>`. Sale un atributo
 * `data-tour` común y corriente, igual que antes; lo que cambia es que el
 * nombre ya no es un texto suelto que nadie revisa.
 */
export const tour = (ancla: Ancla): { 'data-tour': Ancla } => ({ 'data-tour': ancla });

/**
 * Pantallas que NO tienen un paso propio, y por qué.
 *
 * Las dos son formularios a los que se entra desde un botón del inicio, y ese
 * botón SÍ tiene su paso. Abrirlas con el recorrido encendido mostraría un
 * formulario vacío con una tarjeta encima tapándolo: se explica mejor señalando
 * el botón y contando en el texto qué pasa cuando lo toca.
 *
 * Esta lista no es decorativa: hay un test que exige que cada pantalla de la app
 * esté en el recorrido O acá. Agregar una pantalla nueva y no decidir qué hacer
 * con ella pone el test en rojo, que es justamente lo que tiene que pasar.
 */
export const SIN_PASO_PROPIO: Ruta[] = ['gasto', 'ingreso'];

export interface PasoRecorrido {
  ruta: Ruta;
  destaca?: Ancla;
  titulo: string;
  texto: string;
  /** Deja la venta empezada en el paso del pedido, para mostrar la lista real. */
  ventaEnCurso?: boolean;
}

export const RECORRIDO: PasoRecorrido[] = [
  // --- el inicio ----------------------------------------------------------
  {
    ruta: 'hoy', destaca: 'resumen',
    titulo: 'Todo arranca acá',
    texto: 'Arriba, siempre a la vista: cuánta plata cobraste hoy y cuánto saldo tenés en la calle. Son los dos números que importan.',
  },
  {
    ruta: 'hoy', destaca: 'misiones',
    titulo: 'Tu día en 2 pasos',
    texto: 'Hacer una venta y cobrar un saldo. En vez de explicarte cómo se usa, la app te va marcando qué falta.',
  },

  // --- vender -------------------------------------------------------------
  {
    ruta: 'hoy', destaca: 'vender-ya',
    titulo: 'El botón más grande es el que más usás',
    texto: 'Vender está siempre a un toque, desde cualquier pantalla.',
  },
  {
    ruta: 'vender', destaca: 'lista-clientes',
    titulo: 'Primero: a quién le vendés',
    texto: 'Tus comercios con el saldo al lado. Si uno tiene saldo de hace 40 días, lo ves antes de venderle otra vez.',
  },
  {
    ruta: 'vender', destaca: 'cliente-nuevo',
    titulo: 'Si es un comercio nuevo',
    texto: 'Lo cargás parado en la vereda, con el nombre alcanza, y seguís con la venta sin perder el hilo.',
  },
  {
    ruta: 'vender', destaca: 'lista-productos', ventaEnCurso: true,
    titulo: 'Segundo: qué se lleva',
    texto: 'Todo lo que tengas con precio, con el stock al lado. Tocás más o menos, o escribís la cantidad directamente, y el total se arma solo. No hay que escribir precios.',
  },
  {
    ruta: 'vender', destaca: 'buscador-venta', ventaEnCurso: true,
    titulo: 'Con muchos productos, buscalo',
    texto: 'Escribí un pedazo del nombre o el código y la lista se achica sola. Lo que ya cargaste NO se pierde: podés buscar otra cosa, agregarla, y los dos siguen en el pedido.',
  },
  {
    ruta: 'vender', ventaEnCurso: true,
    titulo: 'Y si te vas de la pantalla, tampoco',
    texto: 'El pedido a medio armar queda guardado en el teléfono. Podés ir a mirar un producto, atender a alguien, hasta cerrar la app: al volver a Vender está todo como lo dejaste.',
  },
  {
    ruta: 'vender', ventaEnCurso: true,
    titulo: 'Y por último: cómo te paga',
    texto: 'Tres opciones: te paga el total, te paga una parte, o queda todo como saldo. Si te da una parte, escribís cuánto y el resto va solo a su saldo.',
  },

  // --- lo que pasó, y el comprobante --------------------------------------
  {
    ruta: 'hoy', destaca: 'ultimas-actividades',
    titulo: 'Lo último que hiciste, todo junto',
    texto: 'Ventas, cobros, entradas de mercadería, gastos y anulaciones, en el orden en que pasaron. Tocá cualquiera y se abre con el detalle y el botón para mandar el comprobante por WhatsApp.',
  },
  {
    ruta: 'actividad', destaca: 'filtros-actividad',
    titulo: 'Todo el historial, cuando necesitás buscar',
    texto: 'Entrás con "Consultar todas". Buscás por comercio o proveedor, y con las chapitas de arriba mirás solo las ventas, solo los cobros, solo los gastos, solo lo que entró o solo lo anulado.',
  },
  {
    ruta: 'actividad', destaca: 'filtros-actividad',
    titulo: 'Si lo anotaste mal, se corrige',
    texto: 'Desde el detalle de una venta o de una entrada. Si erraste la cantidad o el costo, "Corregir" lo arregla de una; si directamente no fue, "Anular" devuelve el stock, el saldo y la plata. No se borra nada: queda tachado en su día.',
  },

  // --- cobrar -------------------------------------------------------------
  {
    ruta: 'hoy', destaca: 'alerta',
    titulo: 'Y te avisa sin que preguntes',
    texto: 'Cuando un comercio se pasa de tiempo, el aviso aparece solo en el inicio, con el nombre, cuántos días hace y cuánto es. Si ahora no ves ninguno, es porque no hay ningún saldo viejo.',
  },
  {
    ruta: 'deudas', destaca: 'lista-deudas',
    titulo: 'El saldo de cada comercio, del más viejo al más nuevo',
    texto: 'Ese es el orden en el que conviene salir a cobrar. Tocás un comercio y anotás lo que te dio, sea todo o una parte. Y ahí mismo ves de qué ventas viene ese saldo, por si te lo pregunta.',
  },

  // --- mercadería y gastos ------------------------------------------------
  {
    ruta: 'hoy', destaca: 'me-llego',
    titulo: 'Cuando te llega mercadería',
    texto: 'Elegís el proveedor, marcás cuántas unidades entraron y con qué costo. El stock sube solo, y si le pagás después queda anotado lo que vos le debés.',
  },
  {
    ruta: 'hoy', destaca: 'cargar-gasto',
    titulo: 'La nafta, el flete, las bolsas',
    texto: 'Todo lo que pagás para que el negocio funcione se carga acá, en diez segundos: cuánto fue, de qué, y listo. Es lo que hace que la ganancia que ves sea la de verdad y no una cuenta de más.',
  },

  // --- lo tuyo ------------------------------------------------------------
  {
    ruta: 'cosas', destaca: 'hub',
    titulo: 'Mis cosas: todo lo tuyo',
    texto: 'Tus productos, tus comercios y tus proveedores. De acá entrás a cargar, corregir o mirar cualquiera de los tres.',
  },
  {
    ruta: 'productos', destaca: 'capital',
    titulo: 'Cuánta plata tenés parada',
    texto: 'Dos números arriba de tus productos: lo que te costó todo lo que tenés guardado, y lo que va a entrar si lo vendés entero. Si a alguno le falta el costo, te avisa: ese no suma.',
  },
  {
    ruta: 'productos', destaca: 'producto-nuevo',
    titulo: 'Tus productos los cargás vos',
    texto: 'Nombre y a cuánto lo vendés, nada más. Si ya tenés unidades en casa las cargás ahí con lo que te costaron, y la app te dice cuánto te queda limpio.',
  },
  {
    ruta: 'productos', destaca: 'lista-productos-todos',
    titulo: 'Y ves la ganancia de cada uno',
    texto: 'Tocás un producto y ves qué te cuesta, a cuánto lo vendés y cuánto te queda por unidad. Desde ahí le cambiás el precio —el anterior queda guardado con su fecha— y también podés corregir el costo si lo cargaste mal.',
  },
  {
    ruta: 'productos', destaca: 'buscador',
    titulo: 'Buscar y ordenar',
    texto: 'Escribí un pedazo del nombre o el código y la lista se achica sola. También la podés ordenar por precio, por código o por rubro.',
  },
  {
    ruta: 'productos', destaca: 'salidas',
    titulo: 'Mandarles la lista, o abrirla en Excel',
    texto: 'Dos botones, y llevan cosas distintas. La LISTA es lo que le mandás al comercio: código, nombre y precio, nada más. El EXCEL es para vos: ahí sí va el costo y el stock, y se baja a tu computadora.',
  },
  {
    ruta: 'clientes', destaca: 'lista-clientes-todos',
    titulo: 'La ficha de cada comercio',
    texto: 'Su saldo, cuándo lo visitás, su teléfono, sus últimas ventas, y el producto que más se lleva. Si dejás de venderle se archiva, pero su historial no se borra nunca.',
  },
  {
    ruta: 'proveedores', destaca: 'lista-proveedores-todos',
    titulo: 'Y la de cada proveedor',
    texto: 'Cuánto le debés y todo lo que le comprás, con el código, lo que te queda en stock y a cuánto te sale hoy.',
  },

  // --- el fondo -----------------------------------------------------------
  {
    ruta: 'numeros', destaca: 'ganancia',
    titulo: 'Lo que te quedó de verdad',
    texto: 'No las ventas: la ganancia, ya descontado lo que te costó la mercadería Y los gastos del negocio. Arriba elegís qué mirar: este mes, el mes pasado, o las fechas que vos quieras. Es el número que nadie sabe sin ponerse a hacer cuentas.',
  },
  {
    ruta: 'numeros', destaca: 'reportes',
    titulo: 'Y la plata que se movió',
    texto: 'La caja es otra cosa que la ganancia, y las dos importan: una venta a cuenta te deja ganancia y no te pone un peso en el bolsillo. Acá abajo abrís cada cosa en detalle —la caja, los productos, los gastos, los saldos a cobrar y el stock— y cualquiera se baja a Excel.',
  },
  {
    ruta: 'hoy',
    titulo: 'Funciona sin señal',
    texto: 'Parado en la vereda, sin datos, la app abre y guarda igual. Cuando volvés a tener señal se sube todo solo. Nunca vas a perder una venta por no tener línea.',
  },
];
