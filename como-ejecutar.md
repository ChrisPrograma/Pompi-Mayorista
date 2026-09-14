# Cómo se ejecuta esto

Preguntaste cuál es el ejecutable. **No hay un .exe**, y es a propósito: esto es una aplicación web
instalable (PWA). Te explico exactamente qué se ejecuta en cada caso.

---

## El punto de entrada

```
index.html          ← el archivo que el navegador abre
   └─ src/main.tsx  ← el primer código que corre
        └─ src/ui/App.tsx   ← la aplicación
```

`index.html` es el ejecutable en el sentido literal: es lo que se abre. Vite lo lee, ve el
`<script type="module" src="/src/main.tsx">` y a partir de ahí arma todo.

---

## Para desarrollar (en tu máquina)

```bash
cd gestion-pompi-mascotas
npm install
npm run dev
```

Te abre `http://localhost:5173`. Lo que se ejecuta es el servidor de desarrollo de Vite, con
recarga en caliente: guardás un archivo y la pantalla se actualiza sola.

**Para probarlo desde el celular** mientras desarrollás, el servidor ya está configurado con
`host: true`, así que Vite te imprime también una dirección de red (algo como
`http://192.168.0.15:5173`). Entrás a esa desde el teléfono, con ambos en el mismo wifi. Es la
forma de ver si los botones son lo bastante grandes de verdad.

---

## Para producción

```bash
npm run build     # compila y verifica tipos
npm run preview   # sirve el resultado, para revisar antes de publicar
```

`npm run build` genera la carpeta `dist/`: HTML, CSS, JavaScript y el service worker, todo
estático. **Eso es el ejecutable final.** Se sube a cualquier hosting de archivos estáticos
(Vercel, Netlify, incluso Hostinger) y listo: no hay servidor de aplicación que mantener.

Una vez publicado, el cliente entra desde el navegador del celular y usa **"Agregar a pantalla de
inicio"**. A partir de ahí le queda un ícono como cualquier app, se abre a pantalla completa sin
barra de navegador, y funciona sin señal.

Esa es la razón de fondo de no haber hecho una app nativa: no hay tiendas, no hay revisión de
Apple, y cuando corregís algo se actualiza solo la próxima vez que la abre. Un cliente que ya
abandonó tres sistemas no va a estar bajando actualizaciones de una tienda.

---

## Configuración del backend

Copiá `.env.example` a `.env` y completá:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

**Sin esas dos variables la app funciona igual**, entera, guardando todo en el dispositivo. Es
deliberado: podés mostrarla, probarla y hasta dejársela usando antes de tener el backend armado.
La cola de sincronización simplemente no tiene a dónde subir y lo dice en pantalla.

Cuando conectes Supabase, aplicá las migraciones en orden desde el editor SQL:

```
db/migrations/001_esquema.sql
db/migrations/002_vistas.sql
db/migrations/003_funciones.sql
db/migrations/004_rls.sql
db/migrations/005_datos_iniciales.sql   ← editar antes: uuid del usuario y nombre del negocio
```

---

## Los tests

```bash
npm test          # vitest, una vez instaladas las dependencias
```

Sin npm disponible (como en el entorno donde se escribió esto):

```bash
npm run test:node
```

Corre los mismos archivos con el runner nativo de Node. **45 tests, 45 en verde.**

---

## Qué está verificado y qué no

Conviene que lo sepas antes de abrirlo por primera vez.

| Parte | Estado |
|---|---|
| Lógica de dominio (dinero, stock, precios, saldos) | **Verificada.** 28 tests. |
| Acciones y modelos de vista (qué muestra cada pantalla) | **Verificada.** 17 tests. |
| Resolución de módulos (195 imports) | **Verificada** con `npm run verificar`. |
| Imports sin usar (rompen el build por `noUnusedLocals`) | **Verificado**: ninguno. |
| Tipos de TypeScript | **Verificados**: `tsc` sin errores (`npm run typecheck:sin-npm`). |
| Compilación y render | **Verificados**: el build corre y la app se manejó de punta a punta en un navegador real. |
| Migraciones SQL | Escritas, **no ejecutadas** contra un Postgres real. |

Lo único sin probar son las migraciones contra un Postgres de verdad.

### El build sin npm

Si estás en un entorno sin acceso al registro de npm, `node scripts/build.mjs` compila con el
bundler que trae bun, sin instalar nada. Genera el mismo `dist/`. Necesita React disponible
(por ejemplo instalado globalmente).

El primer arranque siembra datos de ejemplo del rubro (los mismos del boceto) para que la app
nunca abra vacía. Están en `src/app/semilla.ts` y se reemplazan por los datos reales del cliente
cuando los tengas.
