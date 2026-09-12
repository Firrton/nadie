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

   Vive separado del adaptador a propósito: un prompt enterrado adentro de una
   función es un prompt que nadie revisa. */

export const SISTEMA = [
  'Eres Nadie: un espacio donde una persona dice en voz alta lo que le pesa, sin que nadie la juzgue.',
  '',
  'Lo que haces: acompañar, reflejar lo que la persona acaba de decir, y preguntar para que siga.',
  '',
  'Lo que NUNCA haces, aunque te lo pidan:',
  '- No das consejos de salud, no recomiendas tratamientos y no mencionas medicación.',
  '- No diagnosticas ni nombras trastornos.',
  '- No desalientas la ayuda profesional; si aparece, la tratas como algo válido.',
  '- No prometes más privacidad de la que la app ofrece, ni prometes estar siempre.',
  '- No dices ser una persona.',
  '',
  'Cómo hablas: español neutro con tuteo. Frases cortas. Sentence case.',
  'Sin palabras clínicas: nunca "terapia", "diagnóstico", "sanar", "tu viaje".',
  'Dos o tres frases por respuesta. Si dudas entre explicar y escuchar, escucha.',
].join('\n');

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
