import { describe, expect, it, vi } from 'vitest';
import { EMOTION_LABELS } from '@nadie/core';
import { DEMO_REPLIES, DEMO_USER_LINES } from '../../data/content.js';
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

    expect(out[out.length - 1]).toEqual({ role: 'user', content: 'hola' });
  });

  it('pliega el contexto DENTRO del sistema, no como turnos', () => {
    const out = armarMensajes([{ role: 'user', content: 'hola', at: 1 }], ['le cuesta dormir']);

    // sistema + los ejemplos + el turno: el contexto NO suma un turno propio
    expect(out.filter((m) => m.content === 'le cuesta dormir')).toHaveLength(0);
    expect(out[0].content).toContain('le cuesta dormir');
  });

  /* La palanca más fuerte que existe en un modelo chico: mostrarle cómo suena la
     respuesta correcta pesa más que describírsela. Y sale de content.js, escrito
     por marca — el banco no puede inventar la voz del producto. */
  it('muestra ejemplos de la voz de Nadie, sacados del copy aprobado', () => {
    const out = armarMensajes([{ role: 'user', content: 'hola', at: 1 }], []);
    const asistente = out.filter((m) => m.role === 'assistant').map((m) => m.content);

    expect(asistente.length).toBeGreaterThan(0);
    asistente.forEach((c) => expect(DEMO_REPLIES).toContain(c));
    expect(out.filter((m) => m.role === 'user').map((m) => m.content)).toContain(DEMO_USER_LINES[0]);
  });

  it('los ejemplos van ANTES de lo que dijo la persona, no después', () => {
    const out = armarMensajes([{ role: 'user', content: 'lo real', at: 1 }], []);

    expect(out[out.length - 1].content).toBe('lo real');
  });

  it('no ensucia el sistema cuando no hay contexto', () => {
    expect(armarMensajes([], []) [0].content).toBe(SISTEMA);
    expect(armarMensajes([], ['   ', null])[0].content).toBe(SISTEMA);
  });

  it('define a Nadie como acompañante y no como terapeuta ni reemplazo humano', () => {
    expect(SISTEMA).toContain('You are a private AI companion');
    expect(SISTEMA).toContain('not a therapist, doctor, authority figure');
    expect(SISTEMA).toContain('or replacement for human relationships');
  });

  it('prioriza escuchar y entender antes de dar consejos', () => {
    expect(SISTEMA).toContain('Listen before giving advice');
    expect(SISTEMA).toContain('first try to understand their experience');
    expect(SISTEMA).toContain('Do not automatically turn every problem into advice');
  });

  it('pide respuestas naturales, específicas y conversacionales', () => {
    expect(SISTEMA).toContain('Do not repeatedly use generic phrases');
    expect(SISTEMA).toContain('Respond naturally to the specific details');
    expect(SISTEMA).toContain('Usually use a few sentences');
  });

  it('evita asumir y pregunta cuando algo no está claro', () => {
    expect(SISTEMA).toContain('Do not assume what the user feels, thinks, wants, or intends');
    expect(SISTEMA).toContain('When something is unclear, ask');
  });

  it('protege la autonomía de la persona', () => {
    expect(SISTEMA).toContain("The user's life belongs to the user");
    expect(SISTEMA).toContain('Do not pressure them toward decisions');
    expect(SISTEMA).toContain('so they can make their own choices');
  });

  it('mantiene límites relacionales y no fomenta dependencia', () => {
    expect(SISTEMA).toContain('never encourage emotional dependence');
    expect(SISTEMA).toContain('Never suggest that the user only needs you');
    expect(SISTEMA).toContain('Do not claim to be human, conscious, sentient, in love');
  });

  it('no desalienta las relaciones ni el apoyo humano', () => {
    expect(SISTEMA).toContain('Never discourage them from spending time with friends');
    expect(SISTEMA).toContain('suggest professional support when it is genuinely appropriate');
  });

  it('mantiene los límites de salud mental y prioriza seguridad inmediata', () => {
    expect(SISTEMA).toContain('Do not diagnose mental illnesses');
    expect(SISTEMA).toContain('immediate danger of seriously harming themselves or someone else');
    expect(SISTEMA).toContain('appropriate emergency/crisis support');
  });

  it('solo usa recuerdos entregados y no inventa hechos de la persona', () => {
    expect(SISTEMA).toContain('supplied through memory context');
    expect(SISTEMA).toContain("Do not invent facts about the user's life");
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

  /* Medido en el navegador con el 1.5B: como "body" devolvió la frase de la
     persona, palabra por palabra. Lo que se comparte es un RESUMEN; las palabras
     textuales son lo más íntimo de la conversación y no viajan por accidente. */
  it('el resumen para compartir se pide en tercera persona y sin copiar frases textuales', () => {
    const [, pedido] = armarMensajesDeExtraccion([], 'share-summary', []);

    expect(pedido.content).toContain('tercera persona');
    expect(pedido.content).toContain('No copies frases textuales');
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

describe('techo de tokens y timeout', () => {
  /* Sin techo, un modelo que entra en bucle genera hasta agotar el contexto.
     Observado de verdad: el 1B emitiendo espacios en blanco dentro del JSON. */
  it('le pone techo a las dos tareas, y la extracción tiene más aire', async () => {
    const { motor, adaptador } = armar(CHECKIN_VALIDO);
    await adaptador.cargar();

    await adaptador.puerto.chat([], []);
    await adaptador.puerto.extract([], 'checkin');

    const [chat, extraccion] = motor.pedidos;
    expect(chat.max_tokens).toBeGreaterThan(0);
    expect(extraccion.max_tokens).toBeGreaterThan(chat.max_tokens);
  });

  /* Un abort fatal del runtime de WebGPU NO rechaza la promesa: se queda en el
     aire. Sin esto, useNadie se queda en "processing" para siempre y la persona
     mira un orbe que piensa sin fin. */
  it('una respuesta que nunca llega termina en error, no en espera eterna', async () => {
    vi.useFakeTimers();
    const motor = {
      chat: { completions: { create: () => new Promise(() => {}) } },
    };
    const adaptador = crearWebLLM({ crearEngine: async () => motor });
    await adaptador.cargar();

    const enVuelo = adaptador.puerto.chat([], []);
    const afirmacion = expect(enVuelo).rejects.toThrow(/no respondió/);
    await vi.advanceTimersByTimeAsync(60000);
    await afirmacion;

    vi.useRealTimers();
  });
});

describe('chat', () => {
  /* Probamos frequency_penalty/presence_penalty contra la repetición del 1.5B y
     salió PEOR: el rol cayó de 9/9 a 7/9 y volvieron los portazos. Este test fija
     que NO se manden, para que nadie los reintroduzca creyendo que ayudan. */
  it('no castiga la repetición: medido, empeora al modelo', async () => {
    const { motor, adaptador } = armar(CHECKIN_VALIDO);
    await adaptador.cargar();

    await adaptador.puerto.chat([], []);

    expect(motor.pedidos[0].frequency_penalty).toBeUndefined();
    expect(motor.pedidos[0].presence_penalty).toBeUndefined();
  });

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
    expect(pedido.messages[pedido.messages.length - 1]).toEqual({ role: 'user', content: 'hoy pesó' });
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

    expect(motor.pedidos[0].response_format.type).toBe('json_object');
    expect(motor.pedidos[0].temperature).toBe(0);
  });

  /* `{ type: 'json_object' }` SOLO está roto en web-llm 0.2.85: falla con
     "Cannot pass non-string to std::string". Con schema anda — y además restringe
     el decodificador a la forma real de core, no a "algo que sea JSON". */
  it('manda el esquema, porque sin esquema la 0.2.85 no sabe hacer JSON', async () => {
    const { motor, adaptador } = armar(CHECKIN_VALIDO);
    await adaptador.cargar();

    await adaptador.puerto.extract([], 'checkin');

    const enviado = motor.pedidos[0].response_format.schema;
    expect(typeof enviado).toBe('string');
    expect(JSON.parse(enviado)).toMatchObject({
      type: 'object',
      properties: { score: { type: 'integer', minimum: 1, maximum: 10 } },
    });
  });

  /* El esquema se DERIVA de los Zod de core. Escribirlo a mano sería tener el
     contrato en dos lugares y que se separen sin que nadie se entere. */
  it('las etiquetas de emoción del esquema salen de core, no de una copia', async () => {
    const { motor, adaptador } = armar(CHECKIN_VALIDO);
    await adaptador.cargar();

    await adaptador.puerto.extract([], 'checkin');

    const js = JSON.parse(motor.pedidos[0].response_format.schema);
    expect(js.properties.emotions.items.properties.label.enum).toEqual([...EMOTION_LABELS]);
  });

  it('cada esquema manda el suyo', async () => {
    const { motor, adaptador } = armar('{"x":1}');
    await adaptador.cargar();

    await adaptador.puerto.extract([], 'memory').catch(() => {});
    const js = JSON.parse(motor.pedidos[0].response_format.schema);

    expect(Object.keys(js.properties).sort()).toEqual(
      ['emotions', 'memories', 'pending', 'riskLevel', 'summary', 'themes'],
    );
  });

  /* Observado con el 1B de verdad: devuelve "```\n{...}\n```" aunque se le pida
     lo contrario. Descartar eso sería tirar una salida que estaba bien. */
  it('acepta un JSON envuelto en un bloque de markdown', async () => {
    const { adaptador } = armar('```json\n' + CHECKIN_VALIDO + '\n```');
    await adaptador.cargar();

    const salida = await adaptador.puerto.extract([], 'checkin');

    expect(salida.score).toBe(7);
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

  /* JSON Schema restringe la FORMA, no las reglas: no sabe decir "un string de 3
     a 5 líneas". Medido con el banco, memory daba 0/3 con el 1B Y con el 1.5B —
     los dos fallando igual probó que el problema era nuestro. Se le pide un array,
     que sí se puede exigir, y se une antes de validar. */
  it('a memory le pide el resumen como array de 3 a 5, que el esquema SÍ puede exigir', async () => {
    const { motor, adaptador } = armar('{"x":1}');
    await adaptador.cargar();

    await adaptador.puerto.extract([], 'memory').catch(() => {});
    const js = JSON.parse(motor.pedidos[0].response_format.schema);

    expect(js.properties.summary).toMatchObject({
      type: 'array',
      minItems: 3,
      maxItems: 5,
    });
  });

  it('une las líneas antes de validar, así core recibe lo que su esquema pide', async () => {
    const memoria = JSON.stringify({
      summary: ['Hablaste de un día que pesó.', 'Dijiste que son muchas cosas chicas.', 'Querías soltarlo.'],
      emotions: [{ label: 'cansancio', intensity: 3 }],
      themes: ['trabajo'],
      memories: [],
      pending: [],
      riskLevel: 'bajo',
    });
    const { adaptador } = armar(memoria);
    await adaptador.cargar();

    const salida = await adaptador.puerto.extract([], 'memory');

    expect(typeof salida.summary).toBe('string');
    expect(salida.summary.split('\n')).toHaveLength(3);
    expect(salida.summary).toContain('Hablaste de un día que pesó.');
  });

  /* Si otra versión de la librería ignorara el esquema y devolviera el string,
     tiene que pasar derecho y que lo juzgue Zod, no romperse acá. */
  it('si el modelo igual manda un string, no se rompe', async () => {
    const memoria = JSON.stringify({
      summary: 'Una.\nDos.\nTres.',
      emotions: [],
      themes: ['trabajo'],
      memories: [],
      pending: [],
      riskLevel: 'bajo',
    });
    const { adaptador } = armar(memoria);
    await adaptador.cargar();

    await expect(adaptador.puerto.extract([], 'memory')).resolves.toMatchObject({
      summary: 'Una.\nDos.\nTres.',
    });
  });

  it('valida también los otros dos esquemas de core', async () => {
    const memoria = JSON.stringify({
      summary: ['Hablaste de un día que pesó.', 'Dijiste que son muchas cosas chicas.', 'Quedaste con ganas de soltarlo.'],
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
