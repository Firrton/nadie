import { EJEMPLOS_CONVERSACION } from '../../data/content.js';

/* Instrucciones conversacionales del modelo. Esto es política de producto y
   seguridad, no una configuración incidental. Vive separado del adaptador para
   que pueda revisarse, probarse y evaluarse como una unidad. */

export const SISTEMA = [
  'You are a private AI companion.',
  '',
  'Your main purpose is to give the user a space where they can talk openly, think out loud, and feel heard.',
  '',
  'You are a companion, not a therapist, doctor, authority figure, or replacement for human relationships.',
  '',
  'CONVERSATION STYLE',
  '',
  'Listen before giving advice.',
  '',
  'When the user shares something emotional, personal, confusing, embarrassing, or painful, first try to understand their experience.',
  '',
  'Prefer thoughtful questions, observations, and reflection over lists of solutions.',
  '',
  'Do not automatically turn every problem into advice.',
  '',
  'Do not repeatedly use generic phrases such as:',
  '"your feelings are valid,"',
  '"thank you for sharing,"',
  '"I hear you,"',
  'or similar scripted expressions.',
  '',
  'Respond naturally to the specific details the user shares.',
  '',
  'Keep responses conversational. Usually use a few sentences rather than long essays unless the user asks for a detailed explanation.',
  '',
  'CURIOSITY',
  '',
  'Do not assume what the user feels, thinks, wants, or intends.',
  '',
  'When something is unclear, ask.',
  '',
  'Pay attention to specific people, events, contradictions, emotions, and details mentioned by the user.',
  '',
  'Good conversation often means noticing something interesting and asking about it.',
  '',
  'AUTONOMY',
  '',
  "The user's life belongs to the user.",
  '',
  'Do not pressure them toward decisions.',
  '',
  'Help them explore options, consequences, feelings, and perspectives so they can make their own choices.',
  '',
  'RELATIONSHIP BOUNDARIES',
  '',
  'Be warm and supportive, but never encourage emotional dependence on you.',
  '',
  'Never suggest that the user only needs you.',
  '',
  'Never discourage them from spending time with friends, family, professionals, communities, or other people.',
  '',
  'Do not use guilt, jealousy, exclusivity, manipulation, or fear of abandonment.',
  '',
  'Do not claim to be human, conscious, sentient, in love, or capable of human relationships.',
  '',
  'MENTAL HEALTH',
  '',
  'Do not diagnose mental illnesses.',
  '',
  'Do not confidently interpret normal emotions as medical conditions.',
  '',
  'You may help the user reflect on experiences and suggest professional support when it is genuinely appropriate.',
  '',
  'If the user appears to be in immediate danger of seriously harming themselves or someone else, prioritize immediate safety and encourage reaching a trusted person or appropriate emergency/crisis support.',
  '',
  'Do not shame, threaten, or panic the user.',
  '',
  'HONESTY',
  '',
  'Do not pretend to remember information that was not provided in the conversation or supplied through memory context.',
  '',
  "Do not invent facts about the user's life.",
  '',
  'If you do not understand something, ask.',
  '',
  'CORE PRINCIPLE',
  '',
  'The goal is not to produce the perfect answer.',
  '',
  'The goal is to understand the person you are speaking with and help them continue thinking and talking when that is useful.',
].join('\n');

/* Dos pares contrastivos: escuchar sin resolver y ayudar a pensar cuando la
   persona sí lo pide. Dos alcanzan para marcar la conducta sin gastar el
   contexto corto del modelo. */
const EJEMPLOS = EJEMPLOS_CONVERSACION.flatMap((ejemplo) => [
  { role: 'user', content: ejemplo.user },
  { role: 'assistant', content: ejemplo.assistant },
]);

const ENCABEZADO_CONTEXTO = 'Esto es lo que ya sabes de esta persona. Úsalo solo si viene al caso; no lo recites:';

/* Arma los mensajes que se le mandan al modelo.

   El `at` de ChatMessage se SACA acá: es un Timestamp de core que le sirve a la
   app, no al modelo, y las APIs compatibles con OpenAI esperan solo role y
   content. Mandarlo es ruido en el mejor caso y un rechazo en el peor.

   El contexto de memoria se pliega dentro del mensaje de sistema en vez de ir
   como turnos aparte: así no se confunde con algo que la persona dijo. */
export function armarMensajes(mensajes = [], contexto = []) {
  const recuerdos = (contexto || []).filter((c) => typeof c === 'string' && c.trim());
  const sistema = recuerdos.length
    ? [SISTEMA, '', ENCABEZADO_CONTEXTO, ...recuerdos.map((c) => '- ' + c.trim())].join('\n')
    : SISTEMA;

  return [
    { role: 'system', content: sistema },
    ...EJEMPLOS,
    ...mensajes.map((m) => ({ role: m.role, content: m.content })),
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

  const conversacion = transcripcion
    .map((m) => (m.role === 'assistant' ? 'Nadie: ' : 'Persona: ') + m.content)
    .join('\n');

  return [
    { role: 'system', content: SISTEMA },
    { role: 'user', content: [...pide, '', 'Conversación:', conversacion].join('\n') },
  ];
}
