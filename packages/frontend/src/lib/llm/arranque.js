import { crearDemoLLM } from './demo.js';
import { crearEngineWebLLM } from './engine.js';
import { escaleraQueEntra } from './modelos.js';
import { medirCapacidad } from './webgpu.js';
import { crearWebLLM } from './webllm.js';

/* RAÍZ DE COMPOSICIÓN de la inferencia: el único lugar que decide QUÉ puerto usa
   la app. Las pantallas hablan con useNadie, useNadie habla con un LLMPort, y
   cuál es ese puerto se resuelve acá y en ningún otro lado.

   Devuelve SIEMPRE un puerto usable. Si no hay WebGPU, si el equipo no da, o si
   la IA local está apagada, devuelve el guion de demo en vez de un error: una
   app que no abre es peor que una app que todavía no piensa.

   ESTÁ DETRÁS DE UN FLAG, y es la regla del propio proyecto: REGLAS §5 dice
   "todo lo opcional detrás de un flag" y que el demo principal corra con los
   opcionales apagados. Mientras no exista el copy de la pantalla de carga —qué
   dice la app mientras bajan 873 MB, y qué dice si el equipo no puede— encender
   esto por defecto sería empeorar la experiencia, no mejorarla.

   Las dependencias se inyectan para poder probar las tres ramas sin GPU. */
export async function arrancarIA({
  activado = false,
  medir = medirCapacidad,
  crearEngine = crearEngineWebLLM,
  crearDemo = crearDemoLLM,
  onProgreso,
} = {}) {
  if (!activado) return { puerto: crearDemo(), modo: 'demo', adaptador: null };

  const capacidad = await medir();
  const posibles = escaleraQueEntra(capacidad);

  /* Vacío NO es un error del chequeo: es la respuesta correcta cuando el equipo
     no da. ARQUITECTURA §4.3 dice ofrecer el nivel 2 (enclave) en ese caso. */
  if (posibles.length === 0) {
    return { puerto: crearDemo(), modo: 'sin-soporte', capacidad, adaptador: null };
  }

  const adaptador = crearPuertoConRespaldo({ escalera: posibles, crearEngine, onProgreso });
  return { puerto: adaptador.puerto, modo: 'local', modelo: posibles[0].id, capacidad, adaptador };
}

/* Un puerto que sobrevive a que el modelo elegido no cargue.

   Que un modelo entre en el presupuesto no garantiza que cargue: un driver que
   se queja, memoria fragmentada, un shard que no baja. Quedarse sin IA por eso
   sería tirar la conversación entera cuando había un modelo más chico esperando.

   EL PUERTO QUE SE DEVUELVE ES ESTABLE: delega en el adaptador activo en vez de
   ser reemplazado. useNadie lo guarda en un ref la primera vez y nunca vuelve a
   mirarlo, así que cambiar el objeto por debajo no serviría de nada.

   La persona no se entera. Un aviso de "cambiamos de modelo" no le sirve para
   decidir nada, y le dice que algo falló cuando ya se resolvió. */
export function crearPuertoConRespaldo({ escalera, crearEngine, onProgreso }) {
  let activo = null;
  let modelo = null;
  const descartados = [];

  function exigir() {
    if (!activo) throw new Error('el modelo todavía no está listo; llamá a cargar() primero');
    return activo.puerto;
  }

  /* async y no una flecha simple: `exigir` lanza, y el contrato de LLMPort dice
     que estos métodos devuelven una promesa. Un throw sincrónico se le escapa a
     quien solo escribió .catch(). */
  const puerto = {
    async chat(mensajes, contexto) {
      return exigir().chat(mensajes, contexto);
    },
    async extract(transcripcion, esquema) {
      return exigir().extract(transcripcion, esquema);
    },
  };

  async function cargar() {
    if (activo) return { modelo, descartados };

    let ultimo = null;
    for (const peldano of escalera) {
      const candidato = crearWebLLM({ crearEngine, modelo: peldano.id, onProgreso });
      try {
        await candidato.cargar();
        activo = candidato;
        modelo = peldano.id;
        return { modelo, descartados };
      } catch (e) {
        descartados.push(peldano.id);
        ultimo = e;
      }
    }
    throw ultimo || new Error('ningún modelo de la escalera pudo cargar');
  }

  return {
    puerto,
    cargar,
    get estado() { return activo ? activo.estado : 'sin-cargar'; },
    get modelo() { return modelo; },
    get descartados() { return descartados.slice(); },
  };
}

/* Lee el flag. La URL manda sobre el build para poder probar el camino real en
   un despliegue sin recompilar: ?ia=local lo enciende, ?ia=demo lo apaga. */
export function iaLocalActivada(busqueda = typeof location !== 'undefined' ? location.search : '') {
  const params = new URLSearchParams(busqueda || '');
  const pedido = params.get('ia');
  if (pedido === 'local') return true;
  if (pedido === 'demo') return false;
  return Boolean(import.meta.env && import.meta.env.VITE_IA_LOCAL === 'true');
}
