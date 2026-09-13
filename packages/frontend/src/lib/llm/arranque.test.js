import { describe, expect, it, vi } from 'vitest';
import { arrancarIA, crearPuertoConRespaldo } from './arranque.js';
import { ESCALERA } from './modelos.js';

const capacidadBuena = { soportado: true, maxBufferMB: 4096, maxStorageBindingMB: 4096 };
const motorFalso = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'ok' } }] }) } } };

describe('arrancarIA', () => {
  it('con equipo capaz devuelve el puerto real', async () => {
    const { modo, modelo, adaptador } = await arrancarIA({
      medir: async () => capacidadBuena,
      crearEngine: async () => motorFalso,
    });

    expect(modo).toBe('local');
    expect(modelo).toBe('Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
    expect(typeof adaptador.cargar).toBe('function');
  });

  /* Sin WebGPU no hay modelo. NO hay guion de respaldo: la app muestra la
     pantalla de sin soporte y el registro de ánimo sigue funcionando. */
  it('sin WebGPU devuelve sin-soporte y ningún puerto', async () => {
    const { modo, puerto, adaptador } = await arrancarIA({
      medir: async () => ({ soportado: false, motivo: 'sin-webgpu' }),
    });

    expect(modo).toBe('sin-soporte');
    expect(puerto).toBeNull();
    expect(adaptador).toBeNull();
  });

  it('con WebGPU pero sin memoria suficiente, también', async () => {
    const { modo, puerto } = await arrancarIA({
      medir: async () => ({ soportado: true, maxBufferMB: 300, maxStorageBindingMB: 4096 }),
    });

    expect(modo).toBe('sin-soporte');
    expect(puerto).toBeNull();
  });

  /* La carga NO arranca sola: la dispara quien compone, después de dibujar. */
  it('no empieza a bajar el modelo por su cuenta', async () => {
    const crearEngine = vi.fn(async () => motorFalso);
    const { adaptador } = await arrancarIA({ medir: async () => capacidadBuena, crearEngine });

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
