import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import './ui/estilos.css';

const raiz = document.getElementById('root');
if (!raiz) throw new Error('Falta el div#root en index.html');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Modo sin conexión. Falla en silencio si el navegador no lo soporta o si la
// página se abrió desde un archivo local: la app funciona igual, solo que
// necesitando red para recargar.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
