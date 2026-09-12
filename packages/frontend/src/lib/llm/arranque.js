import { crearDemoLLM } from './demo.js';
import { crearEngineWebLLM } from './engine.js';
import { elegirModelo } from './modelos.js';
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
  const elegido = elegirModelo(capacidad);

  /* null NO es un error del chequeo: es la respuesta correcta cuando el equipo
     no da. ARQUITECTURA §4.3 dice ofrecer el nivel 2 (enclave) en ese caso, y
     esa pantalla todavía no existe. */
  if (!elegido) {
    return { puerto: crearDemo(), modo: 'sin-soporte', capacidad, adaptador: null };
  }

  const adaptador = crearWebLLM({ crearEngine, modelo: elegido.id, onProgreso });
  return { puerto: adaptador.puerto, modo: 'local', modelo: elegido.id, capacidad, adaptador };
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
