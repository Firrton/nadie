import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* MODO e2e: `vite build --mode e2e`.

   El e2e corre en Chromium headless, que no tiene WebGPU. Sin modelo, la app
   muestra "sin soporte" y no hay conversación que probar. La salida NO es volver
   a meter un modelo de mentira en la app (se sacó a propósito: fingir que piensa
   es mentir): es reemplazar la raíz de composición de la inferencia SOLO en este
   build, con un doble que vive en test/e2e/ y nunca entra al bundle real.

   Sale a dist-e2e/ para no pisar dist/, que es lo que audita
   test/no-external-requests.test.js. */
export default defineConfig(({ mode }) => {
  const e2e = mode === 'e2e';
  return {
    plugins: [react()],
    resolve: {
      alias: e2e
        ? [{
          find: /^\.\/lib\/llm\/arranque\.js$/,
          replacement: fileURLToPath(new URL('./test/e2e/arranque-de-prueba.js', import.meta.url)),
        }]
        : [],
    },
    build: e2e ? { outDir: 'dist-e2e' } : {},
  };
});
