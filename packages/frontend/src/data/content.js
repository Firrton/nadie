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

/* Frases para la espera de la primera carga del modelo.

   Bajar los pesos tarda, y una barra sola es hostil. Estas frases las eligió el
   equipo; no son de relleno ni generadas: cada una viene con su autor y se
   muestra tal cual. Si alguna se cambia, se cambia acá y en ningún otro lado.

   Se citan con atribución porque una frase sin autor es una frase apropiada. */
export const FRASES_DE_ESPERA = [
  { texto: 'En medio del invierno, aprendí por fin que había en mí un verano invencible.', autor: 'Albert Camus' },
  { texto: 'El hombre que mueve montañas comienza apartando pequeñas piedras.', autor: 'Confucio' },
  { texto: 'La vida no es un problema que deba ser resuelto, sino una realidad que debe ser experimentada.', autor: 'Søren Kierkegaard' },
  { texto: 'Un viaje de mil millas comienza con un solo paso.', autor: 'Lao Tsé' },
  { texto: 'Nuestra mayor gloria no es no caer nunca, sino levantarnos cada vez que caemos.', autor: 'Atribuida a Confucio' },
  { texto: 'El impedimento a la acción avanza la acción. Lo que se interpone en el camino se convierte en el camino.', autor: 'Marco Aurelio' },
  { texto: 'La esperanza es el sueño del hombre despierto.', autor: 'Aristóteles' },
  { texto: 'Vivir es nacer a cada instante.', autor: 'Erich Fromm' },
  { texto: 'El que tiene un porqué para vivir puede soportar casi cualquier cómo.', autor: 'Friedrich Nietzsche' },
  { texto: 'Acepta las cosas a las que el destino te ata, y ama a las personas que el destino te trae, pero hazlo con todo tu corazón.', autor: 'Marco Aurelio' },
  { texto: 'El alma tiene ilusiones como el pájaro alas; eso es lo que la sostiene.', autor: 'Víctor Hugo' },
  { texto: 'Nunca es demasiado tarde para ser lo que podrías haber sido.', autor: 'George Eliot' },
  { texto: 'La felicidad depende de nosotros mismos.', autor: 'Aristóteles' },
  { texto: 'No te dejes abrumar por el futuro. Lo enfrentarás, si es necesario, con las mismas armas de la razón que hoy te arman contra el presente.', autor: 'Marco Aurelio' },
  { texto: 'Aun si supiera que el mundo se hará pedazos mañana, hoy aún plantaría mi manzano.', autor: 'Martín Lutero' },
];

/* BORRADOR — pendiente de marca.

   Las FRASES_DE_ESPERA las eligió el equipo y son definitivas. Estas dos o tres
   líneas de alrededor NO: son lo mínimo para que la pantalla exista y están
   escritas siguiendo las reglas de tono de arriba (tuteo, frases cortas,
   sentence case, cero palabras clínicas). Reemplazar sin culpa.

   Sobre "sin soporte": dice que Nadie sigue trabajando en equipos más modestos,
   SIN comprometer fecha. El muro real es un límite del navegador
   (maxStorageBufferBindingSize), no nuestro, y prometer resolverlo sería prometer
   algo que no controlamos. */
export const COPY_ESPERA = {
  titulo: 'Nadie se está instalando.',
  sub: 'Solo pasa esta vez. Después funciona sin internet.',
  /* Mientras tanto la app sirve igual: el ánimo se registra sin modelo. */
  mientras: 'Puedes registrar cómo te sientes mientras tanto.',
  sinSoporte: {
    titulo: 'Este equipo todavía no puede con el modelo.',
    sub: 'Seguimos trabajando para que Nadie corra en equipos más modestos. Tu registro de ánimo funciona igual.',
  },
};

export const CRISIS_LINE = 'México: Línea de la Vida, 800 911 2000 · España: línea 024';
