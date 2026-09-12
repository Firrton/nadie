import { describe, expect, it, vi } from 'vitest';
import { MOOD_NEUTRAL, RATING_STEPS, pasoMasCercano } from '../mood.js';
import { entradaDeCheckIn, proponerCheckIn } from './checkin.js';

const puertoQueDevuelve = (salida) => ({ extract: vi.fn(async () => salida) });
const turnos = [{ who: 'tú', text: 'hoy pesó' }];

describe('pasoMasCercano', () => {
  it('lleva cada paso a sí mismo', () => {
    RATING_STEPS.forEach((s) => expect(pasoMasCercano(s.score).score).toBe(s.score));
  });

  it('el 10 —que la UI no ofrece pero core permite— cae en el 9', () => {
    expect(pasoMasCercano(10).score).toBe(9);
  });

  /* Un 2 está a la misma distancia del 1 que del 3. Elegir el 1 sería empujar a
     la persona a un extremo por una lectura de la que el modelo no está seguro. */
  it('los empates van hacia el neutro, no hacia el extremo', () => {
    expect(pasoMasCercano(2).score).toBe(3);
    expect(pasoMasCercano(4).score).toBe(MOOD_NEUTRAL);
    expect(pasoMasCercano(6).score).toBe(MOOD_NEUTRAL);
    expect(pasoMasCercano(8).score).toBe(7);
  });

  it('no inventa un paso para algo que no es número', () => {
    expect(pasoMasCercano('siete')).toBeNull();
    expect(pasoMasCercano(NaN)).toBeNull();
    expect(pasoMasCercano(undefined)).toBeNull();
  });
});

describe('proponerCheckIn', () => {
  it('trae el puntaje del modelo y el círculo que le toca', async () => {
    const puerto = puertoQueDevuelve({ score: 6, emotions: [{ label: 'calma', intensity: 2 }] });

    const p = await proponerCheckIn({ puerto, turnos });

    expect(p).toEqual({ score: 6, paso: 5, emotions: [{ label: 'calma', intensity: 2 }] });
    expect(puerto.extract).toHaveBeenCalledWith(expect.anything(), 'checkin');
  });

  it('le manda al modelo la conversación traducida al contrato de core', async () => {
    const puerto = puertoQueDevuelve({ score: 7, emotions: [] });

    await proponerCheckIn({ puerto, turnos: [{ who: 'tú', text: 'hola' }] });

    expect(puerto.extract.mock.calls[0][0]).toEqual([
      { role: 'user', content: 'hola', at: expect.any(Number) },
    ]);
  });

  /* null NO es un error: es el caso normal con el puerto de demo, con el modelo
     cargando, y con una salida que no validó dos veces. En los tres la pantalla
     de cierre queda igual que siempre. */
  it('devuelve null si el puerto no sabe extraer', async () => {
    expect(await proponerCheckIn({ puerto: {}, turnos })).toBeNull();
    expect(await proponerCheckIn({ puerto: null, turnos })).toBeNull();
  });

  it('devuelve null si extract lanza, sin propagar', async () => {
    const puerto = { extract: async () => { throw new Error('no está implementado'); } };

    await expect(proponerCheckIn({ puerto, turnos })).resolves.toBeNull();
  });

  it('no molesta al modelo si no se habló nada', async () => {
    const puerto = puertoQueDevuelve({ score: 7, emotions: [] });

    expect(await proponerCheckIn({ puerto, turnos: [] })).toBeNull();
    expect(puerto.extract).not.toHaveBeenCalled();
  });
});

describe('entradaDeCheckIn', () => {
  const propuesta = { score: 6, paso: 5, emotions: [{ label: 'calma', intensity: 2 }] };

  it('sin propuesta, la elección es de la persona', () => {
    expect(entradaDeCheckIn(7, null)).toEqual({ score: 7, source: 'manual' });
  });

  it('tocar el círculo sugerido confirma al modelo, y se guardan sus emociones', () => {
    expect(entradaDeCheckIn(5, propuesta)).toEqual({
      score: 5,
      source: 'ai-confirmed',
      emotions: [{ label: 'calma', intensity: 2 }],
    });
  });

  /* Si toca otro círculo, el modelo se equivocó. El registro tiene que decir que
     la elección fue de ella, y las emociones que el modelo leyó para OTRO
     puntaje no tienen por qué viajar con este. */
  it('tocar otro círculo es manual, y no arrastra las emociones del modelo', () => {
    expect(entradaDeCheckIn(9, propuesta)).toEqual({ score: 9, source: 'manual' });
  });
});
