import { ESCALERA, appConfigDe } from './modelos.js';

/* De dónde salen los pesos. Por defecto, el CDN de HuggingFace; un despliegue
   que quiera alojarlos en su propio dominio define VITE_MODELOS_BASE y no toca
   nada más. Para una app que se presenta como privada, poder sacarse de encima
   la dependencia de un tercero en el archivo más grande que baja no es un
   detalle de configuración. */
const BASE_DE_MODELOS = (import.meta.env && import.meta.env.VITE_MODELOS_BASE) || null;

/* EL ÚNICO ARCHIVO DE LA APP QUE IMPORTA @mlc-ai/web-llm.

   Y lo hace con import() dinámico, no estático, por tres razones en este orden:

   1. La librería pesa megabytes y trae su propio catálogo de ~100 modelos con
      sus URLs. Con import estático todo eso entra al bundle principal y la app
      —que tiene que abrir rápido y funcionar sin que nadie hable con un
      modelo— carga un intérprete de LLMs para mostrar el onboarding.
   2. Nadie baja la librería hasta que la persona decide hablar. Abrir la app y
      mirar "Tu camino" no dispara una sola petición.
   3. El test de red puede seguir exigiendo CERO orígenes externos en el chunk
      de la app, y dejar las URLs de modelo solo donde tienen que estar.

   Esta es la frontera con el mundo real: lo de acá abajo no se puede probar sin
   una GPU y una descarga, y por eso es lo ÚNICO que quedó sin test unitario.
   Todo lo demás del adaptador —prompt, semántica, validación, reintento,
   escalera, capacidad— está cubierto, precisamente para que esta superficie sea
   así de chica. */
export async function crearEngineWebLLM(modelo, opciones = {}) {
  const webllm = await import('@mlc-ai/web-llm');

  return webllm.CreateMLCEngine(modelo, {
    ...opciones,
    appConfig: opciones.appConfig || appConfigDe(ESCALERA, BASE_DE_MODELOS),
  });
}
