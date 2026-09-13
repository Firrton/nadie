import { describe, expect, it } from 'vitest';
import { armarDocumento } from './documento.js';

const borrador = {
  title: 'Semanas de mucho peso',
  body: 'Habló de cansancio acumulado.\nLo que más pesa es sentir que molesta.\nDecirlo en voz alta ayudó.',
  moodTrendIncluded: true,
  dateRange: { from: '2026-08-16', to: '2026-09-12' },
};

describe('armarDocumento', () => {
  /* El portal de la psicóloga muestra el texto descifrado tal cual: tiene que
     leerse bien sin que nadie lo interprete. */
  it('lleva el título, el período y el resumen aprobado', () => {
    const texto = armarDocumento({ borrador, entradas: {} });

    expect(texto).toContain('Semanas de mucho peso');
    expect(texto).toContain('2026-08-16 a 2026-09-12');
    expect(texto).toContain('Lo que más pesa es sentir que molesta.');
  });

  it('suma el diario de ánimo en orden de fecha, con puntaje y nota', () => {
    const entradas = {
      '2026-09-12': { score: 7, note: 'hablé con mi hermana', at: 1 },
      '2026-09-10': { score: 3, at: 1 },
    };

    const texto = armarDocumento({ borrador, entradas });

    const diez = texto.indexOf('2026-09-10  3/10');
    const doce = texto.indexOf('2026-09-12  7/10  hablé con mi hermana');
    expect(diez).toBeGreaterThan(-1);
    expect(doce).toBeGreaterThan(diez);
  });

  it('sin registros, no inventa una sección de diario vacía', () => {
    expect(armarDocumento({ borrador, entradas: {} })).not.toContain('Diario de ánimo');
  });
});
