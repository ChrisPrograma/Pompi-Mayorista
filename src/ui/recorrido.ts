/**
 * El recorrido guiado que se le muestra al cliente.
 *
 * Existía solo en el boceto de presentación (`docs/boceto-presentacion.html`),
 * que es una maqueta y no el sistema. Al pasar la app a React se había quedado
 * afuera. Esto lo trae a la app de verdad, con las funciones que se agregaron
 * después: alta de productos, cambio de precio y las fichas editables.
 *
 * Es data, no código: agregar un paso es agregar una línea acá.
 *
 * `destaca` es el valor de un atributo `data-tour` puesto en la pantalla. Si el
 * elemento no está en ese momento, el paso igual se muestra: el recorrido nunca
 * se traba por un elemento que no aparece.
 */

import type { Ruta } from './pantallas.tsx';

export interface PasoRecorrido {
  ruta: Ruta;
  destaca?: string;
  titulo: string;
  texto: string;
  /** Deja la venta empezada en el paso 2, para mostrar la carga del pedido. */
  ventaEnCurso?: boolean;
}

export const RECORRIDO: PasoRecorrido[] = [
  {
    ruta: 'hoy', destaca: 'resumen',
    titulo: 'Todo arranca acá',
    texto: 'Una sola pantalla te dice cuánta plata entró hoy y cuánta está en la calle. Nada de menús escondidos.',
  },
  {
    ruta: 'hoy', destaca: 'alerta',
    titulo: 'Te avisa antes de que duela',
    texto: 'El sistema mira solo las deudas viejas y te las pone adelante. No tenés que acordarte de nada.',
  },
  {
    ruta: 'hoy', destaca: 'misiones',
    titulo: 'Tres pasos, no un manual',
    texto: 'En vez de explicarte cómo se usa, te va marcando qué hacer. Cuando terminás los tres, el día está cerrado.',
  },
  {
    ruta: 'hoy', destaca: 'vender-ya',
    titulo: 'El botón más grande es el que más usás',
    texto: 'Vender está siempre a un toque, desde cualquier pantalla.',
  },
  {
    ruta: 'vender', destaca: 'lista-clientes',
    titulo: 'Primero: a quién le vendés',
    texto: 'Tus comercios, con la deuda a la vista. Si uno te debe hace 40 días, lo ves antes de venderle.',
  },
  {
    ruta: 'vender', destaca: 'cliente-nuevo',
    titulo: 'Y si es un comercio nuevo',
    texto: 'Lo cargás en diez segundos, parado en la vereda, y seguís con la venta sin perder el hilo. Con el nombre alcanza.',
  },
  {
    ruta: 'vender', destaca: 'lista-productos', ventaEnCurso: true,
    titulo: 'Segundo: qué se lleva',
    texto: 'Aparece todo lo que tengas con precio, con el stock al lado. Tocás más o menos y el total se arma solo. No hay que escribir precios.',
  },
  {
    ruta: 'deudas', destaca: 'lista-deudas',
    titulo: 'Quién te debe, del más viejo al más nuevo',
    texto: 'Todo lo que está en la calle, ordenado por antigüedad: ese es el orden en el que conviene salir a cobrar. Podés registrar el pago entero o una parte.',
  },
  {
    ruta: 'ingreso', destaca: 'lista-proveedores',
    titulo: 'Cuando te llega mercadería',
    texto: 'Elegís el proveedor, marcás cuántas unidades entraron y el stock sube solo. Si le pagás después, queda anotado lo que vos le debés.',
  },
  {
    ruta: 'productos', destaca: 'producto-nuevo',
    titulo: 'Tus productos los cargás vos',
    texto: 'Nombre y a cuánto lo vendés. Si ya tenés unidades en casa, las cargás ahí mismo con lo que te costaron y el sistema te muestra cuánto te queda limpio.',
  },
  {
    ruta: 'productos', destaca: 'lista-productos-todos',
    titulo: 'Y ves la ganancia de cada uno',
    texto: 'Tocás un producto y ves qué te cuesta, a cuánto lo vendés y cuánto te queda por unidad. Desde ahí también le cambiás el precio: el anterior queda guardado con la fecha, nunca se pisa.',
  },
  {
    ruta: 'clientes', destaca: 'lista-clientes-todos',
    titulo: 'La ficha de cada comercio',
    texto: 'Zona, día que lo visitás, teléfono y lo que te debe. Corregís lo que haga falta sin tocar sus ventas. Y si dejás de venderle, se archiva: su historial no se borra nunca.',
  },
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
