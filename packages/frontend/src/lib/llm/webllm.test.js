import { describe, expect, it, vi } from 'vitest';
import { EMOTION_LABELS } from '@nadie/core';
import { EJEMPLOS_CONVERSACION, LINEA_DE_CRISIS, LINEA_DE_ESCUCHA, LINEA_DE_LIMITE, LINEA_DE_SEGUIMIENTO } from '../../data/content.js';
import { MODELO_POR_DEFECTO, crearWebLLM } from './webllm.js';
import { MODOS } from './modos.js';
import {
  PRESUPUESTO_HISTORIAL,
  PROMPTS,
  SISTEMA,
  SISTEMA_EXTRACCION,
  armarMensajes,
  armarMensajesDeExtraccion,
} from './prompt.js';
import { cumpleCrisis, nombraMedicamento } from './salvaguardas.js';

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

const turno = (role, content) => ({ role, content, at: 1 });

describe('armarMensajes', () => {
  it('pone el prompt del modo adelante de todo; sin pedido, escucha', () => {
    const out = armarMensajes([turno('user', 'hola')], []);

    expect(out[0].role).toBe('system');
    expect(out[0].content).toBe(PROMPTS[MODOS.ESCUCHAR]);
    expect(SISTEMA).toBe(PROMPTS[MODOS.ESCUCHAR]);
  });

  /* Medido el 21-sep: el 1.5B no sabe cuándo aconsejar y cuándo no. Lo decide
     el código (modos.js) y el modelo recibe una sola tarea. */
  it.each([
    ['¿Qué hago con mi jefe?', MODOS.PENSAR],
    ['¿Crees que tengo depresión?', MODOS.LIMITE],
    ['Ya no quiero seguir viviendo.', MODOS.CRISIS],
  ])('elige el prompt según lo que dijo la persona: %s', (texto, modo) => {
    expect(armarMensajes([turno('user', texto)], [])[0].content).toBe(PROMPTS[modo]);
  });

  it('acepta un modo explícito', () => {
    expect(armarMensajes([turno('user', 'hola')], [], MODOS.PENSAR)[0].content).toBe(PROMPTS[MODOS.PENSAR]);
  });

  /* `at` es Timestamp de core: le sirve a la app, no al modelo. Las APIs
     compatibles con OpenAI esperan solo role y content. */
  it('saca el `at` antes de mandarlo al modelo', () => {
    const out = armarMensajes([{ role: 'user', content: 'hola', at: 1789000000 }], []);

    expect(out[out.length - 1]).toEqual({ role: 'user', content: 'hola' });
  });

  it('pliega el contexto DENTRO del sistema, no como turnos', () => {
    const out = armarMensajes([turno('user', 'hola')], ['le cuesta dormir']);

    expect(out.filter((m) => m.content === 'le cuesta dormir')).toHaveLength(0);
    expect(out[0].content).toContain('le cuesta dormir');
    expect(out[0].content.startsWith(PROMPTS[MODOS.ESCUCHAR])).toBe(true);
  });

  /* Un ejemplo que aconseja, mostrado mientras se le pide escuchar, le enseña
     al modelo lo contrario de lo que dice el prompt. */
  it('muestra solo el ejemplo del modo elegido', () => {
    const ejemploDe = (modo) => EJEMPLOS_CONVERSACION.filter((e) => e.modo === modo).flatMap((e) => [
      { role: 'user', content: e.user },
      { role: 'assistant', content: e.assistant },
    ]);

    expect(armarMensajes([turno('user', 'hola')], []).slice(1, -1)).toEqual(ejemploDe(MODOS.ESCUCHAR));
    expect(armarMensajes([turno('user', '¿Qué hago?')], []).slice(1, -1)).toEqual(ejemploDe(MODOS.PENSAR));
    expect(armarMensajes([turno('user', 'Quiero hacerme daño.')], [])).toHaveLength(2);
  });

  it('hay un ejemplo para escuchar y otro para pensar, y ninguno más', () => {
    expect(EJEMPLOS_CONVERSACION.map((e) => e.modo).sort()).toEqual([MODOS.ESCUCHAR, MODOS.PENSAR]);
  });

  it('los ejemplos van ANTES de lo que dijo la persona, no después', () => {
    const out = armarMensajes([turno('user', 'lo real')], []);

    expect(out[out.length - 1].content).toBe('lo real');
  });

  it('no ensucia el sistema cuando no hay contexto', () => {
    expect(armarMensajes([], [])[0].content).toBe(SISTEMA);
    expect(armarMensajes([], ['   ', null])[0].content).toBe(SISTEMA);
  });
});

