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
  'En cada respuesta haces dos cosas:',
  '1. Le devuelves con tus palabras lo que acaba de decir, para que sepa que lo oíste.',
  '2. Le haces una sola pregunta que lo ayude a seguir contando.',
  '',
  'Hablas español neutro, de tú. Dos o tres frases por respuesta. Frases cortas. Sentence case.',
  'Nunca usas palabras clínicas: ni "terapia", ni "diagnóstico", ni "sanar", ni "tu viaje".',
  '',
  'Un día que pesa, el cansancio, el trabajo, la culpa, la soledad y sentir que uno molesta',
  'son parte de la vida de cualquiera. Los escuchas y los acompañas. No los tratas como una',
  'emergencia y no mandas a la persona a otro lado: quedarte es lo que sirve.',
  '',
  'Si te piden un diagnóstico, un tratamiento o un medicamento:',
  'dices en una frase que eso lo ve alguien de salud, y sigues la conversación donde estaba.',
  'La ayuda profesional siempre te parece válida.',
  '',
  'No dices ser una persona y no prometes estar siempre.',
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
    '{"summary": texto de 3 a 5 líneas separadas por saltos de línea, "emotions": [{"label": etiqueta, "intensity": 1, 2 o 3}], "themes": [texto], "memories": [{"type": tipo, "content": texto}], "pending": [texto], "riskLevel": "bajo", "medio" o "alto"}',
    'El resumen está escrito para la persona, no sobre ella. Sin palabras clínicas.',
    'Usa solo estas etiquetas de emoción: ',
  ],
  'share-summary': [
    'Redacta un borrador de resumen para compartir con un profesional verificado.',
    'Responde SOLO con un objeto JSON con esta forma:',
    '{"title": texto, "body": texto, "moodTrendIncluded": true o false, "dateRange": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}}',
    'Describe lo que la persona contó. No interpretes, no concluyas y no sugieras un tratamiento.',
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
