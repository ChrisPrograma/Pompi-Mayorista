# Stack, herramientas y dependencias

Decidido el 13/09/2026, actualizado con las respuestas del cliente. Todo lo de acá es revisable,
pero está elegido con un criterio explícito para que cambiarlo sea una decisión y no un accidente.

**Alcance confirmado:** sin alimento balanceado (no hay lotes ni vencimientos), sin facturación
electrónica (las hace aparte) y un solo usuario (trabaja solo). El detalle de cada decisión y qué
haría falta si alguna cambia está en `docs/decisiones-cliente.md`.

**Criterio de selección, en orden:**

1. Tiene que funcionar sin señal, parado en la vereda.
2. Un solo desarrollador tiene que poder mantenerlo dentro de un año.
3. Costo fijo mensual cercano a cero mientras haya un solo cliente usándolo.
4. Nada que obligue a reescribir si mañana hay cinco clientes más con el mismo sistema.

---

## Resumen

| Capa | Elección | Versión |
|---|---|---|
| Lenguaje | TypeScript (strict) | 5.x |
| UI | React | 18.x |
| Build | Vite | 5.x |
| Estilos | Tailwind CSS | 3.x |
| PWA / offline | vite-plugin-pwa (Workbox) | 0.20.x |
| Base local | Dexie (IndexedDB) | 4.x |
| Backend | Supabase (Postgres 16, Auth, RLS) | — |
| Cliente backend | @supabase/supabase-js | 2.x |
| Validación | Zod | 3.x |
| IDs | uuidv7 | 1.x |
| Fechas | date-fns + date-fns-tz | 3.x / 3.x |
| Tests | Vitest | 2.x |
| E2E (etapa 2) | Playwright | 1.x |
| Calidad | ESLint + Prettier | 9.x / 3.x |
| Hosting front | Netlify (estático) | — |

---

## Por qué cada cosa

### Postgres vía Supabase

El modelo de datos depende de dos cosas que Postgres hace y otras bases no:

- **Índice único parcial** (`UNIQUE ... WHERE vigente_hasta IS NULL`), que es lo que garantiza a
  nivel de base que no haya dos precios vigentes del mismo producto. Sin esto, la garantía queda
  en el código de la aplicación, que es donde se rompe.
- **Transacciones reales**, necesarias para cerrar un precio y abrir el siguiente sin estado
  intermedio inválido.

Supabase agrega autenticación, RLS y una API REST generada, que es más de lo que este proyecto
necesita hoy y exactamente lo que va a necesitar si mañana hay varios clientes. El plan gratuito
alcanza de sobra para un usuario.

**Descartado:** Firebase/Firestore, porque el modelo es relacional y con restricciones de
integridad; emularlas en un documental es trabajo puro. SQLite en el dispositivo sin servidor,
porque no permite ver los datos desde otro lado ni respaldarlos sin trabajo extra.

### Dexie + cola de salida propia, en vez de un motor de sincronización

Acá hay una propiedad del modelo que conviene aprovechar: **como nada se actualiza, todas las
escrituras son INSERT**. Un libro mayor append-only con IDs generados en el dispositivo se
sincroniza reenviando inserts; si uno llega dos veces, la clave primaria lo rechaza y listo. No
hace falta resolver conflictos porque no hay dos versiones de la misma fila.

La única operación que no es un insert simple es el cambio de precio (cerrar una fila, abrir otra),
y esa se resuelve con una función del lado del servidor, no en el cliente.

Por eso la cola de salida propia son unas 150 líneas y no se justifica todavía sumar PowerSync o
ElectricSQL, que resuelven el caso general de sincronización bidireccional con conflictos. Si el
proyecto crece a varios vendedores escribiendo sobre el mismo stock, se reevalúa: el modelo
append-only ya deja preparado ese camino.

**Descartado:** localStorage (límite de 5 MB y sincrónico, bloquea la interfaz).

### React + Vite, sin framework de servidor

No hay SEO, no hay contenido público, no hay renderizado en servidor que justifique el peso de
Next.js. Es una app de uso interno que tiene que abrir rápido en un celular viejo y funcionar sin
conexión: un estático servido desde CDN es la forma más directa de lograrlo.

