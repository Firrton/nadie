import {
  CheckInProposalSchema,
  EMOTION_LABELS,
  MemoryExtractionSchema,
  ShareSummaryDraftSchema,
} from '@nadie/core';
import { ahoraEnSegundos } from './messages.js';
import { armarMensajes, armarMensajesDeExtraccion } from './prompt.js';
import { MODELO_POR_DEFECTO } from './modelos.js';

/* Adaptador de WebLLM: la implementación real del LLMPort de @nadie/core.

   POR QUÉ VIVE ACÁ Y NO EN CORE: core es contrato congelado, "ports and runtime
   schemas, no implementations" (REGLAS §3). Meter WebLLM ahí lo volvería una
   dependencia de `gateway` y `relayer`, que corren en Node y no tienen por qué
   arrastrar una librería de WebGPU. El invariante que importa —que ninguna
   PANTALLA toque WebLLM— lo garantiza la estructura: las pantallas hablan con
   useNadie, y el único archivo que importa esto es la raíz de composición.

   EL MOTOR SE INYECTA. `crearEngine` es un parámetro, no un import. Esto es lo
   que hace que el adaptador se pueda probar entero sin bajar 2 GB ni tener
   WebGPU: el armado del prompt, la semántica de "solo lo nuevo", la validación
   contra los esquemas y el reintento son lógica nuestra y se prueban con un
   motor de mentira. Lo único que queda sin cubrir por los unitarios es el motor
   real, y eso es un e2e aparte.

   LA CARGA VIVE AFUERA DEL PUERTO. `LLMPort` no tiene noción de "cargando" y
   REGLAS §3 lo congeló. Pero la primera carga baja más de 2 GB y tarda minutos:
   si `chat` cargara perezosamente, la persona miraría un orbe "pensando" sin
   barra de progreso ni forma de saber qué pasa. Por eso esta función devuelve
   `{ puerto, cargar, estado }`: `puerto` es un LLMPort pelado que se le pasa a
   useNadie sin que se entere de nada, y `cargar` con su progreso es problema de
   la raíz de composición, que es la que puede dibujarlo. Cero cambios en core. */

/* El catálogo y la elección viven en modelos.js: son una política con tests
   propios, no un detalle del adaptador. Se re-exporta para que quien compone la
   app no tenga que importar de dos lados. */
export { MODELO_POR_DEFECTO } from './modelos.js';

export const ESTADOS = ['sin-cargar', 'cargando', 'listo', 'error'];

const ESQUEMAS = {
  checkin: CheckInProposalSchema,
  memory: MemoryExtractionSchema,
  'share-summary': ShareSummaryDraftSchema,
};

/* La extracción arranca determinista. El reintento SUBE la temperatura: volver a
   pedir lo mismo con temperature 0 devuelve exactamente la misma respuesta, así
   que "reintentar una vez" (REGLAS §5) sería puro teatro. */
const TEMPERATURA_EXTRACCION = [0, 0.4];
const TEMPERATURA_CHAT = 0.7;

export function crearWebLLM({ crearEngine, modelo = MODELO_POR_DEFECTO, onProgreso } = {}) {
  if (typeof crearEngine !== 'function') {
    throw new Error('crearWebLLM necesita crearEngine: el motor se inyecta, no se importa acá');
  }

  let estado = 'sin-cargar';
  let motor = null;
  let enVuelo = null;

  /* Idempotente y a prueba de llamadas concurrentes: dos pantallas pidiendo
     cargar no pueden disparar dos descargas de 2 GB. */
  function cargar() {
    if (estado === 'listo') return Promise.resolve();
    if (enVuelo) return enVuelo;

    estado = 'cargando';
    enVuelo = Promise.resolve()
      .then(() => crearEngine(modelo, { initProgressCallback: onProgreso }))
      .then((m) => {
        motor = m;
        estado = 'listo';
      })
      .catch((e) => {
        estado = 'error';
        throw e;
      })
      .finally(() => {
        enVuelo = null;
      });

    return enVuelo;
  }

  /* Falla fuerte en vez de cargar por su cuenta. Cargar acá dejaría a la persona
     esperando minutos sin que nadie pueda mostrarle progreso: quien compone la
     app es responsable de no abrir la conversación antes de que esté listo. */
  function exigirMotor() {
    if (estado !== 'listo') {
      throw new Error('el modelo todavía no está listo (estado: ' + estado + '); llamá a cargar() primero');
    }
    return motor;
  }

  async function completar(mensajes, opciones) {
    const respuesta = await exigirMotor().chat.completions.create({
      stream: false,
      messages: mensajes,
      ...opciones,
    });

    const texto = respuesta && respuesta.choices && respuesta.choices[0]
      ? respuesta.choices[0].message && respuesta.choices[0].message.content
      : null;

    if (typeof texto !== 'string' || !texto.trim()) {
      throw new Error('el modelo devolvió una respuesta vacía');
    }
    return texto.trim();
  }

  const puerto = {
    /* Devuelve SOLO LO NUEVO, igual que el demo. Core declara la firma pero no
       la testea; si este adaptador eligiera distinto, quien agregue el resultado
       al historial duplicaría toda la conversación anterior, en silencio. */
    async chat(messages, context) {
      const texto = await completar(armarMensajes(messages, context), {
        temperature: TEMPERATURA_CHAT,
      });
      return [{ role: 'assistant', content: texto, at: ahoraEnSegundos() }];
    },

    /* REGLAS §5: la salida del modelo se valida contra el esquema; si no valida,
       se descarta y se reintenta UNA vez. Nunca entra algo sin validar.

       Los errores no llevan ni la salida del modelo ni la transcripción. Es la
       misma regla que ya cumple loadMoodLog: lo más sensible de la app no puede
       terminar en la consola de nadie, y un mensaje de error es consola. */
    async extract(transcript, schema) {
      const esquema = ESQUEMAS[schema];
      if (!esquema) throw new Error('esquema desconocido: ' + schema);

      const mensajes = armarMensajesDeExtraccion(transcript, schema, EMOTION_LABELS);
      let ultimoMotivo = 'el modelo no devolvió nada usable';

      for (let intento = 0; intento < TEMPERATURA_EXTRACCION.length; intento++) {
        let crudo;
        try {
          crudo = await completar(mensajes, {
            response_format: { type: 'json_object' },
            temperature: TEMPERATURA_EXTRACCION[intento],
          });
        } catch (e) {
          ultimoMotivo = 'el modelo falló al responder';
          continue;
        }

        let datos;
        try {
          datos = JSON.parse(crudo);
        } catch (e) {
          ultimoMotivo = 'el modelo no devolvió JSON';
          continue;
        }

        const resultado = esquema.safeParse(datos);
        if (resultado.success) return resultado.data;
        ultimoMotivo = 'la salida no cumple el esquema';
      }

      throw new Error('extract(' + schema + ') falló tras 2 intentos: ' + ultimoMotivo);
    },
  };

  return {
    puerto,
    cargar,
    modelo,
    get estado() {
      return estado;
    },
  };
}
