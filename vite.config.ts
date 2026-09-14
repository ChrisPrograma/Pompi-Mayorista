import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * El service worker (sw.js) y el manifest están escritos a mano y se copian tal
 * cual. No se usa vite-plugin-pwa: el service worker de esta app son cuarenta
 * líneas legibles, y en un proyecto cuyo requisito número uno es funcionar sin
 * señal conviene poder leer entero el mecanismo que lo garantiza.
 *
 * Con `publicDir: '.'` quedarían archivos de más; por eso se copian explícitamente.
 */
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copiar-archivos-pwa',
      apply: 'build',
      generateBundle() {
        // El import va ARRIBA, no acá adentro: Vite compila este archivo a ESM,
        // donde `require` no existe. Un require() dentro del hook rompe el build
        // recién en el último paso, con 48 módulos ya transformados.
        for (const archivo of ['sw.js', 'icono-192.png', 'icono-512.png', '_headers']) {
          if (!existsSync(archivo)) continue;   // falta uno: se avisa, no se rompe
          this.emitFile({
            type: 'asset',
            fileName: archivo,
            source: readFileSync(archivo),
          });
        }
      },
    },
  ],
  server: { port: 5173, host: true },
  build: { target: 'es2022', sourcemap: true },
});
