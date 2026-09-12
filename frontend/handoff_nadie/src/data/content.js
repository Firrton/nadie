/* Copy y datos de demo. El copy es final: no reescribir sin pasar por marca.
   Reglas de tono: español neutro con tuteo, frases cortas, sentence case,
   cero palabras clínicas (nunca "terapia", "diagnóstico", "sanar", "tu viaje"). */

export const VOICES = [
  { id: 'brasa', name: 'Brasa', desc: 'Cálida y grave, sin prisa', breatheDur: '3.6s', quote: 'Aquí estoy. Sin prisa.' },
  { id: 'niebla', name: 'Niebla', desc: 'Suave, casi un susurro', breatheDur: '4.4s', quote: 'Cuando quieras. Te escucho.' },
  { id: 'cauce', name: 'Cauce', desc: 'Clara y cercana', breatheDur: '2.9s', quote: 'Cuéntame. Se queda entre nosotros.' },
];

/* Guion de demo del prototipo. En producción, USER_LINES viene del reconocimiento
   de voz en el dispositivo y REPLIES del modelo. */
export const DEMO_USER_LINES = [
  'Hoy fue uno de esos días en los que todo pesa. El trabajo, la casa, todo. Y no se lo puedo decir a nadie sin sentir que molesto.',
  'Es que no es algo grande, son mil cosas chicas. Y cuando lo cuento en voz alta suena menos grave de lo que se siente.',
  'Sí. Creo que solo necesitaba soltarlo.',
];

export const DEMO_REPLIES = [
  'Te escucho. Un día que pesa no necesita justificación. Cuéntame qué fue lo que más te cargó hoy.',
  'Que suene menos grave no lo hace menos real. Mil cosas chicas también cansan. Aquí puedes decirlas todas, en el orden que salgan.',
  'Para eso está este espacio. Lo dijiste, y ya no está solo en tu cabeza. Cuando quieras cerrar, aquí sigo.',
];

/* Ánimo de demo: 27 días + hoy (null hasta que el usuario califica). */
export const DEMO_MONTH = [
  0.34, 0.4, null, 0.3, 0.42, 0.38, null, 0.45, 0.5, 0.4, null, 0.36, 0.52, 0.47,
  null, 0.55, 0.48, null, 0.6, 0.52, 0.58, 0.5, null, 0.62, 0.55, 0.66, 0.6,
];

export const CRISIS_LINE = 'México: Línea de la Vida, 800 911 2000 · España: línea 024';
