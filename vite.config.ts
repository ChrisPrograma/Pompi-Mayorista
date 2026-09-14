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
        const { readFileSync } = process.getBuiltinModule('node:fs');
        for (const archivo of ['sw.js', 'icono-192.png', 'icono-512.png']) {
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
