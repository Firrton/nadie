import { describe, expect, it } from 'vitest';
import { caminoDeDemoActivado } from './caminoDeDemo.js';

describe('caminoDeDemoActivado', () => {
  it('se activa con ?camino=demo', () => {
    expect(caminoDeDemoActivado('?camino=demo', {})).toBe(true);
  });

  /* El mes sembrado ESCRIBE en el dispositivo: sin pedirlo, nunca. */
  it('sin pedirlo, queda apagado', () => {
    expect(caminoDeDemoActivado('', {})).toBe(false);
    expect(caminoDeDemoActivado('?ia=local', {})).toBe(false);
  });

  it('también se puede prender desde el entorno del build', () => {
    expect(caminoDeDemoActivado('', { VITE_CAMINO_DEMO: 'true' })).toBe(true);
  });

  /* La URL gana: en el ensayo tiene que poder apagarse sin recompilar. */
  it('?camino=real lo apaga aunque el entorno lo prenda', () => {
    expect(caminoDeDemoActivado('?camino=real', { VITE_CAMINO_DEMO: 'true' })).toBe(false);
  });
});
