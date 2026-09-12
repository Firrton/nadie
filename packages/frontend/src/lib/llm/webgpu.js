/* Chequeo de capacidad del equipo (ARQUITECTURA §4.3: "chequeo de capacidad al
   inicio; si no hay WebGPU o memoria suficiente, ofrecer el nivel 2").

   Se hace ANTES de bajar nada. Descubrir que el equipo no puede después de
   bajar 2.3 GB es la peor versión posible de este error.

   QUÉ SE PUEDE SABER Y QUÉ NO: WebGPU no expone la VRAM del equipo, no hay API
   para preguntarlo. Lo que sí expone el adaptador son sus límites, y dos
   importan:

   - `maxBufferSize`: el buffer más grande que se puede reservar. Es el mejor
     PROXY que hay del presupuesto de memoria, y es un proxy, no una medición.
   - `maxStorageBufferBindingSize`: acá está el muro de los celulares. El piso
     del spec son 128 MiB y hay equipos Android que reportan exactamente eso;
     cuando pasa, el runtime falla con "requested=1024MB, limit=128MB" y NO se
     arregla eligiendo un modelo más chico. Es una decisión del navegador, no
     nuestra.

   `gpu` se inyecta para poder probar todo esto sin una GPU: en node no existe
   navigator.gpu, y los casos que importan —no hay WebGPU, el adaptador no
   viene, el equipo está en el piso del spec— son justamente los que no se
   pueden reproducir en la máquina de quien desarrolla. */

const MB = 1024 * 1024;

const SIN_SOPORTE = Object.freeze({
  soportado: false,
  motivo: 'sin-webgpu',
  maxBufferMB: 0,
  maxStorageBindingMB: 0,
});

export async function medirCapacidad({ gpu } = {}) {
  const api = gpu !== undefined ? gpu : typeof navigator !== 'undefined' ? navigator.gpu : null;
  if (!api || typeof api.requestAdapter !== 'function') return SIN_SOPORTE;

  let adaptador;
  try {
    adaptador = await api.requestAdapter();
  } catch (e) {
    /* El navegador puede negarse sin explicar. No se registra el motivo: los
       mensajes del driver traen modelo de GPU y versión, que son huella. */
    return Object.assign({}, SIN_SOPORTE, { motivo: 'adaptador-rechazado' });
  }

  /* Hay WebGPU pero ningún adaptador utilizable. Pasa en máquinas virtuales y
     con GPUs en lista negra del navegador. */
  if (!adaptador) return Object.assign({}, SIN_SOPORTE, { motivo: 'sin-adaptador' });

  const limites = adaptador.limits || {};
  return {
    soportado: true,
    motivo: null,
    maxBufferMB: Math.floor((limites.maxBufferSize || 0) / MB),
    maxStorageBindingMB: Math.floor((limites.maxStorageBufferBindingSize || 0) / MB),
  };
}
