/* Doble de src/lib/llm/arranque.js, SOLO para el build e2e (vite --mode e2e).

   Reemplaza al modelo real porque Chromium headless no tiene WebGPU. Contesta
   siempre lo mismo y sin tocar la red: lo que el e2e prueba es que la APP
   —pantallas, sesión, registro de ánimo— no hace ninguna petición hacia afuera.

   Lo que este doble deja SIN probar, y hay que decirlo: el runtime de WebLLM.
   La promesa del README es "después de que el modelo está cacheado", y eso con
   el modelo real se verifica en el navegador, no acá.

   No se importa desde src/: entra solo por el alias de vite.config.js. */

export const RESPUESTA_DE_PRUEBA = 'Te escucho. Cuéntame un poco más.';

export async function arrancarIA() {
  const puerto = {
    async chat() {
      return [{ role: 'assistant', content: RESPUESTA_DE_PRUEBA, at: Math.floor(Date.now() / 1000) }];
    },
    /* Sin extracción: proponerCheckIn lo trata como "no hubo propuesta" y el
       cierre se muestra igual, que es el camino que ya existe sin modelo. */
    async extract() {
      throw new Error('sin extracción en el doble e2e');
    },
  };

  return {
    puerto,
    modo: 'local',
    modelo: 'doble-e2e',
    adaptador: { cargar: async () => ({ modelo: 'doble-e2e', descartados: [] }) },
  };
}
