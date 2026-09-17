/**
 * Verificador de imports sin compilador.
 *
 * POR QUÉ EXISTE: el entorno donde se escribió el proyecto no pudo instalar
 * dependencias, así que `tsc` nunca corrió. Este script cubre la clase de error
 * más probable en ese escenario: un import que apunta a un archivo que no existe,
 * o que pide un símbolo que el archivo no exporta.
 *
 * NO reemplaza a `npm run build`. Chequea resolución de módulos y balance de
 * etiquetas JSX; no chequea tipos.
 *
 *   node scripts/verificar-imports.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const DEPS_EXTERNAS = new Set([
  'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime',
  'dexie', 'uuidv7', 'zod', 'vitest', 'vite', 'node:test', 'node:assert/strict',
  '@supabase/supabase-js', 'date-fns', 'date-fns-tz',
]);

const archivos = [];
const recorrer = (dir) => {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) recorrer(p);
    else if (/\.(ts|tsx)$/.test(n)) archivos.push(p);
  }
};
recorrer(join(RAIZ, 'src'));

/** Símbolos que un archivo exporta. Regex, no parser: alcanza para este chequeo. */
const exportados = (ruta) => {
  const src = readFileSync(ruta, 'utf8');
  const nombres = new Set();
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g)) {
    nombres.add(m[1]);
  }
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const parte of m[1].split(',')) {
      const t = parte.trim().split(/\s+as\s+/);
      const nombre = (t[1] ?? t[0]).trim().replace(/^type\s+/, '');
      if (nombre) nombres.add(nombre);
    }
  }
  // `export * from './x'` re-exporta todo: se resuelve en cascada.
  for (const m of src.matchAll(/export\s+\*\s+from\s+['"](\.[^'"]+)['"]/g)) {
    const destino = resolve(dirname(ruta), m[1]);
    try { for (const n of exportados(destino)) nombres.add(n); } catch { /* se reporta abajo */ }
  }
  return nombres;
};

const problemas = [];
let importsRevisados = 0;

for (const ruta of archivos) {
  const src = readFileSync(ruta, 'utf8');
  const rel = ruta.slice(RAIZ.length + 1);

  for (const m of src.matchAll(/import\s+(type\s+)?([^;]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const especificador = m[3];
    if (!especificador.startsWith('.')) {
      if (!DEPS_EXTERNAS.has(especificador)) {
        problemas.push(`${rel}: dependencia externa no declarada → ${especificador}`);
      }
      continue;
    }

    const destino = resolve(dirname(ruta), especificador);
    let existe = true;
    try { statSync(destino); } catch { existe = false; }
    if (!existe) {
      problemas.push(`${rel}: el import apunta a un archivo que no existe → ${especificador}`);
      continue;
    }
    if (/\.css$/.test(especificador)) continue;

    const disponibles = exportados(destino);
    const clausula = m[2].trim();
    const llaves = clausula.match(/\{([^}]*)\}/);
    if (!llaves) continue; // import por defecto o namespace

    for (const parte of llaves[1].split(',')) {
      const limpio = parte.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (!limpio) continue;
      importsRevisados++;
      if (!disponibles.has(limpio)) {
        problemas.push(`${rel}: "${limpio}" no está exportado por ${especificador}`);
      }
    }
  }

  // Balance grosero de etiquetas JSX (abiertas vs cerradas, ignorando autocierres).
  if (ruta.endsWith('.tsx')) {
    const abre = [...src.matchAll(/<([A-Za-z][A-Za-z0-9.]*)(?=[\s/>])/g)]
      .filter((x) => !/\/>/.test(src.slice(x.index, src.indexOf('>', x.index) + 1)));
    const cierra = [...src.matchAll(/<\/([A-Za-z][A-Za-z0-9.]*)>/g)];
    const cuenta = (lista) => lista.reduce((acc, x) => {
      acc[x[1]] = (acc[x[1]] ?? 0) + 1; return acc;
    }, {});
    const a = cuenta(abre), c = cuenta(cierra);
    for (const etiqueta of Object.keys(c)) {
      if ((a[etiqueta] ?? 0) < c[etiqueta]) {
        problemas.push(`${rel}: hay más cierres que aperturas de <${etiqueta}>`);
      }
    }
  }
}

console.log(`Archivos revisados:  ${archivos.length}`);
console.log(`Imports verificados: ${importsRevisados}`);

if (problemas.length) {
  console.log(`\n${problemas.length} problema(s):\n`);
  for (const p of problemas) console.log('  ✗ ' + p);
  process.exit(1);
}
console.log('\nSin problemas de resolución de módulos.');
