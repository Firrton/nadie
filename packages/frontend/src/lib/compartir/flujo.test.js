import { describe, expect, it } from 'vitest';
import { QUIEN_NADIE, QUIEN_USUARIO } from '../llm/messages.js';
import { prepararBorrador } from './flujo.js';

function puertoDePrueba() {
  const pedidos = [];
  return {
    pedidos,
    async extract(transcripcion, esquema) {
      pedidos.push({ transcripcion, esquema });
      return {
        title: 'Semanas de mucho peso',
        body: 'Habló de cansancio.\nLe pesa sentir que molesta.\nDecirlo ayudó.',
        moodTrendIncluded: true,
        /* Fechas inventadas: el modelo no sabe qué día es. */
        dateRange: { from: '1999-01-01', to: '1999-01-02' },
      };
    },
  };
}

const turnos = [
  { who: QUIEN_USUARIO, text: 'hoy todo pesa' },
  { who: QUIEN_NADIE, text: 'te escucho' },
];

const hoy = new Date(2026, 8, 12, 15, 0);

describe('prepararBorrador', () => {
  it('le pide al modelo el resumen para compartir a partir de la conversación', async () => {
    const puerto = puertoDePrueba();

    await prepararBorrador({ puerto, turnos, entradas: {}, hoy });

    expect(puerto.pedidos).toHaveLength(1);
    expect(puerto.pedidos[0].esquema).toBe('share-summary');
    expect(puerto.pedidos[0].transcripcion.map((m) => m.content)).toEqual(['hoy todo pesa', 'te escucho']);
  });

  /* Las fechas son un DATO del dispositivo, no algo que redacta el modelo. */
  it('usa las últimas cuatro semanas del dispositivo, no las fechas del modelo', async () => {
    const { borrador } = await prepararBorrador({ puerto: puertoDePrueba(), turnos, entradas: {}, hoy });

    expect(borrador.dateRange).toEqual({ from: '2026-08-16', to: '2026-09-12' });
  });

  it('el documento lleva solo los días del diario que caen en esas semanas', async () => {
    const entradas = {
      '2026-08-15': { score: 1, at: 1 },
      '2026-08-16': { score: 3, at: 1 },
      '2026-09-12': { score: 7, note: 'hablé con mi hermana', at: 1 },
    };

    const { documento } = await prepararBorrador({ puerto: puertoDePrueba(), turnos, entradas, hoy });

    expect(documento).not.toContain('2026-08-15');
    expect(documento).toContain('2026-08-16  3/10');
    expect(documento).toContain('2026-09-12  7/10  hablé con mi hermana');
    expect(documento).toContain('Le pesa sentir que molesta.');
  });
});
