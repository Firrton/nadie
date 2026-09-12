/* ¿Se siembra el mes de ejemplo en "Tu camino"?

   Mismo patrón que `iaLocalActivada`: la URL manda y el entorno del build es el
   respaldo. Que la URL gane es a propósito — en un ensayo tiene que poder
   apagarse sin recompilar.

   OJO: el mes sembrado vive en memoria hasta que la persona califica un ánimo.
   Ese guardado incluye los días sembrados, y desde ahí quedan en el dispositivo.
   Por eso esto es solo para el navegador del demo, nunca para la app real. */
export function caminoDeDemoActivado(
  busqueda = typeof location !== 'undefined' ? location.search : '',
  env = import.meta.env || {},
) {
  const pedido = new URLSearchParams(busqueda || '').get('camino');
  if (pedido === 'demo') return true;
  if (pedido === 'real') return false;
  return env.VITE_CAMINO_DEMO === 'true';
}
