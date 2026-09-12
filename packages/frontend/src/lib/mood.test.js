import { describe, expect, it } from 'vitest';
import { MOOD_MAX, MOOD_MIN, MOOD_NEUTRAL, RATING_STEPS, moodTint } from './mood.js';

/* Estos tests fijan una DECISIÓN DE PRODUCTO, no una implementación.

   Cinco círculos no pueden ser simétricos alrededor del medio de 1–10 (haría
   falta uno parado en 5.5), así que se eligió neutro entero en 5 y el 10 quedó
   fuera de los pasos. Si alguien mueve el neutro al 6, estos tests tienen que
   cambiar — y ese es el punto: que la decisión duela al revertirse, en vez de
   deshacerse de a un archivo por vez. */

const alpha = (tint) => Number(tint.match(/,\s*([\d.]+)\)$/)[1]);

describe('RATING_STEPS', () => {
  it('son cinco enteros dentro de la escala de core', () => {
    expect(RATING_STEPS).toHaveLength(5);
    RATING_STEPS.forEach((s) => {
      expect(Number.isInteger(s.score)).toBe(true);
      expect(s.score).toBeGreaterThanOrEqual(MOOD_MIN);
      expect(s.score).toBeLessThanOrEqual(MOOD_MAX);
    });
  });

  it('el piso de la escala es alcanzable: el peor día posible se puede decir', () => {
    expect(RATING_STEPS[0].score).toBe(MOOD_MIN);
  });

  it('reparte pasos parejos de 2, con el neutro justo en el medio', () => {
    expect(RATING_STEPS.map((s) => s.score)).toEqual([1, 3, 5, 7, 9]);
    expect(RATING_STEPS[2].score).toBe(MOOD_NEUTRAL);
  });
});

describe('moodTint', () => {
  it('no pinta nada para un día sin registro', () => {
    expect(moodTint(null)).toBe('transparent');
  });

  it('pinta gris en el neutro', () => {
    expect(moodTint(MOOD_NEUTRAL)).toBe('var(--surface-2)');
  });

  it('sube azul y baja rojo', () => {
    expect(moodTint(9)).toContain('127, 164, 212'); // MOOD_UP
    expect(moodTint(1)).toContain('210, 106, 86'); // MOOD_DOWN
  });

  /* La escala vieja daba 0.42 / 0.16 / gris / 0.16 / 0.42: el tramo 0.28 quedaba
     sin usar y los dos círculos del medio casi no se veían. */
  it('los cinco pasos reparten el color parejo, sin saltearse un tramo', () => {
    const alphas = RATING_STEPS
      .filter((s) => s.score !== MOOD_NEUTRAL)
      .map((s) => alpha(moodTint(s.score)));

    expect(alphas).toEqual([0.42, 0.28, 0.28, 0.42]);
  });

  it('es simétrico: la misma distancia al neutro pinta con la misma fuerza', () => {
    expect(alpha(moodTint(3))).toBe(alpha(moodTint(7)));
    expect(alpha(moodTint(1))).toBe(alpha(moodTint(9)));
  });

  /* El brazo de arriba es más largo (10 - 5 = 5 contra 5 - 1 = 4), así que un 10
     se sale del rango normalizado. Sin el tope, el alpha se iría de escala. */
  it('un 10 —que la UI no ofrece pero core permite— no rompe el alpha', () => {
    expect(alpha(moodTint(MOOD_MAX))).toBe(0.42);
  });
});
