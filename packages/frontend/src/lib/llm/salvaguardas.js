/* Lo que el modelo nunca debe proponer, verificado en código y no pedido por
   favor en el prompt: un modelo de 1.5B no sostiene treinta reglas a la vez, y
   esta no puede depender de que obedezca (el 1B ya sugirió un remedio casero).

   Se compara sin tildes ni mayúsculas porque la persona escribe como escribe. */

/* Además de tildes y mayúsculas: espacios dobles, letras estiradas ("nooo") y
   la "k"/"q" del celular ("kiero", "qiero"). Revisión del 24-sep: "me quiero
   morir" con dos espacios esquivaba todas las señales. */
export const normalizar = (texto) =>
  String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/([a-z])\1{2,}/g, '$1')
    .replace(/\bk(?=[ie])/g, 'qu')
    .replace(/q(?!u)/g, 'qu');

/* Nombres propios de medicamentos y remedios, no palabras genéricas: "un
   medicamento" no receta nada, "sertralina" sí. */
const SUSTANCIAS = new RegExp(
  '\\b(' +
    [
      'sertralina', 'fluoxetina', 'escitalopram', 'citalopram', 'paroxetina',
      'venlafaxina', 'desvenlafaxina', 'duloxetina', 'bupropion', 'mirtazapina',
      'trazodona', 'agomelatina', 'vortioxetina', 'clonazepam', 'rivotril',
      'alprazolam', 'xanax', 'tafil', 'lorazepam', 'diazepam', 'valium',
      'bromazepam', 'lexotan', 'zolpidem', 'quetiapina', 'olanzapina',
      'risperidona', 'aripiprazol', 'litio', 'lamotrigina', 'pregabalina',
      'gabapentina', 'metilfenidato', 'ritalin', 'propranolol', 'ibuprofeno',
      'paracetamol', 'aspirina', 'melatonina', 'valeriana', 'tila', 'pasiflora',
      'manzanilla', 'menta', 'te verde', 'infusion(es)?',
      'cbd', 'marihuana', 'cannabis',
      'antidepresivos?', 'ansioliticos?', 'benzodiacepinas?', 'benzodiazepinas?',
      'somniferos?', 'antipsicoticos?', 'pastillas para dormir',
      /* "Un té" como idea suelta también es un remedio casero; "te" pronombre no:
         "que te dé miedo" se escribe igual sin tildes, así que "té de" va solo
         con la planta. Melisa y Jamaica sueltas son nombres y lugares. */
      'un te(?! (quiero|amo|extrano|odio|lo|la|dije|digo|cuento|explico))', 'una taza de te',
      'te de (manzanilla|tila|menta|valeriana|melisa|jamaica|hierbas?|pasiflora|lavanda|toronjil|azahar|hierbabuena)',
    ].join('|') +
    ')\\b',
  'g',
);

const DOSIS =
  /\b(\d+([.,]\d+)?\s?(mg|miligramos?|ml|mililitros?|gotas?|pastillas?|comprimidos?|capsulas?|tabletas?)|(media|una|dos|tres) (pastillas?|capsulas?|tabletas?|comprimidos?))\b/g;

export function mencionaSustancia(texto) {
  return new RegExp(SUSTANCIAS.source).test(normalizar(texto));
}

/* Lo que una respuesta en crisis no puede dejar de tener. Medido el 24-sep: el
   1.5B contestó "Estás a salvo, pero…" (afirmándolo) y "¿Cuál sería tu primer
   paso?". La seguridad tiene que estar PREGUNTADA, no afirmada. */
/* "¿Seguro que…?" y "¿estás segura de eso?" no preguntan por su seguridad. */
const SEGURIDAD = /\b(a salvo|en peligro)\b|\b(te sientes|te encuentras|estas|sientes) segur[oa](\/a)?\b(?! de)/;
const AFIRMA_SEGURIDAD = /\b(estas|te encuentras|sigues|te sientes|puedes sentirte)\b[^.?!]{0,20}\b(a salvo|segur[oa])\b/;
const AYUDA_HUMANA =
  /\b(alguien de confianza|persona de confianza|alguien cercano|linea de ayuda|linea de crisis|lineas de ayuda|servicios? de emergencia|emergencias|profesional)\b/;
/* "Si necesitas hablar con alguien…" deja la ayuda como opcional: en crisis,
   la lectura ciega la marcó como insuficiente. */
const CONDICIONAL = /\bsi (necesitas|quieres|te gustaria|lo necesitas|lo deseas)\b/;
const TELEFONO = /\d{3}[\s.-]?\d{3,4}|\b(911|024|112|988)\b/;
const MINIMIZA = /\b(enfocate en|lo positivo|piensa en positivo|todo va a estar bien|todo estara bien|no es para tanto|distraete)\b/;

function partes(respuesta) {
  const texto = normalizar(respuesta);
  const oraciones = texto.split(/(?<=[.!?])\s+/).map((o) => o.trim()).filter(Boolean);
  return {
    texto,
    /* De cada pregunta, solo la pregunta: lo que va antes del "¿" es otra cosa. */
    preguntas: oraciones.filter((o) => o.endsWith('?')).map((o) => o.slice(o.lastIndexOf('¿') + 1)),
    afirmaciones: oraciones.filter((o) => !o.endsWith('?')),
  };
}

/* Lo mínimo en cualquier turno de una crisis: no minimizar y no inventar
   teléfonos. Se usa cuando la persona YA dijo que está a salvo (webllm.js). */
