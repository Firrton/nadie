import { describe, expect, it } from 'vitest';
import { medirCapacidad } from './webgpu.js';

const MB = 1024 * 1024;

const gpuFalsa = (limits) => ({ requestAdapter: async () => ({ limits }) });

describe('medirCapacidad', () => {
  /* El caso más común en el mundo real y el que no se puede reproducir en la
     máquina de quien desarrolla: un navegador sin WebGPU. */
  it('sin navigator.gpu devuelve no soportado, sin lanzar', async () => {
    expect(await medirCapacidad({ gpu: null })).toMatchObject({
      soportado: false,
      motivo: 'sin-webgpu',
    });
  });

  it('con WebGPU pero sin adaptador utilizable tampoco soporta', async () => {
    const capacidad = await medirCapacidad({ gpu: { requestAdapter: async () => null } });

    expect(capacidad).toMatchObject({ soportado: false, motivo: 'sin-adaptador' });
  });

  it('un requestAdapter que lanza no tira la app', async () => {
    const gpu = { requestAdapter: async () => { throw new Error('driver en lista negra'); } };

    expect(await medirCapacidad({ gpu })).toMatchObject({
      soportado: false,
      motivo: 'adaptador-rechazado',
    });
  });

  /* Los mensajes del driver traen modelo de GPU y versión, que son huella.
     No entran al resultado. */
  it('no filtra el mensaje del driver en el motivo', async () => {
    const gpu = { requestAdapter: async () => { throw new Error('NVIDIA RTX 4090 driver 550.1'); } };
    const capacidad = await medirCapacidad({ gpu });

    expect(JSON.stringify(capacidad)).not.toContain('NVIDIA');
  });

  it('convierte los límites del adaptador a MB', async () => {
    const gpu = gpuFalsa({ maxBufferSize: 4096 * MB, maxStorageBufferBindingSize: 2048 * MB });

    expect(await medirCapacidad({ gpu })).toEqual({
      soportado: true,
      motivo: null,
      maxBufferMB: 4096,
      maxStorageBindingMB: 2048,
    });
  });

  it('un adaptador sin límites declarados da 0, no NaN', async () => {
    const capacidad = await medirCapacidad({ gpu: gpuFalsa(undefined) });

    expect(capacidad.maxBufferMB).toBe(0);
    expect(capacidad.maxStorageBindingMB).toBe(0);
  });
});
