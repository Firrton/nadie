import { describe, expect, it, vi } from 'vitest';
import { arrancarIA, iaLocalActivada } from './arranque.js';

const capacidadBuena = { soportado: true, maxBufferMB: 4096, maxStorageBindingMB: 4096 };
const motorFalso = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'ok' } }] }) } } };

describe('iaLocalActivada', () => {
  it('la URL manda: ?ia=local enciende y ?ia=demo apaga', () => {
    expect(iaLocalActivada('?ia=local')).toBe(true);
    expect(iaLocalActivada('?ia=demo')).toBe(false);
  });

  /* REGLAS §5: el demo principal corre con todos los opcionales apagados. */
  it('sin flag queda apagada', () => {
    expect(iaLocalActivada('')).toBe(false);
    expect(iaLocalActivada('?otra=cosa')).toBe(false);
  });
});

describe('arrancarIA', () => {
  it('apagada devuelve el guion de demo, sin tocar la GPU', async () => {
    const medir = vi.fn();
    const { modo, puerto, adaptador } = await arrancarIA({ activado: false, medir });

    expect(modo).toBe('demo');
    expect(adaptador).toBeNull();
    expect(medir).not.toHaveBeenCalled();
    expect(typeof puerto.chat).toBe('function');
  });

  it('encendida y con equipo capaz devuelve el puerto real', async () => {
    const { modo, modelo, adaptador } = await arrancarIA({
      activado: true,
      medir: async () => capacidadBuena,
      crearEngine: async () => motorFalso,
    });

    expect(modo).toBe('local');
    expect(modelo).toBe('Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
    expect(typeof adaptador.cargar).toBe('function');
  });

  /* Una app que no abre es peor que una app que todavía no piensa. */
  it('sin WebGPU cae al demo en vez de romperse', async () => {
    const { modo, puerto } = await arrancarIA({
      activado: true,
      medir: async () => ({ soportado: false, motivo: 'sin-webgpu' }),
    });

    expect(modo).toBe('sin-soporte');
    expect(typeof puerto.chat).toBe('function');
  });

  it('con WebGPU pero sin memoria suficiente, también', async () => {
    const { modo } = await arrancarIA({
      activado: true,
      medir: async () => ({ soportado: true, maxBufferMB: 300, maxStorageBindingMB: 4096 }),
    });

    expect(modo).toBe('sin-soporte');
  });

  /* La carga NO arranca sola: la dispara quien compone, después de dibujar. */
  it('no empieza a bajar el modelo por su cuenta', async () => {
    const crearEngine = vi.fn(async () => motorFalso);
    const { adaptador } = await arrancarIA({ activado: true, medir: async () => capacidadBuena, crearEngine });

    expect(crearEngine).not.toHaveBeenCalled();
    expect(adaptador.estado).toBe('sin-cargar');

    await adaptador.cargar();
    expect(crearEngine).toHaveBeenCalledTimes(1);
  });
});