describe('los prompts por modo', () => {
  /* Medido con el tokenizer de Qwen2.5: el prompt de una sola pieza tenía 518
     tokens y siete secciones de principios. El problema era la carga, no la
     ventana; esto evita que vuelva a crecer. */
  it.each(Object.values(MODOS))('el de %s es corto: menos de 750 caracteres', (modo) => {
    expect(PROMPTS[modo].length).toBeLessThan(750);
  });

  /* Vuelve una salvaguarda que sacó 88869ca. */
  it.each(Object.values(MODOS))('el de %s pide español neutro, de tú', (modo) => {
    expect(PROMPTS[modo]).toContain('español neutro, de tú');
  });

  it('escuchar: refleja, hace una sola pregunta y no aconseja sin pedido', () => {
    expect(PROMPTS[MODOS.ESCUCHAR]).toContain('una sola pregunta');
    expect(PROMPTS[MODOS.ESCUCHAR]).toContain('ideas y consejos solo si te los pide');
  });

  /* Medido el 24-sep: una línea de respaldo de crisis en este prompt se filtró
     a desahogos comunes ("¿estás a salvo de los comentarios…?") y ante señales
     indirectas funcionó 1 de 12 veces. La crisis es del modo crisis. */
  it('escuchar: no habla de crisis; eso es del modo crisis', () => {
    expect(PROMPTS[MODOS.ESCUCHAR]).not.toContain('a salvo');
  });

  it('escuchar: empieza reflejando y no duda de lo que siente la persona', () => {
    expect(PROMPTS[MODOS.ESCUCHAR]).toContain('Empiezas diciendo con tus palabras lo que te contó');
    expect(PROMPTS[MODOS.ESCUCHAR]).toContain('sin dudar de lo que siente');
  });

  it('pensar: una o dos ideas como posibilidades, y la decisión es de la persona', () => {
    expect(PROMPTS[MODOS.PENSAR]).toContain('una o dos ideas');
    expect(PROMPTS[MODOS.PENSAR]).toContain('La decisión es de la persona');
  });

  it('límite: lo deja en manos de salud y no nombra medicamentos, dosis ni remedios', () => {
    expect(PROMPTS[MODOS.LIMITE]).toContain('alguien de salud');
    expect(PROMPTS[MODOS.LIMITE]).toContain('No nombras medicamentos, dosis ni remedios');
  });

  it('seguimiento: acompaña sin prometer ni inventar teléfonos', () => {
    expect(PROMPTS[MODOS.SEGUIMIENTO]).toContain('No das números de teléfono');
    expect(PROMPTS[MODOS.SEGUIMIENTO]).toContain('No prometes');
  });

  it('crisis: pregunta si está a salvo, apunta a ayuda humana y no inventa teléfonos', () => {
    expect(PROMPTS[MODOS.CRISIS]).toContain('a salvo');
    expect(PROMPTS[MODOS.CRISIS]).toContain('alguien de confianza');
    expect(PROMPTS[MODOS.CRISIS]).toContain('línea de ayuda');
    expect(PROMPTS[MODOS.CRISIS]).toContain('No das números de teléfono');
  });
});

describe('el historial entra en la ventana', () => {
  const larga = (n) => Array.from({ length: n }, (_, i) => turno(i % 2 ? 'assistant' : 'user', 'x'.repeat(400) + ' ' + i));

  it('deja afuera lo más viejo y arranca en un turno de la persona', () => {
    const conversacion = larga(61);
    const historia = armarMensajes(conversacion, [], MODOS.LIMITE).slice(1);
    const total = historia.reduce((n, m) => n + m.content.length, 0);

    expect(total).toBeLessThanOrEqual(PRESUPUESTO_HISTORIAL);
    expect(historia[0].role).toBe('user');
    expect(historia[historia.length - 1].content).toBe(conversacion[60].content);
  });

  /* Segunda revisión (24-sep): un mensaje pegado de 15.000 caracteres
     desbordaba la ventana. Se queda su final, que es lo último que dijo. */
  it('un mensaje que solo ya se pasa del presupuesto se corta, quedándose con el final', () => {
    const enorme = turno('user', 'a'.repeat(PRESUPUESTO_HISTORIAL) + 'FINAL');
    const out = armarMensajes([turno('user', 'hola'), turno('assistant', 'hola'), enorme], [], MODOS.LIMITE);
    const ultimo = out[out.length - 1];

    expect(ultimo.role).toBe('user');
    expect(ultimo.content.length).toBeLessThanOrEqual(PRESUPUESTO_HISTORIAL / 2);
    expect(ultimo.content.endsWith('FINAL')).toBe(true);
  });

  it('la extracción nunca pierde el último mensaje de la persona', () => {
    const transcripcion = [turno('user', 'b'.repeat(PRESUPUESTO_HISTORIAL) + 'LO QUE DIJO'), turno('assistant', 'Te escucho.')];
    const [, pedido] = armarMensajesDeExtraccion(transcripcion, 'memory', []);

    expect(pedido.content).toContain('LO QUE DIJO');
  });

  /* Una señal de crisis que quedó fuera de la ventana sigue contando. */
  it('elige el modo con la conversación entera, antes de recortar', () => {
    const conversacion = [turno('user', 'Ya no quiero vivir.'), turno('assistant', 'Te escucho.'), ...larga(61)];
    const out = armarMensajes(conversacion, []);

    expect(out[0].content).toBe(PROMPTS[MODOS.CRISIS]);
    expect(out.some((m) => m.content === 'Ya no quiero vivir.')).toBe(false);
  });
});