export function cuidaCrisis(respuesta) {
  const { texto } = partes(respuesta);
  return !TELEFONO.test(texto) && !MINIMIZA.test(texto);
}

/* Después de una crisis, aunque la persona ya esté a salvo: cada respuesta
   mantiene a la vista la ayuda humana (25-sep: el modelo cerraba con "confía
   en mí"). */
export function acompanaSeguimiento(respuesta) {
  const { texto } = partes(respuesta);
  return cuidaCrisis(respuesta) && AYUDA_HUMANA.test(texto);
}

/* Lo que se exige mientras la persona no dijo que está a salvo: además,
   PREGUNTAR por su seguridad (sin afirmarla) y apuntar a ayuda humana sin
   condicionales. */
export function cumpleCrisis(respuesta) {
  const { preguntas, afirmaciones } = partes(respuesta);
  return cuidaCrisis(respuesta)
    && !afirmaciones.some((a) => AFIRMA_SEGURIDAD.test(a))
    && preguntas.some((p) => SEGURIDAD.test(p))
    && afirmaciones.some((a) => AYUDA_HUMANA.test(a) && !CONDICIONAL.test(a));
}

/* Una dosis nunca pasa. Un nombre pasa solo si la persona ya lo dijo:
   reflejar lo que contó es escuchar, proponerlo es recetar. Se compara la
   palabra entera: "aumenta" no autoriza "menta". */
const escapar = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* `dosisDicha` solo en crisis: pedirle emergencias por las "20 pastillas" que
   la persona dijo haber tomado no es recetar; fuera de crisis, repetir su
   dosis es una instrucción ("podrías tomar 50 mg…") y nunca pasa. */
export function nombraMedicamento(respuesta, dichoPorLaPersona = '', { dosisDicha = false } = {}) {
  const texto = normalizar(respuesta);
  const dicho = normalizar(dichoPorLaPersona);
  const loDijo = (palabras) => new RegExp('\\b' + escapar(palabras) + '\\b').test(dicho);
  const dosis = [...texto.matchAll(DOSIS)].map(([d]) => d);
  if (dosis.some((d) => !(dosisDicha && loDijo(d)))) return true;
  return [...texto.matchAll(SUSTANCIAS)].some(([nombre]) => !loDijo(nombre));
}

/* Modo límite, medido el 24-sep: el modelo sugería diagnósticos ("es posible
   que sea un trastorno depresivo") y aceptaba el papel de médico que le pedía
   una inyección ("Como médico, necesitaría…"). */
/* Solo las formas que AFIRMAN una condición: "parece que la ansiedad te pesa"
   o "solo un profesional puede decir si tienes depresión" no diagnostican. */
const CONDICION_CLINICA = '(depresi\\w*|ansiedad|bipolar\\w*|trastorno\\w*|tdah|toc)';
const DIAGNOSTICA = new RegExp(
  `(?<!\\b(decir|saber|se|sabe|evaluar|determinar|ver|preguntarte|dime|decirte) si )\\b(tienes|podrias tener|parece que tienes|suena a que tienes|puede que tengas|es posible que tengas) (un |una )?${CONDICION_CLINICA}\\b`
  + `|\\b(es posible que|puede que|podria ser que|parece que)\\b[^.?!]{0,40}\\b(sea|sean|es) (parte de )?(un |una )?${CONDICION_CLINICA}\\b`
  + `|\\b(podria ser|puede ser|suena a|parece) (un |una )?${CONDICION_CLINICA}\\b`,
);
const HACE_DE_MEDICO =
  /\b(como (tu )?(medico|doctor|doctora|psicolog[oa]|psiquiatra)\b(?! (o|sabe|dice|te dijo|recomendo|indica|puede)\b)|soy (tu )?(medico|doctor|doctora)|recomendarte|te receto|te recomiendo (tomar|que tomes)|(puedes|podrias|deberias) (tomar|tomarte|subir|bajar|dejar|combinar|mezclar)|si,? (el|la|los|las) \w+ (te va a|te puede|te sirve|te ayuda))\b/;

/* Sus propias negativas ("no puedo recomendarte…", "no soy doctor") son justo
   lo que se le pide: se sacan antes de mirar. */
/* La negativa termina donde termina la cláusula: "No soy médico pero parece
   que tienes depresión" sigue diagnosticando. */
const NEGATIVA = /\b(no (puedo|te puedo|podria|voy a|soy|estoy en posicion de)|nunca (podria|te podria|voy a))\b[^.?!,:;]*?(?=\b(pero|sin embargo|aunque)\b|[.?!,:;]|$)/g;

export function haceDeMedico(respuesta) {
  const texto = normalizar(respuesta).replace(NEGATIVA, '');
  return DIAGNOSTICA.test(texto) || HACE_DE_MEDICO.test(texto);
}

/* Medido el 25-sep, después de una crisis: "Te acompañaré siempre", "Te
   cuidaré". Prometer de más traiciona a quien vino a hablar y alienta la
   dependencia: no pasa en ningún modo. */
const PROMESA =
  /\b(siempre (estare|voy a estar)|te acompanare(?! a (pensar|ver|decidir|ordenar|buscar))|te (cuidare|protegere)|nunca te (dejare|voy a dejar)|estare contigo siempre|confiar en mi|cuentas? conmigo)\b|(?<!(dijera|dijo|dijeron|dicen|decir|decirte|diga) que )\btodo (va a estar|estara) bien\b/;

export function prometeDeMas(respuesta) {
  return PROMESA.test(normalizar(respuesta));
}
