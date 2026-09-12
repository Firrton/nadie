/* Ánimo — el único color de la app.
   Sube => azul. Baja => rojo. Valores normalizados 0..1, con 0.5 = neutro. */

export const MOOD_UP = '#7FA4D4';
export const MOOD_DOWN = '#D26A56';

export function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
}

/* Fondo translúcido para una celda de calendario o un botón de calificación. */
export function moodTint(v, upColor = MOOD_UP, downColor = MOOD_DOWN) {
  if (v == null) return 'transparent';
  if (Math.abs(v - 0.5) < 0.03) return 'var(--surface-2)';
  const rgb = hexToRgb(v >= 0.5 ? upColor : downColor);
  const t = Math.abs(v - 0.5) * 2;
  const a = t < 0.2 ? 0.1 : t < 0.45 ? 0.16 : t < 0.7 ? 0.28 : 0.42;
  return 'rgba(' + rgb + ', ' + a + ')';
}

/* Las 5 opciones con las que el usuario califica su día al cerrar la sesión. */
export const RATING_STEPS = [
  { value: 0.15, label: 'Muy abajo' },
  { value: 0.35, label: 'Abajo' },
  { value: 0.5, label: 'A medias' },
  { value: 0.65, label: 'Arriba' },
  { value: 0.85, label: 'Muy arriba' },
];
