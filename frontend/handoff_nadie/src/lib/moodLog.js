/* Registro de ánimo — la lógica de tiempo.
   Este módulo no sabe DÓNDE se guarda el registro (eso es storage.js); solo
   sabe cómo se identifica un día y cómo se arma la ventana que dibujan
   "tu semana" y "Tu camino".

   El registro es un mapa por fecha, no un array por posición:

     { '2026-09-11': { value: 0.65, note: '…', at: '…' } }

   Tiene que ser por fecha. Un array posicional asume que el último elemento es
   hoy, y esa suposición se rompe apenas el usuario cierra la app y vuelve otro
   día: el array no sabe que pasó el tiempo. */

/* Clave del día en hora LOCAL.

   OJO: `toISOString().slice(0, 10)` devuelve la fecha en UTC, y eso corrompe el
   registro en silencio. Para alguien en México (UTC-6), una sesión a las 19:00
   del 11 cae en el 12 en UTC — y esta app se usa de noche. La clave se arma con
   getFullYear/getMonth/getDate, que son locales. */
export function dateKey(d = new Date()) {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mes + '-' + dia;
}

/* Los últimos n días terminando hoy. Devuelve valores (o null si ese día no
   quedó registrado), que es lo que esperan MoodCurve, WeekStrip y buildJourney.

   Se camina con setDate, no con aritmética de milisegundos: los días de cambio
   de horario no duran 24h y restar 86400000 los saltea o los repite. */
export function lastNDays(entries, n, today = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const entry = entries[dateKey(d)];
    out.push(entry ? entry.value : null);
  }
  return out;
}

/* Escribe o actualiza el día sin mutar el registro anterior.
   `at` registra cuándo se tocó por última vez — útil para migraciones y para
   saber si una nota es posterior a la calificación. */
export function upsertEntry(entries, key, patch) {
  const next = Object.assign({}, entries);
  next[key] = Object.assign({}, entries[key], patch, { at: new Date().toISOString() });
  return next;
}

/* Convierte una serie de valores consecutivos en entradas con fecha, terminando
   en `endDate`. Lo usa el sembrado de demo (ver useNadie) para transformar el
   array posicional de content.js en un registro con fechas reales. */
export function entriesFromSeries(values, endDate = new Date()) {
  const entries = {};
  values.forEach((value, i) => {
    if (value == null) return;
    const d = new Date(endDate);
    d.setDate(d.getDate() - (values.length - 1 - i));
    entries[dateKey(d)] = { value, at: d.toISOString() };
  });
  return entries;
}
