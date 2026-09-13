import { describe, expect, it } from 'vitest';
import { cargarOCrearCuenta } from './cuenta.js';

function storageEnMemoria() {
  const datos = new Map();
  return {
    datos,
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
  };
}

describe('cargarOCrearCuenta', () => {
  /* El permiso lo revoca la MISMA cuenta que lo firmó. Si la cuenta cambiara
     entre sesiones, lo compartido quedaría sin forma de revocarse. */
  it('la segunda vez devuelve la misma cuenta que creó la primera', () => {
    const storage = storageEnMemoria();

    const primera = cargarOCrearCuenta({ storage });
    const segunda = cargarOCrearCuenta({ storage });

    expect(primera.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(segunda.address).toBe(primera.address);
  });

  it('si lo guardado está roto, crea una cuenta nueva en vez de romper', () => {
    const storage = storageEnMemoria();
    storage.setItem('nadie.firma', 'no-es-una-llave');

    expect(cargarOCrearCuenta({ storage }).address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
