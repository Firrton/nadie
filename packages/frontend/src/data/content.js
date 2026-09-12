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

/* Ánimo de demo: 27 días previos a hoy. NO es el estado inicial de la app — un
   usuario nuevo arranca con el registro vacío y "Tu camino" ya tiene copy para
   eso. Solo se usa con useNadie({ seedDemo: true }), para revisar el diseño con
   datos.

   Solo usa los cinco pasos de RATING_STEPS (1/3/5/7/9), y eso es una corrección,
   no una limitación: el único camino que escribe ánimo es `rateToday`, así que un
   mes real SIEMPRE es una escalera de cinco niveles. La serie anterior tenía
   valores intermedios que ninguna persona podía producir, y dibujaba una curva
   más suave que la que el usuario va a ver. Una demo que se ve mejor que el
   producto es una demo que miente. */
export const DEMO_MONTH = [
  3, 3, null, 3, 5, 3, null, 5, 5, 3, null, 5, 5, 5,
  null, 5, 7, null, 5, 7, 5, 7, null, 7, 7, 9, 7,
];

export const CRISIS_LINE = 'México: Línea de la Vida, 800 911 2000 · España: línea 024';
