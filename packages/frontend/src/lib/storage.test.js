import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMoodLog, loadMoodLog, saveMoodLog } from './storage.js';

const KEY = 'nadie.mood';

/* localStorage de mentira: vitest corre en node, que no lo trae. Se stubea el
   global para poder probar también los casos en los que EXPLOTA — modo privado
   de Safari y cuota llena, que es justo lo que no se ve en desarrollo. */
function stubStorage(overrides = {}) {
  const data = new Map();
  const store = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    ...overrides,
  };
  vi.stubGlobal('localStorage', store);
  return data;
}

beforeEach(() => stubStorage());
afterEach(() => vi.unstubAllGlobals());

describe('loadMoodLog', () => {
  it('devuelve {} cuando no hay nada guardado', () => {
    expect(loadMoodLog()).toEqual({});
  });

  it('lee lo que escribió saveMoodLog', () => {
    saveMoodLog({ '2026-09-11': { score: 7, note: 'hola' } });

    expect(loadMoodLog()).toEqual({ '2026-09-11': { score: 7, note: 'hola' } });
  });

  it('no explota con JSON corrupto', () => {
    stubStorage().set(KEY, '{esto no es json');

    expect(loadMoodLog()).toEqual({});
  });

  it('descarta entradas inválidas y conserva las sanas', () => {
    const data = stubStorage();
    data.set(KEY, JSON.stringify({
      v: 2,
      entries: {
        '2026-09-11': { score: 7 },          // ok
        '2026-09-10': { score: 14 },         // fuera de 1..10
        '2026-09-09': { score: 'mucho' },    // no es número
        '2026-09-07': { score: 6.5 },        // la escala es de enteros
        'ayer': { score: 5 },                // clave que no es fecha
        '2026-09-08': { score: 5, note: 42 }, // nota que no es texto
      },
    }));

    expect(Object.keys(loadMoodLog())).toEqual(['2026-09-11']);
  });

  it('devuelve {} si localStorage lanza (modo privado)', () => {
    stubStorage({ getItem: () => { throw new Error('denied'); } });

    expect(loadMoodLog()).toEqual({});
  });

  it('avisa cuando descarta, con la cuenta y sin el contenido', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubStorage().set(KEY, JSON.stringify({
      v: 2,
      entries: { '2026-09-11': { score: 14, note: 'algo muy privado' } },
    }));

    loadMoodLog();

    expect(aviso).toHaveBeenCalledTimes(1);
    const texto = aviso.mock.calls[0][0];
    expect(texto).toContain('1');
    expect(texto).not.toContain('algo muy privado'); // el contenido nunca sale
    aviso.mockRestore();
  });

  it('no avisa cuando esta todo bien', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    saveMoodLog({ '2026-09-11': { score: 7 } });

    loadMoodLog();

    expect(aviso).not.toHaveBeenCalled();
    aviso.mockRestore();
  });

  /* Era la divergencia con @nadie/core, fijada como test para que doliera al
     resolverla. Ahora afirma lo contrario: la escala quedó unificada y un
     check-in con la forma de core ENTRA. */
  it('acepta un check-in con la forma de core (score 1-10)', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubStorage().set(KEY, JSON.stringify({
      v: 2,
      entries: { '2026-09-11': { score: 7, emotions: [], source: 'manual' } },
    }));

    const registro = loadMoodLog();

    expect(registro['2026-09-11'].score).toBe(7);
    expect(aviso).not.toHaveBeenCalled();
    aviso.mockRestore();
  });

  it('conserva los campos de core que la UI todavía no dibuja', () => {
    stubStorage().set(KEY, JSON.stringify({
      v: 2,
      entries: { '2026-09-11': { score: 7, emotions: [], source: 'ai-confirmed' } },
    }));

    expect(loadMoodLog()['2026-09-11']).toMatchObject({ emotions: [], source: 'ai-confirmed' });
  });
});