**Descartado:** Next.js (peso y complejidad sin contrapartida acá), React Native / app nativa
(obliga a tiendas de aplicaciones y a un ciclo de actualización que este cliente no va a seguir;
la PWA se actualiza sola y se instala desde el navegador).

### Tailwind sin librería de componentes

El sistema visual ya está definido en el boceto y es específico: botones grandes, vocabulario
propio, nada de aspecto de panel de administración. Una librería de componentes trae decisiones
visuales que habría que pelear en cada pantalla.

**Descartado:** MUI, Ant Design, shadcn/ui. El último es tentador, pero su estética es justamente
la de "app profesional" que estamos evitando a propósito.

### Zod

Los mismos esquemas validan la entrada del formulario, lo que se guarda en IndexedDB y lo que se
manda al servidor. Una sola definición por entidad.

### uuidv7 en vez de uuidv4

Los UUID v7 son ordenables por tiempo de creación. En un libro mayor, eso significa que el orden
natural de la clave primaria es el orden cronológico: los índices no se fragmentan y las consultas
por rango de fechas son baratas.

### Dinero en enteros

Todos los importes se guardan como **enteros de centavos** (`bigint` en Postgres, `number` en
TypeScript con helpers). Nunca `float`. Con precios que se multiplican por cantidades y después se
suman, los errores de punto flotante aparecen en el total de una venta, que es justo donde el
cliente los ve.

### Fechas con zona horaria explícita

`America/Argentina/Buenos_Aires` siempre. Guardado en UTC, mostrado en hora local. "Las ventas de
hoy" tiene que cortar a la medianoche de él, no a la del servidor.

---

## Servicios externos y costo

| Servicio | Para qué | Costo hoy |
|---|---|---|
| Supabase | Base de datos, auth, API | Plan gratuito |
| Netlify | Hosting del front | Plan gratuito |
| Dominio propio | Opcional, mejora la percepción | ~USD 12/año |

Nada de esto requiere tarjeta para arrancar. El primer límite que se va a tocar es el de pausado
por inactividad del plan gratuito de Supabase, que con un usuario activo todos los días no aplica.

---

## Lo que NO se usa, y por qué

| Descartado | Motivo |
|---|---|
| ORM (Prisma, Drizzle) | Las consultas son vistas SQL sobre un libro mayor; `supabase-js` alcanza y evita una capa de traducción |
| Redux / Zustand | El estado de servidor vive en Dexie; el estado de interfaz es local a cada pantalla |
| Librería de gráficos | Los tres gráficos del boceto son SVG propio y pesan cero |
| Framework de componentes | Ver arriba: la estética es el producto |
| Facturación electrónica | **Descartada por el cliente**: las facturas las hace aparte. Si alguna vez la pide, es otro proyecto |
| Lotes y vencimientos | **Descartados por el cliente**: no vende alimento balanceado. El libro mayor permite agregarlos después sin migrar nada |
| Roles y permisos de usuario | **Innecesarios**: trabaja solo. Las tablas conservan `negocio_id` y las políticas por fila igual, que no cuestan nada |

---

## Estructura del repositorio

```
gestion-pompi-mascotas/
├── db/migrations/        SQL versionado, se aplica en orden
├── docs/                 Decisiones, modelo de datos, preguntas al cliente
├── src/
│   ├── domain/           Lógica pura, sin dependencias: dinero, stock, precios, saldos
│   ├── app/              Estado (un log), acciones y datos de ejemplo
│   ├── data/             Dexie, cola de salida, cliente de Supabase
│   ├── ui/               Modelos de vista, componentes y pantallas
│   └── main.tsx          Arranque de React
├── scripts/              Utilidades de desarrollo
├── index.html            Punto de entrada (ver docs/como-ejecutar.md)
└── vite.config.ts        Build y configuración de la PWA
```

Además `src/app/` (estado y acciones) y `src/ui/vistas.ts` (qué muestra cada pantalla), ambos
puros y cubiertos por tests. Los componentes de React quedan reducidos a pintar.

La regla de dependencias es de adentro hacia afuera: `domain` no importa nada de `data` ni de
`ui`. Es lo que permite tener la lógica de negocio cubierta por tests que corren en milisegundos
sin base de datos ni navegador.
