import { describe, expect, it, vi } from 'vitest';
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
