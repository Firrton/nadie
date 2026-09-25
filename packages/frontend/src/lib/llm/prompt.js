import { EJEMPLOS_CONVERSACION } from '../../data/content.js';
import { MODOS, elegirModo } from './modos.js';

/* Instrucciones conversacionales del modelo, UNA POR MODO. Esto es política de
   producto y seguridad, no una configuración incidental. Vive separado del
   adaptador para que pueda revisarse, probarse y evaluarse como una unidad.

   Medido el 24-sep con el tokenizer de Qwen2.5: el prompt anterior no era largo
   —518 tokens, contra 535 del que había antes—, era CARGADO: siete secciones de
   principios en inglés que el 1.5B tenía que sopesar a la vez, y aconsejó
   después de "no quiero que me armes un plan". Acá cada modo es un
   procedimiento corto, en positivo y en español, con una sola tarea. Qué modo
   toca lo decide el código (modos.js), no el modelo.

   "Una inteligencia artificial que acompaña" y no "Nadie": con su nombre en el
   prompt, los modelos chicos llamaban Nadie a la persona. */
const IDENTIDAD = 'Eres una inteligencia artificial que acompaña a las personas cuando necesitan desahogarse.';

export const PROMPTS = Object.freeze({
  [MODOS.ESCUCHAR]: [
    IDENTIDAD + ' Alguien te está contando algo y tu tarea es escuchar.',
    '',
    'Respondes en dos o tres frases cortas. Empiezas diciendo con tus palabras lo que te contó, hablándole de tú y sin copiar sus frases, por ejemplo "Suena a que…" o "Te dolió que…". Terminas con una sola pregunta sobre algo concreto de lo que contó, sin dudar de lo que siente.',
    '',
    'Hablas en español neutro, de tú, con palabras de todos los días. Te quedas en lo que la persona cuenta: ideas y consejos solo si te los pide.',
  ].join('\n'),

  [MODOS.PENSAR]: [
    IDENTIDAD + ' La persona te pidió ayuda para pensar qué hacer.',
    '',
    'En esta respuesta:',
    '1. Dices en una frase qué es lo que quiere resolver.',
    '2. Le ofreces una o dos ideas pequeñas y concretas, como posibilidades.',
    '3. Terminas con una pregunta para que elija o te diga qué le parece.',
    '',
    'La decisión es de la persona. Hablas en español neutro, de tú, con palabras de todos los días. Tres o cuatro frases cortas, corridas, sin listas ni negritas.',
  ].join('\n'),

  [MODOS.LIMITE]: [
    IDENTIDAD + ' La persona te preguntó por algo de salud que solo puede ver un médico o un psicólogo.',
    '',
    /* En estilo directo, como el de crisis: descrito en tercera persona, el
       modelo sugería diagnósticos o aceptaba hacer de médico (24-sep). */
    'Le respondes en dos frases cortas, parecidas a estas: "Eso lo tiene que ver alguien de salud, como un médico o un psicólogo. ¿Qué te está pasando que te hizo preguntarlo?"',
    '',
    'Hablas en español neutro, de tú. No nombras medicamentos, dosis ni remedios.',
  ].join('\n'),

  [MODOS.CRISIS]: [
    IDENTIDAD + ' La persona dijo algo que puede significar que está pensando en hacerse daño o en dejar de vivir.',
    '',
    /* En estilo directo: descrita en tercera persona ("le dices que lo que te
       contó…"), Qwen3 copiaba la descripción tal cual (lectura ciega, 24-sep). */
    'Le respondes en tres frases cortas, parecidas a estas: "Lo que me cuentas es importante y mereces apoyo ahora mismo. ¿Estás a salvo en este momento? Te pido que hables ya con alguien de confianza o que llames a una línea de ayuda de tu país."',
    '',
    'Hablas en español neutro, de tú, con calma. No das números de teléfono.',
  ].join('\n'),

  [MODOS.SEGUIMIENTO]: [
    IDENTIDAD + ' La persona habló de hacerse daño o de no querer vivir, y ahora te dijo que está a salvo o acompañada.',
    '',
    'Le respondes en dos o tres frases cortas, parecidas a estas: "Me alegra que estés a salvo ahora. ¿Cómo te sientes en este momento? Si vuelves a sentirte en peligro, busca ayuda de inmediato con alguien de confianza o una línea de ayuda de tu país."',
    '',
    'Hablas en español neutro, de tú, con calma. No das números de teléfono. No prometes estar siempre ni cuidar a la persona.',
  ].join('\n'),
});

/* El modo por defecto conserva el nombre histórico: el banco de research
   (evaluation_harness.py) lo importa. */
export const SISTEMA = PROMPTS[MODOS.ESCUCHAR];

export const SISTEMA_EXTRACCION =
  'Lees una conversación entre una persona y una inteligencia artificial que la acompaña. Respondes solo con un objeto JSON válido con la forma que se te pide. Escribes en español, con palabras de todos los días.';

/* Cuánta conversación entra, en caracteres: WebLLM no expone el tokenizer antes
   de generar. Medido en Qwen2.5, el español rinde ~3.4 caracteres por token. La
   ventana es de 4096: menos 220 de respuesta y ≤400 de sistema y ejemplo quedan
   ~3400 tokens; a 3 caracteres por token, para quedar del lado seguro, 9000. */
export const PRESUPUESTO_HISTORIAL = 9000;

/* Deja afuera lo más viejo. El último mensaje entra siempre, aunque solo él se
   pase: sin él no hay a qué responder. Y la historia arranca en un turno de la
   persona, como después de los ejemplos. */
const MAX_POR_MENSAJE = PRESUPUESTO_HISTORIAL / 2;

