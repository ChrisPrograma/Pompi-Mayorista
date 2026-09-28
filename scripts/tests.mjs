/**
 * Corre los tests con el runner nativo de Node, en cualquier sistema.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 *
 * El script `test:node` era una línea de shell:
 *
 *     mkdir -p node_modules/vitest && cp scripts/vitest-shim/* node_modules/vitest/ && node --test ...
 *
 * `mkdir -p` y `cp` son comandos de Unix. En la computadora de Maclarens, que
 * es Windows, npm corre los scripts con `cmd.exe`: ahí `mkdir -p` crea una
 * carpeta llamada literalmente `-p` y `cp` directamente no existe. O sea que
 * `npm run antes-de-subir` —el chequeo que tiene que correr ANTES de subir—
 * fallaba siempre en la máquina donde más importa que ande.
 *
 * El asterisco es el otro problema: `cmd.exe` no expande comodines, así que
 * `src/app/__tests__/*.test.ts` le llegaría a Node tal cual, como el nombre de
 * un archivo que no existe.
 *
 * Node corre igual en los dos lados, así que las dos cosas se hacen acá.
 *
 * POR QUE EL SHIM DE VITEST
 *
 * Los tests están escritos con la forma de vitest (`describe`, `it`, `expect`),
 * pero el runner que se usa para verificar es el de Node, que no necesita
 * instalar nada. El shim de `scripts/vitest-shim/` traduce una forma a la otra,
 * y se copia adentro de `node_modules/vitest/` para que el `import 'vitest'` de
 * cada test lo encuentre sin más ceremonia.
 */

import { cpSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');

// 1. El shim, adonde el `import 'vitest'` lo va a buscar.
const destino = join(raiz, 'node_modules', 'vitest');
mkdirSync(destino, { recursive: true });
cpSync(join(raiz, 'scripts', 'vitest-shim'), destino, { recursive: true });

// 2. Los archivos de test, buscados a mano: acá no hay shell que expanda nada.
const carpetas = ['src/domain/__tests__', 'src/app/__tests__', 'src/data/__tests__'];
const archivos = carpetas
  .map((c) => join(raiz, c))
  .filter((c) => existsSync(c))
  .flatMap((c) => readdirSync(c).filter((f) => f.endsWith('.test.ts')).map((f) => join(c, f)))
  .sort();

if (archivos.length === 0) {
  console.error('No encontré ningún archivo .test.ts. Algo está mal en la estructura del proyecto.');
  process.exit(1);
}

// 3. A correr. `stdio: 'inherit'` para que la salida se vea tal cual, en vivo.
const { status } = spawnSync(
  process.execPath,
  ['--experimental-strip-types', '--test', ...archivos],
  { stdio: 'inherit', cwd: raiz },
);

process.exit(status ?? 1);
