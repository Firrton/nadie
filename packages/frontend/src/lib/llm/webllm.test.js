import { describe, expect, it, vi } from 'vitest';
import { EMOTION_LABELS } from '@nadie/core';
import { MODELO_POR_DEFECTO, crearWebLLM } from './webllm.js';
import { SISTEMA, armarMensajes, armarMensajesDeExtraccion } from './prompt.js';

/* Motor de mentira. Existe para que el 100% de la lógica nuestra —prompt,
   semántica de chat, validación, reintento— se pruebe SIN bajar 2 GB ni tener
   WebGPU. Lo único que estos tests no cubren es el motor real de WebLLM, y eso
   es un e2e aparte, a propósito: el suite por defecto no puede depender de una
   descarga. */
function motorFalso(respuestas) {
  const pedidos = [];
  const cola = Array.isArray(respuestas) ? [...respuestas] : [respuestas];
  return {
    pedidos,
    chat: {
      completions: {
        create: async (pedido) => {
          pedidos.push(pedido);
          const siguiente = cola.length > 1 ? cola.shift() : cola[0];
          if (siguiente instanceof Error) throw siguiente;
          return { choices: [{ message: { content: siguiente } }] };
        },
      },
    },
  };
}

const CHECKIN_VALIDO = JSON.stringify({
  score: 7,
  emotions: [{ label: 'calma', intensity: 2 }],
});

function armar(respuestas, extra = {}) {
  const motor = motorFalso(respuestas);
  const adaptador = crearWebLLM({ crearEngine: async () => motor, ...extra });
  return { motor, adaptador };
}

describe('armarMensajes', () => {
  it('pone el prompt de sistema adelante de todo', () => {
    const out = armarMensajes([{ role: 'user', content: 'hola', at: 1 }], []);

    expect(out[0].role).toBe('system');
    expect(out[0].content).toBe(SISTEMA);
  });

  /* `at` es Timestamp de core: le sirve a la app, no al modelo. Las APIs
     compatibles con OpenAI esperan solo role y content. */
  it('saca el `at` antes de mandarlo al modelo', () => {
    const out = armarMensajes([{ role: 'user', content: 'hola', at: 1789000000 }], []);

    expect(out[1]).toEqual({ role: 'user', content: 'hola' });
  });

  it('pliega el contexto DENTRO del sistema, no como turnos', () => {
    const out = armarMensajes([{ role: 'user', content: 'hola', at: 1 }], ['le cuesta dormir']);

    expect(out).toHaveLength(2); // sistema + el turno, nada más
    expect(out[0].content).toContain('le cuesta dormir');
  });

  it('no ensucia el sistema cuando no hay contexto', () => {
    expect(armarMensajes([], []) [0].content).toBe(SISTEMA);
    expect(armarMensajes([], ['   ', null])[0].content).toBe(SISTEMA);
  });

  it('el prompt prohíbe explícitamente diagnosticar y aconsejar salud', () => {
    expect(SISTEMA).toContain('No diagnosticas');
    expect(SISTEMA).toContain('No das consejos de salud');
    expect(SISTEMA).toContain('No desalientas la ayuda profesional');
  });
});

describe('armarMensajesDeExtraccion', () => {
  it('le pasa al modelo las etiquetas de emoción que core acepta', () => {
    const [, pedido] = armarMensajesDeExtraccion([], 'checkin', EMOTION_LABELS);

    expect(pedido.content).toContain('alegría');
    expect(pedido.content).toContain('soledad');
  });

  it('lanza ante un esquema que no conoce', () => {
    expect(() => armarMensajesDeExtraccion([], 'inventado', [])).toThrow(/no hay instrucciones/);
  });
});

describe('el motor se inyecta', () => {
  it('sin crearEngine no se construye: el adaptador no importa WebLLM', () => {
    expect(() => crearWebLLM({})).toThrow(/crearEngine/);
  });

  it('usa el modelo por defecto y deja cambiarlo', () => {
    expect(armar('x').adaptador.modelo).toBe(MODELO_POR_DEFECTO);
    expect(armar('x', { modelo: 'otro' }).adaptador.modelo).toBe('otro');
  });
});

