/* Ánimo — el único color de la app.
   Sube => azul. Baja => rojo.

   ESCALA: entero 1–10. Es la misma que `CheckInProposalSchema.score` de
   @nadie/core, a propósito: antes acá era un float 0..1 y un check-in con la
   forma de core se descartaba al entrar.

   EL NEUTRO ES 5, NO 5.5. Cinco círculos no pueden ser simétricos alrededor del
   medio de 1–10: haría falta uno parado en 5.5, y 5.5 no es entero. Así que de
   las dos propiedades —neutro en el medio, cantidad impar de opciones— se
   conserva la segunda y el neutro se corre al 5.

   Se eligió 5 y no 6 (que también funcionaría, con los pasos 2/4/6/8/10) para
   que el PISO de la escala sea alcanzable desde la UI. Quien está en su peor
   día no debería descubrir que todavía hay algo debajo del último botón. El
   precio es que el 10 queda fuera de los cinco pasos, y ese precio se paga
   arriba, no abajo.

   Los cinco pasos son un SUBCONJUNTO de 1–10, no la escala entera: un check-in
   propuesto por el modelo puede traer 6 o 10 y se pinta igual. */

export const MOOD_UP = '#7FA4D4';
export const MOOD_DOWN = '#D26A56';

export const MOOD_MIN = 1;
export const MOOD_MAX = 10;
export const MOOD_NEUTRAL = 5;

/* Brazo más largo desde el neutro hacia abajo (5 - 1). Normaliza la distancia
   al neutro para que los cinco pasos repartan el color parejo. */
const BRAZO = MOOD_NEUTRAL - MOOD_MIN;

export function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
}

/* Fondo translúcido para una celda de calendario o un botón de calificación.

   La comparación con el neutro es exacta porque la escala es de enteros y
   storage.js no deja entrar otra cosa; con el float viejo hacía falta una
   tolerancia de 0.03 que ya no tiene sentido. */
export function moodTint(score, upColor = MOOD_UP, downColor = MOOD_DOWN) {
  if (score == null) return 'transparent';
  if (score === MOOD_NEUTRAL) return 'var(--surface-2)';
  const rgb = hexToRgb(score > MOOD_NEUTRAL ? upColor : downColor);
  /* El tope importa: el brazo de arriba es más largo (10 - 5 = 5), así que un
     10 daría 1.25. El alpha ya está al máximo ahí. */
  const t = Math.min(1, Math.abs(score - MOOD_NEUTRAL) / BRAZO);
  const a = t < 0.2 ? 0.1 : t < 0.45 ? 0.16 : t < 0.7 ? 0.28 : 0.42;
  return 'rgba(' + rgb + ', ' + a + ')';
}

/* Las 5 opciones con las que el usuario califica su día al cerrar la sesión.

   Reparten alphas 0.42 / 0.28 / gris / 0.28 / 0.42. La escala vieja daba
   0.42 / 0.16 / gris / 0.16 / 0.42: los dos círculos del medio casi no se veían
   porque el tramo 0.28 quedaba sin usar. */
export const RATING_STEPS = [
  { score: 1, label: 'Muy abajo' },
  { score: 3, label: 'Abajo' },
  { score: 5, label: 'A medias' },
  { score: 7, label: 'Arriba' },
  { score: 9, label: 'Muy arriba' },
];

/* El paso de RATING_STEPS más cercano a un puntaje cualquiera.

   Hace falta porque el modelo propone en la escala COMPLETA (1–10) y los
   círculos son cinco. Un 6 propuesto no tiene círculo propio.

   LOS EMPATES VAN HACIA EL NEUTRO, y no es un detalle de redondeo: un 2 está a
   la misma distancia del 1 que del 3, y elegir el 1 sería empujar a la persona
   a un extremo por una lectura de la que el propio modelo no está seguro. La
   app no amplifica lo que no sabe. */
export function pasoMasCercano(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;

  return RATING_STEPS.reduce((mejor, paso) => {
    const d = Math.abs(paso.score - score);
    const dMejor = Math.abs(mejor.score - score);
    if (d < dMejor) return paso;
    if (d > dMejor) return mejor;
    // Empate: gana el que esté más cerca del neutro.
    return Math.abs(paso.score - MOOD_NEUTRAL) < Math.abs(mejor.score - MOOD_NEUTRAL) ? paso : mejor;
  });
}
