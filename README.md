# Gestión Pompi Mascotas

Sistema de gestión para venta mayorista de accesorios para mascotas: un vendedor que trabaja en la
calle, sin local, con stock repartido entre su casa y el auto.

**Cómo se ejecuta:** `npm install && npm run dev`. El punto de entrada es `index.html`.
El ejecutable es la carpeta `dist/` que genera `npm run build`: HTML, CSS, JS y service worker,
323 kB, para subir a cualquier hosting estático. Detalle en
[`docs/como-ejecutar.md`](docs/como-ejecutar.md).

**Dependencias en tiempo de ejecución: solo React.** El uuid v7, el envoltorio de IndexedDB, el
cliente del backend y el service worker están escritos acá, en unas cien líneas cada uno, en vez
de sumar cuatro paquetes. En una app que tiene que abrir rápido en un celular viejo y seguir
mantenible dentro de un año, se paga.

---

## REGLA 0 — antes de tocar código

> **Nada se pisa, todo se apila.**
>
> Stock, costo y precio de venta **no son columnas mutables**:
>
> | Dato | Mal | Bien |
> |---|---|---|
> | Stock | `productos.stock = 47` | suma de `movimientos_stock` |
> | Costo | `productos.costo = 2150` | último `compra_items.costo_unitario` |
> | Precio | `productos.precio = 3600` | fila vigente en `precios_venta` |
>
> El boceto de presentación **sí** las pisa (`p.costo = p.cn`). Ese boceto sirve para mostrarle el
> comportamiento al cliente en una reunión; **no es el diseño del sistema**. Si se toma como base
> para programar, se arrastran tres bugs carísimos de sacar.

En `productos` no existen esas columnas, y los triggers de `004_rls.sql` bloquean a nivel de base
editar o borrar un movimiento. La regla no depende de que el código se porte bien.

---

## Alcance

Confirmado con el cliente: **sin alimento balanceado** (no hay lotes ni vencimientos), **sin
facturación electrónica** (las hace aparte) y **un solo usuario** (trabaja solo).
Ver [`docs/decisiones-cliente.md`](docs/decisiones-cliente.md), que además dice qué haría falta si
alguna de esas cambia.

Quedan tres preguntas abiertas para la reunión del martes, ninguna bloquea seguir:
[`docs/preguntas-cliente-martes.md`](docs/preguntas-cliente-martes.md).

---

## Estructura

```
db/migrations/
  001_esquema.sql        Tablas. productos NO tiene stock, costo ni precio.
  002_vistas.sql         Stock, saldos, costos y ganancia: calculados, nunca guardados.
  003_funciones.sql      Operaciones transaccionales, todas idempotentes por id.
  004_rls.sql            Seguridad por fila + triggers que bloquean editar el libro mayor.
  005_datos_iniciales.sql  Negocio, lista de precios y parámetros. Editar antes de correr.

src/domain/              Lógica pura, sin dependencias.       28 tests
  money.ts               Enteros de centavos. Nunca float.
  stock.ts               Stock como suma del libro mayor; qué cargar en el auto.
  precios.ts             Los tres costos, sugerencia de precio, cerrar-y-abrir, ganancia.
  saldos.ts              Cuenta corriente con imputación FIFO.

src/app/                 Estado como log + acciones del usuario. 24 tests
  estado.ts              Catálogo (alta/editar/activar de productos, clientes y proveedores),
                         vender, entrarMercaderia, cargarAuto, cobrar, cambiarPrecio, sugerencias.
  semilla.ts             Datos de ejemplo del rubro, construidos como los construiría el sistema.

src/lib/
  uuid.ts                UUID v7 propio, ordenable por tiempo.

src/data/
  outbox.ts              Cola de salida para trabajar sin señal.
  idb.ts                 Envoltorio mínimo de IndexedDB (reemplaza a Dexie).
  local.ts               El log, guardado en el dispositivo.
  servidor.ts            Transporte contra Supabase, con fetch.

src/ui/
  vistas.ts              Qué muestra cada pantalla. Puro y testeado.
  App.tsx                Shell, navegación, hojas, acciones y el recorrido guiado.
  recorrido.ts           Los 15 pasos del recorrido. Data: agregar uno es una línea.
  pantallas.tsx          Las nueve pantallas.
  componentes.tsx        Piezas compartidas.
  estilos.css            El sistema visual del boceto.
```

La regla de dependencias es de adentro hacia afuera: `domain` no conoce `data` ni `ui`.

---

## Tests

```bash
npm test          # vitest
npm run test:node # sin npm: runner nativo de Node + shim (ver docs/como-ejecutar.md)
npm run verificar # chequea imports y exports sin compilador
```

**75 tests, 75 en verde.** Los que más importan están en
`src/domain/__tests__/regla-cero.test.ts`: no prueban funciones, prueban que el sistema **no puede**
cometer los errores típicos.

- el stock da igual aunque los movimientos lleguen desordenados (como llegan al sincronizar);
- cambiar un precio **no muta** la fila anterior, y se puede preguntar a cuánto vendía en junio;
- subir el costo en septiembre **no cambia** la ganancia de una venta de marzo — y no por cuidado
  al programar, sino porque `gananciaDeVenta` no recibe el costo actual como parámetro.

Y en `src/app/__tests__/flujo.test.ts`, el recorrido completo de un día: cargar el auto, vender,
cobrar, entrar mercadería más cara, decidir sobre los precios.

---

## Estado

| Parte | Estado |
|---|---|
| Modelo de datos y migraciones | Completas, **no ejecutadas** contra un Postgres real |
| Dominio, acciones y modelos de vista | **Verificados**, 68 tests |
| Tipos de TypeScript | **Sin errores** (`tsc`, verificado también en el build de Netlify con los @types reales) |
| Build de producción | **Compila**: 323 kB en `dist/` |
| La app en un navegador real | **Probada de punta a punta**: vender, cobrar, entrar mercadería, alta/edición/baja de productos y clientes, cambio de precio, persistencia tras recargar |
| Cola de sincronización | Escrita, sin probar contra un servidor |
| Migraciones SQL | Escritas, **no ejecutadas** contra un Postgres real |

Lo único que queda sin probar de verdad es el backend.

---

## Próximos pasos

1. `npm install && npm run dev` y corregir lo que el compilador marque.
2. Proyecto de Supabase, aplicar las cinco migraciones, completar `.env`.
3. Reunión del martes: cerrar las tres preguntas abiertas (la de listas de precios es la única con
   consecuencias en el modelo).
4. Reemplazar `src/app/semilla.ts` por los datos reales, después de un recuento físico de stock.
5. Publicar en Netlify y que el cliente la instale desde el navegador del celular.