describe('la carga vive afuera del puerto', () => {
  it('arranca sin cargar y llega a listo', async () => {
    const { adaptador } = armar('hola');

    expect(adaptador.estado).toBe('sin-cargar');
    await adaptador.cargar();
    expect(adaptador.estado).toBe('listo');
  });

  it('pasa el modelo y el callback de progreso al motor', async () => {
    const crearEngine = vi.fn(async () => motorFalso('x'));
    const onProgreso = () => {};
    const adaptador = crearWebLLM({ crearEngine, modelo: 'Un-Modelo', onProgreso });

    await adaptador.cargar();

    expect(crearEngine).toHaveBeenCalledWith('Un-Modelo', { initProgressCallback: onProgreso });
  });

  /* Dos pantallas pidiendo cargar no pueden disparar dos descargas de 2 GB. */
  it('cargas concurrentes comparten una sola descarga', async () => {
    const crearEngine = vi.fn(async () => motorFalso('x'));
    const adaptador = crearWebLLM({ crearEngine });

    await Promise.all([adaptador.cargar(), adaptador.cargar(), adaptador.cargar()]);
    await adaptador.cargar();

    expect(crearEngine).toHaveBeenCalledTimes(1);
  });

  it('deja el estado en error si la carga falla, y lo deja reintentar', async () => {
    let falla = true;
    const adaptador = crearWebLLM({
      crearEngine: async () => {
        if (falla) throw new Error('sin WebGPU');
        return motorFalso('ok');
      },
    });

    await expect(adaptador.cargar()).rejects.toThrow(/sin WebGPU/);
    expect(adaptador.estado).toBe('error');

    falla = false;
    await adaptador.cargar();
    expect(adaptador.estado).toBe('listo');
  });

  /* Cargar solo no puede ser silencioso: si chat cargara por su cuenta, la
     persona esperaría minutos sin barra de progreso ni forma de saber qué pasa. */
  it('chat falla fuerte antes de cargar, en vez de cargar por su cuenta', async () => {
    const { adaptador } = armar('hola');

    await expect(adaptador.puerto.chat([], [])).rejects.toThrow(/todavía no está listo/);
  });
});

describe('chat', () => {
  it('devuelve SOLO lo nuevo, con la forma de ChatMessage', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1789000000123);
    const { adaptador } = armar('Te escucho.');
    await adaptador.cargar();

    const respuesta = await adaptador.puerto.chat(
      [
        { role: 'user', content: 'uno', at: 1 },
        { role: 'assistant', content: 'dos', at: 2 },
        { role: 'user', content: 'tres', at: 3 },
      ],
      [],
    );

    expect(respuesta).toEqual([{ role: 'assistant', content: 'Te escucho.', at: 1789000000 }]);
    Date.now.mockRestore();
  });

  it('le manda al modelo el prompt de sistema y la conversación entera', async () => {
    const { motor, adaptador } = armar('ok');
    await adaptador.cargar();

    await adaptador.puerto.chat([{ role: 'user', content: 'hoy pesó', at: 1 }], ['le cuesta dormir']);

    const [pedido] = motor.pedidos;
    expect(pedido.stream).toBe(false);
    expect(pedido.messages[0].role).toBe('system');
    expect(pedido.messages[0].content).toContain('le cuesta dormir');
    expect(pedido.messages[1]).toEqual({ role: 'user', content: 'hoy pesó' });
  });

  it('una respuesta vacía es un error, no un turno en blanco', async () => {
    const { adaptador } = armar('   ');
    await adaptador.cargar();

    await expect(adaptador.puerto.chat([], [])).rejects.toThrow(/vacía/);
  });
});

