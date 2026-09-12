import { describe, expect, it } from 'vitest';
import { dateKey, entriesFromSeries, lastNDays, upsertEntry } from './moodLog.js';

/* Estos tests corren con TZ=America/Mexico_City (ver el script "test" en
   package.json). La zona importa: es el mercado principal y está en UTC-6, que
   es justo donde se rompe la fecha si se usa UTC. */

describe('dateKey', () => {
  it('usa la fecha LOCAL, no la UTC', () => {
    // 01:00 UTC del 12 = 19:00 local del 11. La app se usa de noche.
    const d = new Date('2026-09-12T01:00:00Z');

    expect(dateKey(d)).toBe('2026-09-11');
    // Y este es el bug que evitamos: UTC lo archivaría un día adelante.
    expect(d.toISOString().slice(0, 10)).toBe('2026-09-12');
  });

  it('rellena mes y día a dos dígitos', () => {
    expect(dateKey(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });
});

describe('lastNDays', () => {
  const hoy = new Date(2026, 8, 11, 12); // 11 sep 2026, mediodía local

  it('devuelve n valores y el último es hoy', () => {
    const entries = { '2026-09-11': { score: 9 }, '2026-09-10': { score: 3 } };
    const out = lastNDays(entries, 28, hoy);

    expect(out).toHaveLength(28);
    expect(out[27]).toBe(9);
    expect(out[26]).toBe(3);
  });

  it('pone null en los días sin registro', () => {
    expect(lastNDays({}, 7, hoy).every((v) => v === null)).toBe(true);
  });

  it('cruza el fin de mes sin saltearse días', () => {
    const primeroDeMes = new Date(2026, 8, 1, 12);
    const entries = { '2026-08-31': { score: 5 } };
    const out = lastNDays(entries, 2, primeroDeMes);

    expect(out).toEqual([5, null]);
  });

  it('la ventana se desplaza sola al pasar los días', () => {
    const entries = { '2026-09-11': { score: 9 } };
    // Tres días después, ese valor ya no es "hoy": queda 3 posiciones atrás.
    const out = lastNDays(entries, 28, new Date(2026, 8, 14, 12));

    expect(out[27]).toBeNull();
    expect(out[24]).toBe(9);
  });
});

describe('upsertEntry', () => {
  it('no muta el registro anterior', () => {
    const antes = { '2026-09-10': { score: 3 } };
    const despues = upsertEntry(antes, '2026-09-11', { score: 7 });

    expect(antes['2026-09-11']).toBeUndefined();
    expect(despues['2026-09-11'].score).toBe(7);
    expect(despues['2026-09-10']).toEqual({ score: 3 });
  });

  it('conserva la nota al recalificar el mismo día', () => {
    const antes = upsertEntry({}, '2026-09-11', { score: 5, note: 'algo' });
    const despues = upsertEntry(antes, '2026-09-11', { score: 9 });

    expect(despues['2026-09-11']).toMatchObject({ score: 9, note: 'algo' });
  });
});

describe('entriesFromSeries', () => {
  it('mapea la serie a días consecutivos terminando en endDate', () => {
    const out = entriesFromSeries([3, 5, 7], new Date(2026, 8, 11, 12));

    expect(Object.keys(out).sort()).toEqual(['2026-09-09', '2026-09-10', '2026-09-11']);
    expect(out['2026-09-11'].score).toBe(7);
  });

  it('saltea los nulls en vez de guardarlos', () => {
    const out = entriesFromSeries([3, null, 7], new Date(2026, 8, 11, 12));

    expect(out['2026-09-10']).toBeUndefined();
    expect(Object.keys(out)).toHaveLength(2);
  });
});
