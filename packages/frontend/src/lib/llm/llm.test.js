import { describe, expect, it, vi } from 'vitest';
import { crearDemoLLM } from './demo.js';
import {
  QUIEN_NADIE,
  QUIEN_USUARIO,
  ahoraEnSegundos,
  mensajeATurno,
  turnoAMensaje,
  turnosAMensajes,
} from './messages.js';

describe('traducción con el contrato de core', () => {
  it('mapea los dos sentidos sin perder nada', () => {
    const turno = { who: QUIEN_USUARIO, text: 'hoy pesó' };
    const mensaje = turnoAMensaje(turno, 1789000000);

    expect(mensaje).toEqual({ role: 'user', content: 'hoy pesó', at: 1789000000 });
    expect(mensajeATurno(mensaje)).toEqual(turno);
  });

  it('nadie es assistant, no user', () => {
    expect(turnoAMensaje({ who: QUIEN_NADIE, text: 'te escucho' }).role).toBe('assistant');
  });

  /* Timestamp de core son SEGUNDOS. Date.now() da milisegundos y mandarlo
     crudo pondría las conversaciones en el año 56000. */
  it('at va en segundos, no en milisegundos', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1789000000123);

    expect(ahoraEnSegundos()).toBe(1789000000);

    Date.now.mockRestore();
  });

  it('conserva el orden de la conversación', () => {
    const mensajes = turnosAMensajes([
      { who: QUIEN_USUARIO, text: 'uno' },
      { who: QUIEN_NADIE, text: 'dos' },
      { who: QUIEN_USUARIO, text: 'tres' },
    ]);

    expect(mensajes.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(mensajes.map((m) => m.content)).toEqual(['uno', 'dos', 'tres']);
  });
});

describe('el LLM de demo cumple el puerto', () => {
  it('devuelve un ChatMessage con la forma que pide core', async () => {
    const llm = crearDemoLLM({ demora: 0 });
    const [respuesta] = await llm.chat([{ role: 'user', content: 'hola', at: 1 }], []);

    expect(respuesta.role).toBe('assistant');
    expect(typeof respuesta.content).toBe('string');
    expect(respuesta.content.length).toBeGreaterThan(0);
    expect(Number.isInteger(respuesta.at)).toBe(true);
  });

  /* La semántica que core NO fija: chat devuelve SOLO lo nuevo, nunca el
     historial completo. Si un adaptador lo lee al revés, quien agregue el
     resultado duplica toda la conversación anterior — y en silencio. Si esto
     cambia, que se entere acá y no en el demo del domingo. */
  it('devuelve solo lo nuevo, no la conversación entera', async () => {
    const llm = crearDemoLLM({ demora: 0 });
    const historia = [
      { role: 'user', content: 'uno', at: 1 },
      { role: 'assistant', content: 'dos', at: 2 },
      { role: 'user', content: 'tres', at: 3 },
    ];

    const respuesta = await llm.chat(historia, []);

    expect(respuesta).toHaveLength(1);
    expect(respuesta.map((m) => m.content)).not.toContain('uno');
  });

  it('avanza el guion en cada llamada', async () => {
    const llm = crearDemoLLM({ demora: 0 });
    const [a] = await llm.chat([], []);
    const [b] = await llm.chat([], []);

    expect(a.content).not.toBe(b.content);
  });

  it('extract lanza en vez de inventar un objeto que parezca válido', async () => {
    const llm = crearDemoLLM({ demora: 0 });

    await expect(llm.extract([], 'checkin')).rejects.toThrow(/no está implementado/);
  });
});