describe('migración v1 → v2', () => {
  const guardarV1 = (entries) => stubStorage().set(KEY, JSON.stringify({ v: 1, entries }));

  /* Los cinco floats de la v1 son los únicos que una persona pudo haber
     guardado: rateToday solo recibía valores de RATING_STEPS. Por eso el mapeo
     es exacto y la migración no pierde nada. */
  it('mapea los cinco pasos de la v1 a los cinco de la v2', () => {
    guardarV1({
      '2026-09-07': { value: 0.15 },
      '2026-09-08': { value: 0.35 },
      '2026-09-09': { value: 0.5 },
      '2026-09-10': { value: 0.65 },
      '2026-09-11': { value: 0.85 },
    });

    const registro = loadMoodLog();

    expect([
      registro['2026-09-07'].score,
      registro['2026-09-08'].score,
      registro['2026-09-09'].score,
      registro['2026-09-10'].score,
      registro['2026-09-11'].score,
    ]).toEqual([1, 3, 5, 7, 9]);
  });

  it('no deja el campo viejo dando vueltas', () => {
    guardarV1({ '2026-09-11': { value: 0.65 } });

    expect(loadMoodLog()['2026-09-11'].value).toBeUndefined();
  });

  it('conserva la nota al migrar: es el dato más sensible y no se pierde', () => {
    guardarV1({ '2026-09-11': { value: 0.15, note: 'un día difícil', at: '2026-09-11T20:00:00Z' } });

    expect(loadMoodLog()['2026-09-11']).toMatchObject({
      score: 1,
      note: 'un día difícil',
      at: '2026-09-11T20:00:00Z',
    });
  });

  /* El mes sembrado de demo sí tenía valores intermedios. Caen al paso vecino. */
  it('lleva un valor intermedio al paso más cercano', () => {
    guardarV1({ '2026-09-10': { value: 0.34 }, '2026-09-11': { value: 0.62 } });

    const registro = loadMoodLog();

    expect(registro['2026-09-10'].score).toBe(3);
    expect(registro['2026-09-11'].score).toBe(7);
  });

  it('migrar no es un aviso: nada se descartó', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    guardarV1({ '2026-09-11': { value: 0.65 } });

    loadMoodLog();

    expect(aviso).not.toHaveBeenCalled();
    aviso.mockRestore();
  });

  /* Se migra por FORMA, no por el número de versión: `v` puede venir ausente,
     viejo o mal escrito por otra versión de la app. La forma no puede mentir. */
  it('migra aunque la versión guardada mienta', () => {
    stubStorage().set(KEY, JSON.stringify({ v: 2, entries: { '2026-09-11': { value: 0.85 } } }));

    expect(loadMoodLog()['2026-09-11'].score).toBe(9);
  });

  it('deja intacto lo que ya está en la v2', () => {
    stubStorage().set(KEY, JSON.stringify({ v: 1, entries: { '2026-09-11': { score: 7 } } }));

    expect(loadMoodLog()['2026-09-11'].score).toBe(7);
  });

  it('leer no reescribe: el disco queda como estaba', () => {
    const data = stubStorage();
    data.set(KEY, JSON.stringify({ v: 1, entries: { '2026-09-11': { value: 0.65 } } }));
    const antes = data.get(KEY);

    loadMoodLog();

    expect(data.get(KEY)).toBe(antes);
  });
});

describe('saveMoodLog', () => {
  it('guarda con versión, para poder migrar después', () => {
    const data = stubStorage();
    saveMoodLog({ '2026-09-11': { score: 7 } });

    expect(JSON.parse(data.get(KEY)).v).toBe(2);
  });

  it('devuelve false si no se pudo escribir, sin lanzar', () => {
    stubStorage({ setItem: () => { throw new Error('quota'); } });

    expect(saveMoodLog({ '2026-09-11': { score: 7 } })).toBe(false);
  });
});

describe('clearMoodLog', () => {
  it('borra de verdad: después no queda nada que leer', () => {
    saveMoodLog({ '2026-09-11': { score: 7, note: 'algo privado' } });
    clearMoodLog();

    expect(loadMoodLog()).toEqual({});
  });
});