describe('extract', () => {
  it('devuelve lo que el esquema de core validó, ya parseado', async () => {
    const { adaptador } = armar(CHECKIN_VALIDO);
    await adaptador.cargar();

    const salida = await adaptador.puerto.extract([{ role: 'user', content: 'hoy pesó', at: 1 }], 'checkin');

    expect(salida).toEqual({ score: 7, emotions: [{ label: 'calma', intensity: 2 }] });
  });

  it('pide JSON y arranca determinista', async () => {
    const { motor, adaptador } = armar(CHECKIN_VALIDO);
    await adaptador.cargar();

    await adaptador.puerto.extract([], 'checkin');

    expect(motor.pedidos[0].response_format).toEqual({ type: 'json_object' });
    expect(motor.pedidos[0].temperature).toBe(0);
  });

  it('descarta lo que no cumple el esquema y reintenta una vez (REGLAS §5)', async () => {
    const { motor, adaptador } = armar([JSON.stringify({ score: 77 }), CHECKIN_VALIDO]);
    await adaptador.cargar();

    const salida = await adaptador.puerto.extract([], 'checkin');

    expect(salida.score).toBe(7);
    expect(motor.pedidos).toHaveLength(2);
  });

  /* Reintentar con temperature 0 devuelve EXACTAMENTE la misma respuesta: el
     reintento de REGLAS §5 sería puro teatro. Por eso el segundo intento sube. */
  it('el reintento sube la temperatura, si no no es un reintento', async () => {
    const { motor, adaptador } = armar(['no soy json', CHECKIN_VALIDO]);
    await adaptador.cargar();

    await adaptador.puerto.extract([], 'checkin');

    expect(motor.pedidos[0].temperature).toBe(0);
    expect(motor.pedidos[1].temperature).toBeGreaterThan(0);
  });

  it('se rinde tras dos intentos en vez de devolver algo sin validar', async () => {
    const { motor, adaptador } = armar('{"score": 77}');
    await adaptador.cargar();

    await expect(adaptador.puerto.extract([], 'checkin')).rejects.toThrow(/2 intentos/);
    expect(motor.pedidos).toHaveLength(2);
  });

  /* La misma regla que ya cumple loadMoodLog: lo más sensible de la app no
     puede terminar en la consola de nadie, y un mensaje de error es consola. */
  it('el error NO lleva ni la salida del modelo ni la transcripción', async () => {
    const { adaptador } = armar('{"score": 77, "secreto": "algo muy privado"}');
    await adaptador.cargar();

    const transcripcion = [{ role: 'user', content: 'lo que dije en voz baja', at: 1 }];
    const error = await adaptador.puerto
      .extract(transcripcion, 'checkin')
      .catch((e) => e);

    expect(error.message).not.toContain('algo muy privado');
    expect(error.message).not.toContain('lo que dije en voz baja');
    expect(error.message).not.toContain('77');
  });

  it('un esquema desconocido no llega ni a hablar con el modelo', async () => {
    const { motor, adaptador } = armar(CHECKIN_VALIDO);
    await adaptador.cargar();

    await expect(adaptador.puerto.extract([], 'inventado')).rejects.toThrow(/esquema desconocido/);
    expect(motor.pedidos).toHaveLength(0);
  });

  it('valida también los otros dos esquemas de core', async () => {
    const memoria = JSON.stringify({
      summary: 'Hablaste de un día que pesó.\nDijiste que son muchas cosas chicas.\nQuedaste con ganas de soltarlo.',
      emotions: [{ label: 'cansancio', intensity: 3 }],
      themes: ['trabajo'],
      memories: [{ type: 'tema', content: 'la carga del trabajo' }],
      pending: [],
      riskLevel: 'bajo',
    });
    const { adaptador } = armar(memoria);
    await adaptador.cargar();

    const salida = await adaptador.puerto.extract([], 'memory');

    expect(salida.riskLevel).toBe('bajo');
    expect(salida.themes).toEqual(['trabajo']);
  });
});
