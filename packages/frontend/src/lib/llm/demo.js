import { DEMO_REPLIES } from '../../data/content.js';
import { ahoraEnSegundos } from './messages.js';

/* Implementación de demo del LLMPort de @nadie/core.

   Es el guion de tres líneas que ya tenía la app, pero detrás del puerto real
   en vez de metido adentro de la máquina de estados. El día que entre WebLLM,
   se inyecta otro objeto con esta misma forma y no se toca ni useNadie ni
   ninguna pantalla:

     useNadie({ llm: crearWebLLM() })

   SEMÁNTICA DE `chat` — core define la firma pero no la testea, así que hay que
   elegir y dejarlo escrito: acá devuelve SOLO los mensajes nuevos, no la
   conversación entera. Es la lectura segura: quien reciba el resultado lo
   agrega al historial, y con la otra lectura duplicaría todo lo anterior. Si
   el adaptador de WebLLM elige distinto, las conversaciones se rompen en
   silencio — por eso hay un test que lo afirma.

   `extract` todavía no tiene con qué: los esquemas viven en core y el modelo
   real no está. Lanza en vez de devolver algo inventado, porque un objeto
   vacío que parece válido es peor que un error. */

export function crearDemoLLM({ demora = 900 } = {}) {
  let turno = 0;

  return {
    async chat(messages, context) {
      void context; // el demo no usa memoria todavía
      await new Promise((r) => setTimeout(r, demora));

      const texto = DEMO_REPLIES[Math.min(turno, DEMO_REPLIES.length - 1)];
      turno += 1;

      return [{ role: 'assistant', content: texto, at: ahoraEnSegundos() }];
    },

    async extract() {
      throw new Error('demoLLM.extract no está implementado: falta el modelo real');
    },
  };
}
