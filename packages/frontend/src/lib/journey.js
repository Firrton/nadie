import { moodTint } from './mood.js';

/* Cuánto tiene que moverse el promedio entre quincenas para llamarlo tendencia.
   Era 0.02 sobre un rango de 1 (2%). En la escala 1–10 el rango es 9 unidades,
   así que el equivalente es 0.18; se redondea a 0.2 porque la precisión falsa
   en un umbral elegido a ojo es peor que el número redondo. */
const UMBRAL_TENDENCIA = 0.2;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmt = (d) => d.getDate() + ' ' + MESES[d.getMonth()];

const avg = (arr) => {
  const a = arr.filter((x) => x != null);
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
};

/* Construye todo lo que necesita la pantalla "Tu camino" a partir de 28 valores
   de ánimo (el último es hoy; null = día sin registro).
   Reemplazar por datos reales del almacenamiento local del dispositivo. */
export function buildJourney(values, today = new Date()) {
  const start = new Date(today);
  start.setDate(today.getDate() - (values.length - 1));

  const cells = [];
  const pad = (start.getDay() + 6) % 7; // semana empieza en lunes
  for (let i = 0; i < pad; i++) cells.push({ key: 'pad' + i, empty: true });
  values.forEach((v, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      key: 'd' + i,
      day: d.getDate(),
      bg: moodTint(v),
      border: i === values.length - 1 ? 'var(--accent-a55)' : v == null ? 'var(--surface-1)' : 'transparent',
      color: v == null ? 'var(--dot-inactive)' : 'var(--text-2)',
    });
  });

  const half = Math.floor(values.length / 2);
  const a1 = avg(values.slice(0, half));
  const a2 = avg(values.slice(half));
  const trend =
    a1 == null || a2 == null
      ? 'Todavía es pronto para ver patrones. Sigue hablando.'
      : a2 > a1 + UMBRAL_TENDENCIA
        ? 'Las últimas dos semanas van más arriba que las dos anteriores.'
        : a2 < a1 - UMBRAL_TENDENCIA
          ? 'Las últimas dos semanas vienen más abajo que las anteriores. Ahí está, sin drama.'
          : 'Tu ánimo se ha mantenido estable estas cuatro semanas.';

  const n = values.filter((v) => v != null).length;

  return {
    cells,
    range: fmt(start) + ' — ' + fmt(today),
    patterns: [trend, 'Los días que hablas suelen quedar registrados más arriba que los que no.'],
    hasData: n > 0,
    note:
      n === 0
        ? 'Nada por aquí todavía. Cuando hables, esto se llena solo.'
        : n + ' momentos en 28 días. Nadie los recuerda para que tú no tengas que cargarlos solo.',
  };
}
