import { describe, expect, it, vi } from 'vitest';
import { arrancarIA, crearPuertoConRespaldo, iaLocalActivada } from './arranque.js';
import { ESCALERA } from './modelos.js';

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

/* Que un modelo entre en el presupuesto no garantiza que cargue: un driver que se
   queja, memoria fragmentada, un shard que no baja. Quedarse sin IA por eso sería
   tirar la conversación entera cuando había un modelo más chico esperando. */
describe('respaldo por la escalera', () => {
  const motor = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'ok' } }] }) } } };

  it('si el primero no carga, baja un peldaño solo', async () => {
    const crearEngine = async (id) => {
      if (id === ESCALERA[0].id) throw new Error('sin memoria');
      return motor;
    };
    const a = crearPuertoConRespaldo({ escalera: ESCALERA, crearEngine });

    const r = await a.cargar();

    expect(r.modelo).toBe(ESCALERA[1].id);
    expect(r.descartados).toEqual([ESCALERA[0].id]);
  });

  it('si ninguno carga, lo dice en vez de quedarse callado', async () => {
    const a = crearPuertoConRespaldo({
      escalera: ESCALERA,
      crearEngine: async () => { throw new Error('sin WebGPU'); },
    });

    await expect(a.cargar()).rejects.toThrow(/sin WebGPU/);
    expect(a.descartados).toHaveLength(ESCALERA.length);
  });

  /* useNadie guarda el puerto en un ref la primera vez y nunca vuelve a mirarlo:
     si el respaldo devolviera OTRO objeto, la app seguiría hablándole al que
     falló. Por eso el puerto delega en vez de reemplazarse. */
  it('el puerto es el MISMO objeto antes y después de cargar', async () => {
    const a = crearPuertoConRespaldo({ escalera: ESCALERA, crearEngine: async () => motor });
    const antes = a.puerto;

    await a.cargar();

    expect(a.puerto).toBe(antes);
    await expect(antes.chat([], [])).resolves.toBeTruthy();
  });

  it('antes de cargar, hablarle falla claro en vez de en silencio', async () => {
    const a = crearPuertoConRespaldo({ escalera: ESCALERA, crearEngine: async () => motor });

    await expect(a.puerto.chat([], [])).rejects.toThrow(/todavía no está listo/);
  });

  it('cargar dos veces no vuelve a bajar el modelo', async () => {
    let veces = 0;
    const a = crearPuertoConRespaldo({
      escalera: ESCALERA,
      crearEngine: async () => { veces += 1; return motor; },
    });

    await a.cargar();
    await a.cargar();

    expect(veces).toBe(1);
  });
});
