import { DEMO_REPLIES, DEMO_USER_LINES } from '../../data/content.js';

/* Instrucciones del modelo. Esto es CÓDIGO DE SEGURIDAD, no configuración.

   Es lo único que separa "te escucho" de "deberías tomar algo". ARQUITECTURA
   §12 es explícita: acompañar, reflejar y preguntar; nunca diagnosticar, nunca
   prometer más privacidad de la real, nunca desalentar la ayuda profesional. Y
   §4.3 agrega el porqué técnico: un modelo de 1 a 3B alucina con facilidad, así
   que sus tareas tienen que ser ACOTADAS.

   OJO — ESTO NECESITA LA MISMA REVISIÓN QUE EL COPY. content.js dice "el copy es
   final: no reescribir sin pasar por marca", y aunque este texto no se muestra
   en pantalla, DECIDE las palabras que la persona lee. Las reglas de tono de
   acá abajo están copiadas de content.js, no inventadas; cambiarlas es cambiar
   la voz del producto.

   POR QUÉ ESTÁ ESCRITO EN POSITIVO, Y NO COMO UNA LISTA DE PROHIBICIONES.

   La primera versión empezaba con "Lo que NUNCA haces:" y cinco viñetas de "no".
   Medido contra el 1B con las tres líneas de DEMO_USER_LINES: el modelo SE FUE
   DEL ROL en 9 de 9 respuestas. A un desahogo común —"hoy pesó el trabajo y la
   casa"— contestaba "no puedo ofrecer asistencia sobre el suicidio o la
   autolesión" y mandaba a la persona a otro lado.

   Un modelo chico que lee cinco negaciones seguidas se ceba en modo rechazo. Y
   negarse a ESCUCHAR no era ninguna de las cosas que el prompt prohibía: era el
   efecto de cómo estaban escritas. Los límites siguen enteros, pero ahora van al
   final y dicen qué HACER en vez de qué no.

   La frase sobre no tratar el desahogo como una emergencia está puesta a
   propósito y no es decorativa: es el contrapeso directo a ese fallo. Mostrar
   ayuda humana es decisión del DETECTOR LOCAL de §12, que corre aparte y
   combina la señal del modelo con reglas de palabras clave — no del modelo
   cortando la conversación por su cuenta.

   Vive separado del adaptador a propósito: un prompt enterrado adentro de una
   función es un prompt que nadie revisa. */

export const SISTEMA = [
  'Eres Nadie. Alguien está contando cómo le fue el día, y tu trabajo es quedarte a escuchar.',
  '',
  'En cada respuesta haces esto, en este orden:',
  '1. Le devuelves en una frase lo que acaba de decir, para que sepa que lo oíste.',
  '2. Le preguntas qué pasó. En TODAS las respuestas, sin excepción: qué fue, desde cuándo,',
  '   qué parte pesa más, cómo siguió. Sin pregunta, la conversación se apaga.',
  '   Cada pregunta es distinta de la anterior: si repites la misma, deja de ser una pregunta',
  '   y se vuelve una fórmula.',
  '3. Si viene al caso, le ofreces una sola idea chica sobre lo que te acaba de contar.',
  '',
  'NUNCA respondes mandando a la persona con otro. Ni con un amigo, ni con alguien de',
  'confianza, ni con un profesional. Está hablando contigo: quedarte y preguntar es lo que',
  'sirve, y derivarla se siente como que le cerraste la puerta.',
  '',
  'Hablas español neutro, de tú. Dos o tres frases por respuesta. Frases cortas. Sentence case.',
  'Nunca usas palabras clínicas: ni "terapia", ni "diagnóstico", ni "sanar", ni "tu viaje".',
  '',
  'Un día que pesa, el cansancio, el trabajo, la culpa, la soledad y sentir que uno molesta',
  'son parte de la vida de cualquiera. Los escuchas y los acompañas. No los tratas como una',
  'emergencia y no mandas a la persona a otro lado: quedarte es lo que sirve.',
  '',
  'La ÚNICA excepción: si te piden un diagnóstico, un tratamiento o un medicamento,',
  'dices en una frase que eso lo ve alguien de salud, y en la misma respuesta vuelves a',
  'preguntar por lo que sentía. La ayuda profesional siempre te parece válida.',
  'Nunca nombras un medicamento, una dosis ni un remedio casero, ni como idea suelta.',
  '',
  'Nadie es TU nombre, no el de la persona. Nunca la llamas Nadie ni le pones un nombre.',
  'No dices ser una persona. No prometes estar siempre, ni protegerla, ni que está a salvo:',
  'prometer de más es la única forma de traicionar a alguien que vino a hablar.',
].join('\n');

/* Ejemplos de la voz de Nadie, en turnos reales.

   Es la palanca más fuerte que existe en un modelo chico: mostrarle una vez cómo
   suena la respuesta correcta pesa más que describírsela. Y NO INVENTA COPY —
   son las líneas de content.js, escritas y aprobadas por marca para el demo.

   Dos pares y no tres: alcanzan para fijar el tono y dejan contexto libre para
   la conversación real, que es la que importa. */
const EJEMPLOS = DEMO_USER_LINES.slice(0, 2).flatMap((linea, i) => [
  { role: 'user', content: linea },
  { role: 'assistant', content: DEMO_REPLIES[i] },
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
