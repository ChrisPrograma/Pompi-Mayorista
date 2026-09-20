/**
 * Build con bun, para entornos sin npm.
 *
 * `npm run build` (Vite) es el camino normal. Este script hace lo mismo con el
 * bundler que trae bun, que no necesita instalar nada, y copia los archivos de
 * la PWA que no pasan por el bundle.
 *
 *   node scripts/build.mjs
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';

const SALIDA = 'dist';
// OJO: esta lista está también en `vite.config.ts`. Los dos caminos de build
// copian los mismos archivos sueltos; si se agrega uno, va en los dos lados.
const SUELTOS = ['icono-192.png', 'icono-512.png', 'icono-maskable-512.png', 'apple-touch-icon.png', 'favicon.ico', '_headers'];

if (existsSync(SALIDA)) rmSync(SALIDA, { recursive: true });
mkdirSync(SALIDA, { recursive: true });

const r = spawnSync(
  'bun',
  [
    'build', 'index.html',
    '--outdir', SALIDA,
    // --production: minifica, fija NODE_ENV y usa el runtime de JSX de producción.
    // Sin esto, bun compila el JSX contra react/jsx-dev-runtime, que en el build
    // de producción de React está vacío y deja la pantalla en blanco.
    '--production',
  ],
  { stdio: 'inherit' },
);
if (r.status !== 0) process.exit(r.status ?? 1);

for (const archivo of SUELTOS) copyFileSync(archivo, `${SALIDA}/${archivo}`);

/**
 * El service worker lleva el hash del bundle como versión de su caché.
 *
 * Sin esto el nombre del caché sería constante, el `activate` no borraría nada
 * y cada build dejaría enterrada la copia del build anterior para siempre.
 */
const bundle = readdirSync(SALIDA).find((f) => /^index-.*\.js$/.test(f));
const version = bundle ? bundle.replace(/^index-|\.js$/g, '') : String(Date.now());
writeFileSync(
  `${SALIDA}/sw.js`,
  readFileSync('sw.js', 'utf8').replace('__VERSION__', version),
);

const total = readdirSync(SALIDA).reduce((a, f) => a + statSync(`${SALIDA}/${f}`).size, 0);
console.log(`\nListo. ${readdirSync(SALIDA).length} archivos, ${(total / 1024).toFixed(0)} kB en ${SALIDA}/`);
