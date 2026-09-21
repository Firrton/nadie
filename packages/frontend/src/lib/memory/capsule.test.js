import { describe, expect, it, vi } from 'vitest';
import { incorporarResumen } from './capsule.js';

const resumen = (texto) => ({
  important: [texto],
  people: [],
  openLoops: [],
  recentChanges: [],
});

describe('incorporarResumen', () => {
  it('mantiene uno o dos resúmenes como pendientes', async () => {
    const consolidar = vi.fn();
    const primero = await incorporarResumen(
      { capsula: null, pendientes: [] },
      resumen('sesión 1'),
      consolidar,
    );
    const segundo = await incorporarResumen(primero, resumen('sesión 2'), consolidar);

    expect(segundo).toEqual({
      capsula: null,
      pendientes: [resumen('sesión 1'), resumen('sesión 2')],
    });
    expect(consolidar).not.toHaveBeenCalled();
  });

  it('consolida al llegar al tercer resumen y vacía los pendientes', async () => {
    const anterior = resumen('memoria anterior');
    const nueva = resumen('memoria consolidada');
    const consolidar = vi.fn().mockResolvedValue(nueva);
    const estado = {
      capsula: anterior,
      pendientes: [resumen('sesión 1'), resumen('sesión 2')],
    };

    const resultado = await incorporarResumen(estado, resumen('sesión 3'), consolidar);

    expect(consolidar).toHaveBeenCalledWith({
      anterior,
      sesiones: [resumen('sesión 1'), resumen('sesión 2'), resumen('sesión 3')],
    });
    expect(resultado).toEqual({ capsula: nueva, pendientes: [] });
    expect(estado.pendientes).toHaveLength(2);
  });
});
