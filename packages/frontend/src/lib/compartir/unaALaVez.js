/* Ignora las llamadas mientras la anterior sigue en curso.

   Existe por un bug concreto: dos toques a "Firmar y enviar" antes de que React
   re-dibuje disparaban dos envíos que leían el MISMO nonce on-chain. El segundo
   revertía después de que el relayer pagó gas y el gateway guardó un paquete de
   más. Deshabilitar el botón no alcanza: el segundo toque llega antes del render.

   `fn` tiene que devolver su promesa: es la única forma de saber cuándo terminó.
   Si falla, libera igual, para que se pueda reintentar. */

export function unaALaVez(fn) {
  let enCurso = null;
  return (...args) => {
    if (enCurso) return enCurso;
    enCurso = Promise.resolve()
      .then(() => fn(...args))
      .finally(() => {
        enCurso = null;
      });
    return enCurso;
  };
}
