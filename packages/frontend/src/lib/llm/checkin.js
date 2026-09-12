import { pasoMasCercano } from '../mood.js';
import { turnosAMensajes } from './messages.js';

/* El check-in propuesto por el modelo (ARQUITECTURA §6: "manual o propuesto por
   la IA y CONFIRMADO"). Esta capa arma la propuesta; NADIE la guarda hasta que
   la persona toca un círculo.

   Es la pieza que conecta todo lo demás: hasta acá, extract existía, validaba
   contra los esquemas de core y no lo llamaba nadie.

   DEVOLVER null NO ES UN ERROR. Es el caso normal en tres situaciones: el
   puerto de demo (cuyo extract lanza a propósito), el modelo todavía cargando,
   y una salida que no validó dos veces seguidas. En las tres, la pantalla de
   cierre queda EXACTAMENTE como hoy y la persona califica a mano.

   Ese silencio es defendible acá y no lo sería en el chat: cuando alguien
   espera una respuesta, el silencio es una falla visible y necesita copy. Una
   propuesta que no llega no se ve — lo que la persona ve es la pantalla de
   siempre, completa. */
export async function proponerCheckIn({ puerto, turnos }) {
  if (!puerto || typeof puerto.extract !== 'function') return null;
  if (!Array.isArray(turnos) || turnos.length === 0) return null;

  let propuesta;
  try {
    propuesta = await puerto.extract(turnosAMensajes(turnos), 'checkin');
  } catch (e) {
    return null;
  }
  if (!propuesta) return null;

  const paso = pasoMasCercano(propuesta.score);
  if (!paso) return null;

  return {
    /* Lo que dijo el modelo, sin redondear: sirve para entender después por qué
       se sugirió ese círculo. */
    score: propuesta.score,
    /* El círculo que se va a resaltar. */
    paso: paso.score,
    emotions: propuesta.emotions || [],
  };
}

/* Qué se guarda cuando la persona toca un círculo.

   `source` viene del CheckIn de core y hasta ahora no significaba nada. Acá
   empieza a significar: 'ai-confirmed' SOLO si la persona confirmó justo el
   círculo que el modelo sugirió. Si toca otro, el modelo se equivocó y el
   registro tiene que decir que la elección fue de ella.

   Las emociones viajan solo con la confirmación, por lo mismo: son las que el
   modelo leyó para ESE puntaje. */
export function entradaDeCheckIn(score, propuesta) {
  const confirmada = propuesta && propuesta.paso === score;
  if (!confirmada) return { score, source: 'manual' };
  return { score, source: 'ai-confirmed', emotions: propuesta.emotions };
}
