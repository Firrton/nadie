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

  it('avisa cuando descarta, con la cuenta y sin el contenido', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubStorage().set(KEY, JSON.stringify({
      v: 1,
      entries: { '2026-09-11': { value: 4, note: 'algo muy privado' } },
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
    saveMoodLog({ '2026-09-11': { value: 0.7 } });

    loadMoodLog();

    expect(aviso).not.toHaveBeenCalled();
    aviso.mockRestore();
  });

  /* Documenta la divergencia con @nadie/core como hecho ejecutable, no como
     comentario. Si alguien unifica la escala, este test tiene que cambiar —
     y ese es justamente el punto. */
  it('un check-in con la forma de core (score 1-10) hoy se descarta', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubStorage().set(KEY, JSON.stringify({
      v: 1,
      entries: { '2026-09-11': { score: 7, emotions: [], source: 'manual' } },
    }));

    expect(loadMoodLog()).toEqual({});
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
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