function recortar(todos) {
  /* Ningún mensaje ocupa más de la mitad: uno pegado de 15.000 caracteres
     desbordaba la ventana, y en la extracción dejaba afuera lo último que dijo
     la persona. Se queda el final, que es lo más reciente. */
  const mensajes = todos.map((m) =>
    m.content.length > MAX_POR_MENSAJE ? { ...m, content: m.content.slice(-MAX_POR_MENSAJE) } : m);
  let desde = mensajes.length;
  let total = 0;
  while (desde > 0 && total + mensajes[desde - 1].content.length <= PRESUPUESTO_HISTORIAL) {
    total += mensajes[desde - 1].content.length;
    desde -= 1;
  }
  desde = Math.min(desde, mensajes.length - 1);
  while (desde < mensajes.length - 1 && mensajes[desde].role !== 'user') desde += 1;
  return mensajes.slice(Math.max(desde, 0));
}

const ENCABEZADO_CONTEXTO = 'Esto es lo que ya sabes de esta persona. Úsalo solo si viene al caso; no lo recites:';

/* Arma los mensajes que se le mandan al modelo.

   El modo se elige con la conversación ENTERA, antes de recortar: una señal de
   crisis que ya no entra en la ventana sigue contando.

   El `at` de ChatMessage se SACA acá: es un Timestamp de core que le sirve a la
   app, no al modelo, y las APIs compatibles con OpenAI esperan solo role y
   content. Mandarlo es ruido en el mejor caso y un rechazo en el peor.

   El contexto de memoria se pliega dentro del mensaje de sistema en vez de ir
   como turnos aparte: así no se confunde con algo que la persona dijo.

   Solo va el ejemplo del modo elegido: un ejemplo que aconseja, mostrado
   mientras se le pide escuchar, enseña lo contrario del prompt. */
export function armarMensajes(mensajes = [], contexto = [], modo = elegirModo(mensajes)) {
  const recuerdos = (contexto || []).filter((c) => typeof c === 'string' && c.trim());
  const sistema = recuerdos.length
    ? [PROMPTS[modo], '', ENCABEZADO_CONTEXTO, ...recuerdos.map((c) => '- ' + c.trim())].join('\n')
    : PROMPTS[modo];

  const ejemplos = EJEMPLOS_CONVERSACION.filter((e) => e.modo === modo).flatMap((e) => [
    { role: 'user', content: e.user },
    { role: 'assistant', content: e.assistant },
  ]);

  return [
    { role: 'system', content: sistema },
    ...ejemplos,
    ...recortar(mensajes).map((m) => ({ role: m.role, content: m.content })),
  ];
}

/* Qué se le pide al modelo en cada extracción. El esquema de verdad vive en
   core y es quien manda: esto solo empuja al modelo hacia esa forma. Si el
   modelo devuelve otra cosa, se descarta — no se acomoda. */
const INSTRUCCIONES_EXTRACCION = {
  checkin: [
    'Propón un check-in del ánimo de esta persona a partir de la conversación.',
    'Responde SOLO con un objeto JSON con esta forma:',
    '{"score": entero del 1 al 10, "emotions": [{"label": etiqueta, "intensity": 1, 2 o 3}], "note": texto opcional}',
    'score 1 es el peor día posible y 10 el mejor; 5 es un día neutro.',
    'Usa solo estas etiquetas de emoción: ',
  ],
  memory: [
    'Resume la conversación que acaba de terminar.',
    'Responde SOLO con un objeto JSON con esta forma:',
    /* `summary` va como ARRAY de 3 a 5 frases, no como un texto con saltos: es la
       única forma de que el esquema pueda EXIGIR la cantidad de líneas en vez de
       pedirla por favor. El adaptador las une antes de validar contra core. */
    '{"summary": [3 a 5 frases, una por elemento], "emotions": [{"label": etiqueta, "intensity": 1, 2 o 3}], "themes": [texto], "memories": [{"type": tipo, "content": texto}], "pending": [texto], "riskLevel": "bajo", "medio" o "alto"}',
    'El resumen está escrito para la persona, no sobre ella. Sin palabras clínicas.',
    'Usa solo estas etiquetas de emoción: ',
  ],
  'share-summary': [
    'Redacta un borrador de resumen para compartir con un profesional verificado.',
    'Responde SOLO con un objeto JSON con esta forma:',
    '{"title": texto, "body": texto, "moodTrendIncluded": true o false, "dateRange": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}}',
    'Describe lo que la persona contó. No interpretes, no concluyas y no sugieras un tratamiento.',
    /* Medido: sin esto, el 1.5B copió la frase de la persona como "body". */
    'Escribe el body en tercera persona y con tus palabras, en dos o tres frases. No copies frases textuales de la persona.',
  ],
};

export function armarMensajesDeExtraccion(transcripcion = [], esquema, etiquetas = []) {
  const instrucciones = INSTRUCCIONES_EXTRACCION[esquema];
  if (!instrucciones) throw new Error('no hay instrucciones para el esquema ' + esquema);

  const pide = instrucciones.slice();
  if (pide[pide.length - 1].endsWith(': ')) {
    pide[pide.length - 1] = pide[pide.length - 1] + etiquetas.join(', ') + '.';
  }

  /* Una sesión larga se recorta igual que el chat: mejor resumir lo último que
     no poder cerrar la sesión. */
  const conversacion = recortar(transcripcion)
    .map((m) => (m.role === 'assistant' ? 'Nadie: ' : 'Persona: ') + m.content)
    .join('\n');

  return [
    { role: 'system', content: SISTEMA_EXTRACCION },
    { role: 'user', content: [...pide, '', 'Conversación:', conversacion].join('\n') },
  ];
}
