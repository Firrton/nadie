/* Traducción entre el turno que dibuja la UI y el ChatMessage de @nadie/core.

   La UI guarda `{ who: 'tú' | 'nadie', text }` porque `who` se imprime tal cual
   en la transcripción: es dato y es presentación a la vez. El contrato de core
   usa `{ role: 'user' | 'assistant', content, at }`.

   Esta frontera existe para que el día que entre WebLLM no haya que tocar las
   pantallas, y para que `who` pueda seguir siendo texto en español sin que eso
   se filtre al protocolo. */

export const QUIEN_USUARIO = 'tú';
export const QUIEN_NADIE = 'nadie';

/* `at` es Timestamp de core: Unix en SEGUNDOS, no milisegundos. Date.now()
   devuelve milisegundos y mandarlo crudo da fechas del año 56000. */
export function ahoraEnSegundos() {
  return Math.floor(Date.now() / 1000);
}

export function turnoAMensaje(turno, at = ahoraEnSegundos()) {
  return {
    role: turno.who === QUIEN_NADIE ? 'assistant' : 'user',
    content: turno.text,
    at,
  };
}

export function mensajeATurno(mensaje) {
  return {
    who: mensaje.role === 'assistant' ? QUIEN_NADIE : QUIEN_USUARIO,
    text: mensaje.content,
  };
}

export function turnosAMensajes(turnos) {
  return turnos.map((t) => turnoAMensaje(t));
}
