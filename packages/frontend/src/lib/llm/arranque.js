import { crearEngineWebLLM } from './engine.js';
import { escaleraQueEntra } from './modelos.js';
import { medirCapacidad } from './webgpu.js';
import { crearWebLLM } from './webllm.js';

/* RAÍZ DE COMPOSICIÓN de la inferencia: el único lugar que decide QUÉ puerto usa
   la app. Las pantallas hablan con useNadie, useNadie habla con un LLMPort, y
   cuál es ese puerto se resuelve acá y en ningún otro lado.

   EL MODELO REAL ES EL ÚNICO CAMINO. No hay guion de respaldo: fingir que la
   app piensa cuando no hay modelo sería mentir justo donde la persona se abre.
   Si el equipo no da, se devuelve `puerto: null` y la app muestra la pantalla
   de "sin soporte" — el registro de ánimo sigue entero.

   Las dependencias se inyectan para poder probar las ramas sin GPU. */
export async function arrancarIA({
  medir = medirCapacidad,
  crearEngine = crearEngineWebLLM,
  onProgreso,
} = {}) {
  const capacidad = await medir();
  const posibles = escaleraQueEntra(capacidad);

  /* Vacío NO es un error del chequeo: es la respuesta correcta cuando el equipo
     no da. ARQUITECTURA §4.3 dice ofrecer el nivel 2 (enclave) en ese caso. */
  if (posibles.length === 0) {
    return { puerto: null, modo: 'sin-soporte', capacidad, adaptador: null };
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