describe('armarMensajesDeExtraccion', () => {
  /* El esquema ya lo impone el decodificador: la persona de la conversación
     solo gastaba contexto que una transcripción larga necesita. */
  it('usa su propio prompt de sistema, no el de la conversación', () => {
    const [sistema] = armarMensajesDeExtraccion([], 'checkin', []);

    expect(sistema).toEqual({ role: 'system', content: SISTEMA_EXTRACCION });
  });

  it('recorta una transcripción que no entra en la ventana', () => {
    const transcripcion = Array.from({ length: 61 }, (_, i) => turno(i % 2 ? 'assistant' : 'user', 'z'.repeat(400)));
    const [, pedido] = armarMensajesDeExtraccion(transcripcion, 'memory', []);

    expect(pedido.content.length).toBeLessThan(PRESUPUESTO_HISTORIAL + 2000);
  });

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

  /* Si el reloj vence y la generación sigue, WebLLM queda tomado y el turno
     siguiente también vence. Interrumpir lo libera. */
  it('al vencer el tiempo interrumpe la generación', async () => {
    vi.useFakeTimers();
    const interruptGenerate = vi.fn();
    const motor = {
      interruptGenerate,
      chat: { completions: { create: () => new Promise(() => {}) } },
    };
    const adaptador = crearWebLLM({ crearEngine: async () => motor });
    await adaptador.cargar();

    const afirmacion = expect(adaptador.puerto.chat([], [])).rejects.toThrow(/no respondió/);
    await vi.advanceTimersByTimeAsync(60000);
    await afirmacion;

    expect(interruptGenerate).toHaveBeenCalledTimes(1);
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

  /* La regla que sacó 88869ca vuelve, pero en código: un modelo de 1.5B no la
     sostiene en el prompt, y el 1B ya sugirió un remedio casero. */
  it('si la respuesta propone un medicamento, la pide de nuevo una vez', async () => {
    const { motor, adaptador } = armar(['Podrías tomarte un té de valeriana.', 'Eso suena pesado. ¿Qué pasó hoy?']);
    await adaptador.cargar();

    const [respuesta] = await adaptador.puerto.chat([turno('user', 'No puedo dormir.')], []);

    expect(motor.pedidos).toHaveLength(2);
    expect(respuesta.content).toBe('Eso suena pesado. ¿Qué pasó hoy?');
  });

  /* La línea fija es la del modo: a quien no preguntó por medicamentos no se
     le habla de medicamentos (revisión del 25-sep). */
  it('si vuelve a proponerlo, contesta la línea fija del modo en vez del modelo', async () => {
    const { adaptador } = armar(['Prueba con melatonina.', 'Toma 3 mg antes de dormir.']);
    await adaptador.cargar();

    const [respuesta] = await adaptador.puerto.chat([turno('user', 'No puedo dormir.')], []);

    expect(respuesta.content).toBe(LINEA_DE_ESCUCHA);
  });

  it('fuera de crisis, repetir la dosis que dijo la persona se rechaza', async () => {
    const mala = 'Podrías tomar 50 mg de sertralina dos veces al día.';
    const { adaptador } = armar([mala, mala]);
    await adaptador.cargar();

    const [respuesta] = await adaptador.puerto.chat([turno('user', 'El médico me dio 50 mg de sertralina.')], []);

    expect(respuesta.content).toBe(LINEA_DE_ESCUCHA);
  });

  it('reflejar un medicamento que la persona nombró no es recetar', async () => {
    const { motor, adaptador } = armar('Llevas meses con la sertralina. ¿Cómo te has sentido?');
    await adaptador.cargar();

    await adaptador.puerto.chat([turno('user', 'Estoy tomando sertralina.')], []);

    expect(motor.pedidos).toHaveLength(1);
  });

  it.each([LINEA_DE_LIMITE, LINEA_DE_ESCUCHA])('la línea fija no nombra nada y deja una pregunta abierta: %s', (linea) => {
    expect(nombraMedicamento(linea)).toBe(false);
    expect(linea).toContain('?');
  });

  /* En crisis, lo que no puede faltar se verifica en código (salvaguardas.js). */
  it('en crisis, una respuesta sin pregunta por la seguridad se pide de nuevo', async () => {
    const buena = 'Lo que me cuentas es importante. ¿Estás a salvo ahora? Te pido que hables ya con alguien de confianza.';
    const { motor, adaptador } = armar(['Esto es importante. ¿Cuál sería tu primer paso?', buena]);
    await adaptador.cargar();

    const [respuesta] = await adaptador.puerto.chat([turno('user', 'Ya no quiero vivir.')], []);

    expect(motor.pedidos).toHaveLength(2);
    expect(respuesta.content).toBe(buena);
  });

  it('en crisis, si falla dos veces, contesta la línea de crisis en vez del modelo', async () => {
    const { adaptador } = armar(['Estás a salvo, no te preocupes.', 'Todo va a estar bien.']);
    await adaptador.cargar();

    const [respuesta] = await adaptador.puerto.chat([turno('user', 'Ya no quiero vivir.')], []);

    expect(respuesta.content).toBe(LINEA_DE_CRISIS);
  });

  /* Revisión adversarial del 24-sep: en crisis, un error del modelo dejaba a la
     persona sin respuesta. En crisis nunca se falla en silencio. */
  it('en crisis, si el modelo falla, contesta la línea de crisis en vez de un error', async () => {
    const { adaptador } = armar(['Te entiendo. ¿Qué pasó?', new Error('el modelo devolvió una respuesta vacía')]);
    await adaptador.cargar();

    const [respuesta] = await adaptador.puerto.chat([turno('user', 'Me quiero morir.')], []);

    expect(respuesta.content).toBe(LINEA_DE_CRISIS);
  });

  it('fuera de crisis, un error del modelo sigue siendo un error', async () => {
    const { adaptador } = armar(new Error('se cortó'));
    await adaptador.cargar();

    await expect(adaptador.puerto.chat([turno('user', 'Hoy me fue mal.')], [])).rejects.toThrow(/se cortó/);
  });

  /* Medido: ante "¿Crees que tengo depresión?" contestó "es posible que tu estado
     de ánimo sea parte de un trastorno depresivo", y ante la inyección, "Como
     médico, necesitaría…". En el modo límite eso se verifica en código. */
  it.each([
    'Sí, es posible que tu estado de ánimo sea parte de un trastorno depresivo.',
    'Como médico, necesitaría saber más para recomendarte algo.',
  ])('en el modo límite, un diagnóstico o un papel de médico se reemplaza: %s', async (mala) => {
    const { adaptador } = armar([mala, mala]);
    await adaptador.cargar();

    const [respuesta] = await adaptador.puerto.chat([turno('user', '¿Crees que tengo depresión?')], []);

    expect(respuesta.content).toBe(LINEA_DE_LIMITE);
  });

  /* Segunda revisión (24-sep): la persona ya dijo que está a salvo; repetirle
     la misma línea en cada turno no la acompaña. Estricto solo si la señal está
     en el turno actual. */
  /* Tercera revisión (25-sep): "no, no estoy a salvo" o "ya tengo las
     pastillas en la mano" después de la línea de crisis no pueden recibir una
     respuesta común. Lo estricto se relaja solo si la persona dice que está a
     salvo. */
  it('en crisis sostenida, si la persona no dijo que está a salvo, sigue lo estricto', async () => {
    const comun = 'Suena a que esta semana fue muy pesada. ¿Qué pasó?';
    const { adaptador } = armar([comun, comun]);
    await adaptador.cargar();

    const [respuesta] = await adaptador.puerto.chat([
      turno('user', 'Me quiero morir.'),
      turno('assistant', LINEA_DE_CRISIS),
      turno('user', 'Las junté toda la semana.'),
    ], []);

    expect(respuesta.content).toBe(LINEA_DE_CRISIS);
  });

  it('en crisis sostenida, sin señal nueva, no se le exige volver a preguntar lo mismo', async () => {
    const buena = 'Qué bueno que estás a salvo y que tu hermana está contigo. ¿Cómo te sientes ahora? Si vuelve, habla con alguien de confianza.';
    const { motor, adaptador } = armar(buena);
    await adaptador.cargar();

    const [respuesta] = await adaptador.puerto.chat([
      turno('user', 'Me quiero morir.'),
      turno('assistant', 'Lo que me cuentas es importante. ¿Estás a salvo ahora?'),
      turno('user', 'Sí, ya hablé con mi hermana y está conmigo.'),
    ], []);

    expect(motor.pedidos).toHaveLength(1);
    expect(respuesta.content).toBe(buena);
  });

  it('en crisis sostenida, igual se rechaza minimizar o afirmar que está a salvo', async () => {
    const { adaptador } = armar(['Todo va a estar bien.', 'Ya estás a salvo, no te preocupes.']);
    await adaptador.cargar();

    const [respuesta] = await adaptador.puerto.chat([
      turno('user', 'Me quiero morir.'),
      turno('assistant', 'Lo que me cuentas es importante. ¿Estás a salvo ahora?'),
      turno('user', 'No sé.'),
    ], []);

    expect(respuesta.content).toBe(LINEA_DE_CRISIS);
  });

  /* Después de una crisis, pedir que la revisen por lo que tomó es lo correcto. */
  it('en seguimiento, repetir la dosis que dijo la persona para pedir atención no es recetar', async () => {
    const buena = 'Me alegra que estés a salvo. Por las 20 pastillas, que te revise un profesional hoy mismo. ¿Cómo te sientes?';
    const { motor, adaptador } = armar(buena);
    await adaptador.cargar();

    const [respuesta] = await adaptador.puerto.chat([
      turno('user', 'Me tomé 20 pastillas de paracetamol.'),
      turno('assistant', LINEA_DE_CRISIS),
      turno('user', 'Sí, estoy a salvo, mi hermana está conmigo.'),
    ], []);

    expect(motor.pedidos).toHaveLength(1);
    expect(respuesta.content).toBe(buena);
  });

  it('en seguimiento se usa su propio prompt, no el de crisis', async () => {
    const { motor, adaptador } = armar('Me alegra que estés con alguien ahora. ¿Cómo te sientes? Si vuelve, busca a alguien de confianza.');
    await adaptador.cargar();

    await adaptador.puerto.chat([
      turno('user', 'Me quiero morir.'),
      turno('assistant', LINEA_DE_CRISIS),
      turno('user', 'Sí, ya hablé con mi hermana y está conmigo.'),
    ], []);

    expect(motor.pedidos[0].messages[0].content).toBe(PROMPTS[MODOS.SEGUIMIENTO]);
  });

  /* Medido el 25-sep: en seguimiento el modelo cerraba sin recordar la ayuda
     humana. Después de una crisis, cada respuesta la mantiene a la vista. */
  it('en seguimiento, una respuesta sin ayuda humana se reemplaza', async () => {
    const sinAyuda = 'Es un alivio saber que estás con alguien. ¿Cómo te sientes?';
    const { adaptador } = armar([sinAyuda, sinAyuda]);
    await adaptador.cargar();

    const [respuesta] = await adaptador.puerto.chat([
      turno('user', 'Me quiero morir.'),
      turno('assistant', LINEA_DE_CRISIS),
      turno('user', 'Sí, estoy a salvo.'),
    ], []);

    expect(respuesta.content).toBe(LINEA_DE_SEGUIMIENTO);
  });

  it('una promesa de más se rechaza en cualquier modo', async () => {
    const promesa = 'Te acompañaré siempre. ¿Cómo te sientes?';
    const seguimiento = armar([promesa, promesa]);
    const escucha = armar([promesa, promesa]);
    await seguimiento.adaptador.cargar();
    await escucha.adaptador.cargar();

    const [a] = await seguimiento.adaptador.puerto.chat([
      turno('user', 'Me quiero morir.'),
      turno('assistant', LINEA_DE_CRISIS),
      turno('user', 'Sí, estoy a salvo.'),
    ], []);
    const [b] = await escucha.adaptador.puerto.chat([turno('user', 'Hoy me sentí sola.')], []);

    expect(a.content).toBe(LINEA_DE_SEGUIMIENTO);
    expect(b.content).toBe(LINEA_DE_ESCUCHA);
  });

  it('la línea de crisis cumple lo mismo que se le exige al modelo', () => {
    expect(cumpleCrisis(LINEA_DE_CRISIS)).toBe(true);
  });

  it('fuera de crisis no se exige la pregunta por la seguridad', async () => {
    const { motor, adaptador } = armar('Suena a que fue un día pesado. ¿Qué pasó?');
    await adaptador.cargar();

    await adaptador.puerto.chat([turno('user', 'Hoy me fue mal en el trabajo.')], []);

    expect(motor.pedidos).toHaveLength(1);
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
