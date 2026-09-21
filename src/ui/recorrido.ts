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

export interface PasoRecorrido {
  ruta: Ruta;
  destaca?: string;
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
    texto: 'Arriba, siempre a la vista: cuánta plata cobraste hoy y cuánta tenés en la calle. Son los dos números que importan.',
  },
  {
    ruta: 'hoy', destaca: 'misiones',
    titulo: 'Tu día en 2 pasos',
    texto: 'Hacer una venta y cobrar una deuda. En vez de explicarte cómo se usa, la app te va marcando qué falta.',
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
    texto: 'Tus comercios con la deuda al lado. Si uno te debe hace 40 días, lo ves antes de venderle otra vez.',
  },
  {
    ruta: 'vender', destaca: 'cliente-nuevo',
    titulo: 'Si es un comercio nuevo',
    texto: 'Lo cargás parado en la vereda, con el nombre alcanza, y seguís con la venta sin perder el hilo.',
  },
  {
    ruta: 'vender', destaca: 'lista-productos', ventaEnCurso: true,
    titulo: 'Segundo: qué se lleva',
    texto: 'Todo lo que tengas con precio, con el stock al lado. Tocás más o menos y el total se arma solo. No hay que escribir precios.',
  },
  {
    ruta: 'vender', ventaEnCurso: true,
    titulo: 'Tercero: cómo te paga',
    texto: 'Tres opciones: te paga el total, te paga una parte, o te lo debe todo. Si te da una parte, escribís cuánto y el resto va solo a su cuenta.',
  },

  // --- el comprobante -----------------------------------------------------
  {
    ruta: 'hoy', destaca: 'ventas-hoy',
    titulo: 'El comprobante, cuando te lo pidan',
    texto: 'Tocá cualquier venta y se abre con todo el detalle y el botón para mandarle el comprobante por WhatsApp. Sirve el mismo día y dos semanas después.',
  },

  // --- cobrar -------------------------------------------------------------
  {
    ruta: 'deudas', destaca: 'lista-deudas',
    titulo: 'Quién te debe, del más viejo al más nuevo',
    texto: 'Ese es el orden en el que conviene salir a cobrar. Tocás un comercio y anotás lo que te dio, sea todo o una parte.',
  },

  // --- mercadería ---------------------------------------------------------
  {
    ruta: 'hoy', destaca: 'me-llego',
    titulo: 'Cuando te llega mercadería',
    texto: 'Elegís el proveedor, marcás cuántas unidades entraron y con qué costo. El stock sube solo, y si le pagás después queda anotado lo que vos le debés.',
  },
  {
    ruta: 'hoy', destaca: 'ingresos-hoy',
    titulo: 'Lo que entró hoy, para revisarlo',
    texto: 'Un cero de más al cargar una entrada es el error más fácil de cometer. Acá lo ves el mismo día y lo podés abrir para controlarlo.',
  },

  // --- corregir -----------------------------------------------------------
  {
    ruta: 'hoy', destaca: 'anulado-mes',
    titulo: 'Si algo lo anotaste mal, se anula',
    texto: 'Desde el detalle de una venta o de una entrada. Vuelve el stock, la deuda y la plata a como estaban. No se borra nada: queda acá a la vista hasta que termine el mes.',
  },

  // --- lo tuyo ------------------------------------------------------------
  {
    ruta: 'cosas', destaca: 'hub',
    titulo: 'Mis cosas: todo lo tuyo',
    texto: 'Tus productos, tus comercios y tus proveedores. De acá entrás a cargar, corregir o mirar cualquiera de los tres.',
  },
  {
    ruta: 'productos', destaca: 'producto-nuevo',
    titulo: 'Tus productos los cargás vos',
    texto: 'Nombre y a cuánto lo vendés, nada más. Si ya tenés unidades en casa las cargás ahí con lo que te costaron, y la app te dice cuánto te queda limpio.',
  },
  {
    ruta: 'productos', destaca: 'lista-productos-todos',
    titulo: 'Y ves la ganancia de cada uno',
    texto: 'Tocás un producto y ves qué te cuesta, a cuánto lo vendés y cuánto te queda por unidad. Desde ahí le cambiás el precio: el anterior queda guardado con su fecha.',
  },
  {
    ruta: 'productos', destaca: 'buscador',
    titulo: 'Buscar y ordenar',
    texto: 'Escribí un pedazo del nombre o el código y la lista se achica sola. También la podés ordenar por precio, por código o por rubro.',
  },
  {
    ruta: 'clientes', destaca: 'lista-clientes-todos',
    titulo: 'La ficha de cada comercio',
    texto: 'Lo que te debe, cuándo lo visitás, su teléfono, sus últimas ventas, y el producto que más se lleva. Si dejás de venderle se archiva, pero su historial no se borra nunca.',
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
    texto: 'No las ventas: la ganancia, ya descontado lo que te costó la mercadería. Es el número que nadie sabe sin ponerse a hacer cuentas.',
  },
  {
    ruta: 'hoy',
    titulo: 'Funciona sin señal',
    texto: 'Parado en la vereda, sin datos, la app abre y guarda igual. Cuando volvés a tener señal se sube todo solo. Nunca vas a perder una venta por no tener línea.',
  },
];
