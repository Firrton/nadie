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
    saveMoodLog({ '2026-09-11': { value: 0.7, note: 'hola' } });

    expect(loadMoodLog()).toEqual({ '2026-09-11': { value: 0.7, note: 'hola' } });
  });

  it('no explota con JSON corrupto', () => {
    stubStorage().set(KEY, '{esto no es json');

    expect(loadMoodLog()).toEqual({});
  });

  it('descarta entradas inválidas y conserva las sanas', () => {
    const data = stubStorage();
    data.set(KEY, JSON.stringify({
      v: 1,
      entries: {
        '2026-09-11': { value: 0.7 },      // ok
        '2026-09-10': { value: 4 },        // fuera de 0..1
        '2026-09-09': { value: 'mucho' },  // no es número
        'ayer': { value: 0.5 },            // clave que no es fecha
        '2026-09-08': { value: 0.5, note: 42 }, // nota que no es texto
      },
    }));

    expect(Object.keys(loadMoodLog())).toEqual(['2026-09-11']);
  });

  it('devuelve {} si localStorage lanza (modo privado)', () => {
    stubStorage({ getItem: () => { throw new Error('denied'); } });

    expect(loadMoodLog()).toEqual({});
  });
});

describe('saveMoodLog', () => {
  it('guarda con versión, para poder migrar después', () => {
    const data = stubStorage();
    saveMoodLog({ '2026-09-11': { value: 0.7 } });

    expect(JSON.parse(data.get(KEY)).v).toBe(1);
  });

  it('devuelve false si no se pudo escribir, sin lanzar', () => {
    stubStorage({ setItem: () => { throw new Error('quota'); } });

    expect(saveMoodLog({ '2026-09-11': { value: 0.7 } })).toBe(false);
  });
});

describe('clearMoodLog', () => {
  it('borra de verdad: después no queda nada que leer', () => {
    saveMoodLog({ '2026-09-11': { value: 0.7, note: 'algo privado' } });
    clearMoodLog();

    expect(loadMoodLog()).toEqual({});
  });
});
