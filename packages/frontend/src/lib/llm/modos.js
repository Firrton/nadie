import { mencionaSustancia, normalizar } from './salvaguardas.js';

/* Cómo responde el modelo en cada turno. Lo decide el CÓDIGO, antes de la
   inferencia: medido el 21-sep, el 1.5B no sabe cuándo aconsejar y cuándo no
   (aconsejó después de "no quiero que me armes un plan"). Cada modo tiene un
   prompt corto con una sola tarea.

   Las listas de señales de crisis y de salud son una red de seguridad del
   modelo, no un cribado clínico: necesitan revisión clínica antes de salir a
   personas reales (openspec/changes/conversation-modes). */

export const MODOS = Object.freeze({
  ESCUCHAR: 'escuchar',
  PENSAR: 'pensar',
  LIMITE: 'limite',
  CRISIS: 'crisis',
  /* Después de una crisis, cuando la persona dice que está a salvo. */
  SEGUIMIENTO: 'seguimiento',
});

/* Se prefiere de más a de menos: un falso positivo pregunta si la persona está
   a salvo; un falso negativo le sugiere "enfocarse en lo positivo". Estas listas
   salieron de tres rondas de revisión adversarial (24 y 25-sep) y siguen siendo
   un respaldo: frases nuevas se les escapan (0 de 6 medidas). */

/* Hipérboles de actividad: "me voy a matar estudiando" no es una crisis. */
const ACTIVIDAD = '(estudiando|trabajando|entrenando|corriendo|limpiando|cocinando|haciendo|a (estudiar|trabajar|entrenar|correr|limpiar)|en el (gym|gimnasio|trabajo))';
const FARMACOS = '(pastillas|pildoras|capsulas|comprimidos|tabletas|clonazepam|rivotril|alprazolam|xanax|tafil|diazepam|valium|lorazepam|sertralina|fluoxetina|quetiapina|paracetamol|ibuprofeno)';
const DESTINO = '((del|de un|de una|de la|desde el|desde la|por la) (puente|edificio|balcon|ventana|techo|azotea)|(al|a un) (tren|metro|rio)|a las vias)';

const SENALES_CRISIS = [
  // Ideación explícita.
  /\bsuicid/,
  /\bquitarme la vida\b/,
  /\b(acabar|terminar) con (mi vida|todo)\b/,
  /\b(quiero|voy a|ganas de) matarme\b/,
  /\b(pienso|pense|pensado|pensando|penso) en (matarme|morirme|suicidarme|quitarme la vida|hacerme dano)\b/,
  new RegExp(`\\bme (quiero|voy a) matar\\b(?! ${ACTIVIDAD}\\b)`),
  new RegExp(`\\b(si|cuando)\\b[^.?!]{0,40}\\bme mato\\b(?! (${ACTIVIDAD}|de)\\b)`),
  new RegExp(`\\b(hoy|esta noche|manana|ahora|ya) me mato\\b(?! (${ACTIVIDAD}|de|en|con)\\b)`),
  /\bme quiero morir\b/,
  /\b(quiero|quisiera) (morirme|morir|desaparecer|dejar de existir|estar muert[oa])\b/,
  /\bganas de (morirme|morir|desaparecer)\b/,
  /\b(ojala|me importaria|me gustaria|quisiera|prefiero) (no despertar|no despierte|me muriera|me muera|desaparecer|morirme|morir)\b/,
  /\bdormir(me)? y no (despertar|volver a despertar)\b/,
  /\bno quiero (seguir )?(vivo|viva)\b/,
  /\bno quiero despertar(me)?\b(?! (temprano|tarde|a las))/,
  /\bno quiero (seguir )?(vivir|viviendo)\b(?! (con (mis|mi|los|las|mama|papa|nadie|roomies?|suegr\w+)|en (esta ciudad|este pais|esta casa|casa|el|la|un|una)|cerca|lejos|junto|aqui|alla|solo|sola|de alquiler)\b)/,
  /\bno le (veo|encuentro) (sentido|razon) a (la vida|vivir|seguir|levantarme)\b/,
  /\bno tengo (razones|motivos) (para )?(vivir|seguir)\b/,
  /\bmas facil no (estar|existir)\b/,
  /\bno (estoy|me siento) (a salvo|segur[oa])\b(?! de\b)/,
  /\bya no voy a estar\b(?= *([.,;!?]|$))/,

  // Método, en curso o ya hecho: lo más urgente.
  new RegExp(`\\b(me )?(tome|trague|bebi|acabo de (tomar|tragar)(me)?)\\b[^.?!]{0,30}\\b(\\d{2,}|[4-9]|una caja|un frasco|un blister|un monton de|muchas|todas|todo el frasco|toda la caja|el frasco|las que tenia)\\b[^.?!]{0,25}\\b${FARMACOS}\\b(?! (de hoy|del dia|de la manana|de la noche|de siempre)\\b)(?![^.?!]{0,25}\\b(para|por) (la|el|los|las|mi|mis) (gripa|gripe|dolor|muela|cabeza|fiebre|tos|migrana|resfriado|presion|espalda|garganta)\\b)`),
  new RegExp(`\\bme (tome|trague) (toda la caja|todo el frasco|el frasco entero)\\b(?=\\s*([.,;!?]|$)|\\s+de\\s+${FARMACOS}\\b)`),
  /\bme (tome|trague) las (pastillas|pildoras) que (tenia|guarde|junte)\b/,
  /\b(me )?(tome|trague) (el|un|todo el) (blister|frasco)( entero| completo)?\b/,
  /(?<!\b(olvida|olvido|olvide|acordarme de|tengo que|debo|hay que) )\btomarme todas (las|mis) pastillas\b/,
  /\b(pensando en|quiero|voy a) tomarmelas\b(?! (a la|en la|por la|despues|antes|con la|como)\b)|\btomarmelas (todas|de una vez|ya)\b/,
  /\btengo (las|todas las|mis) pastillas (en la mano|aqui|listas|juntas)\b/,
  /\bsobredosis\b/,
  /\b(dosis|cantidad) (letal|mortal)\b/,
  /\bcuant[oa]s (pastillas|pildoras|capsulas)\b[^.?!]{0,40}\b(hacen falta|se necesitan|necesito|necesitaria|para (morir|no despertar|matarme|dormir para siempre))\b/,
  /\b(colgarme|ahorcarme)\b(?! (del|de|al|a la|en)\b)|\bme (voy a|quiero) (colgar|ahorcar)\b(?! (del|de|al|a la|en)\b)/,
  new RegExp(`\\b(tirarme|aventarme|lanzarme|me (voy a|quiero) (tirar|aventar|lanzar)|me (tiro|tire|avente|lance)) ${DESTINO}\\b`),
  /\b(hacerme dano|lastimarme)\b/,
  /\bme (lastime|hice dano|golpee|queme) a proposito\b/,
  /\b(cortarme|me (corte|estoy cortando|quiero cortar)) (las venas|los brazos|las munecas|las piernas)\b/,
  /\bme corte otra vez\b|\bme (volvi|vuelvo) a cortar\b|\bme sigo cortando\b/,
  /* Solo sin objeto o con "otra vez": "me corté cocinando" o "me estoy
     cortando el fleco" no lo son. */
  /\bme estoy cortando\b(?=\s*([.,;!?]|$|otra vez|de nuevo|y no|a proposito))/,
  /\b(anoche|hoy|ayer|otra vez|de nuevo) me corte\b(?=\s*([.,;!?]|$|otra vez|de nuevo|y no|a proposito))/,

  /* Señales de alerta de manual: sentirse una carga, despedirse, regalar lo
     propio, dejar todo en orden. Medido: el modelo las trató como un desahogo
     común (12 de 12) y llegó a elogiarlas ("es una buena decisión"). */
  /\b(soy|me siento|ser) (un|una) (carga|estorbo)\b/,
  /\b(van a estar|estarian?|estaran) (mejor|bien) sin mi\b/,
  /\b(cartas?|mensajes?) (para|de) (despedirme|despedida)\b/,
  /\bdespedirme de (mi familia|todos|la vida)\b/,
  /\bregale (mis|todas mis) cosas\b/,
  /\bdeje todo (ordenado|arreglado|en orden)\b/,
  /* Solo como despedida: "cuando no esté tan cansada" o "cuando no esté aquí
     mi mamá" no lo son. */
  /\bcuando (yo )?(ya )?no (este|estemos)\b(?=\s*([.,;!?]|$|para\b|aqui\s*([.,;!?]|$)|mas\s*([.,;!?]|$)|(ustedes|todos|nadie|mi familia|mis hijos|van a|va a|se van a|vas a|cuiden|cuidalos|cuida)\b))/,
];

/* "Me quiero morir de la vergüenza" no es una crisis. Se borra la hipérbole
   antes de buscar señales, así no tapa una señal real en el mismo mensaje. */
const HIPERBOLES =
  /\b(me )?(muero|mato|morir(me)?|matar(me)?) de (la |el |lo )?(verguenza|risa|sueno|hambre|calor|frio|aburrimiento|envidia|ganas|nervios|celos|amor)\b/g;

const CONDICION =
  '(depresion|depresiva|depresivo|deprimid[oa]|ansiedad|bipolar|tdah|toc|trastorno|esquizofreni\\w*|borderline|autis\\w*|anorexi\\w*|bulimi\\w*)';
const SUSTANCIA_PEDIDA = '(pastillas?|medicamentos?|medicinas?|remedios?|dosis|antidepresivos?|ansioliticos?|suplementos?)';
const PARA_QUE = '(dormir|la ansiedad|los nervios|la depresion|calmarme|relajarme)';

/* Pedidos de salud en cualquier forma: afirmar "quiero un diagnóstico" o
   "quiero dejar mis pastillas" ya lo es. */
const PIDE_SALUD = [
  /\b(quiero|necesito|dame|me das|me puedes dar)\b[^.?!]{0,20}\bdiagnostico\b/,
  /\b(puedes|podrias) diagnosticar(me)?\b|\bdiagnosticame\b/,
  new RegExp(`\\b(crees que|sera que|es posible que|puede ser que) (tengo|tenga|soy|sea|estoy|este) (un |una )?${CONDICION}`),
  new RegExp(`¿\\s*(tengo|tendre|sere|soy|estoy) (un |una )?${CONDICION}`),
  /* En primera persona: "me volvieron a cambiar la medicación" es desahogo. */
  /\b(quiero|voy a|puedo|deberia|debo|pienso) (dejar|subir|bajar|aumentar|cambiar|suspender) (la|mi|mis|el|los) (medicacion|medicamentos?|medicinas?|dosis|pastillas|tratamiento)\b/,
  /* Imperativos, también en voseo, pidiendo algo para tomar: "recomiéndame una
     playlist para dormir" o "dame ánimos" no lo son. */
  new RegExp(`\\b(recomiendame|recomendame|me recomiendas|me recomendas)\\b[^.?!]{0,10}\\b(algo|alguna pastilla|algun remedio|que tomar)\\b[^.?!]{0,20}\\bpara ${PARA_QUE}\\b`),
  /\bque me (recomiendas|recomendas) tomar\b/,
  new RegExp(`\\b(dime|decime) (que|cual|cuantas?|cuantos?)\\b[^.?!]{0,25}\\b${SUSTANCIA_PEDIDA}\\b`),
  new RegExp(`\\b(dame|recomiendame|recomendame|recetame) (una |un |algun |alguna |unas |unos )?${SUSTANCIA_PEDIDA}\\b`),
  /\b(dime|decime) que (tomo|me tomo|puedo tomar)\b/,
  new RegExp(`\\b(dime|decime)\\b[^.?!]{0,30}\\bsi (tengo|soy|estoy) (un |una )?${CONDICION}`),
];

/* Solo cuentan como pedido si son pregunta: "mi psiquiatra dice que tengo que
   seguir con los antidepresivos" es desahogo (revisión del 24-sep). */
const PREGUNTA_SALUD = [
  new RegExp(`\\b(que|cual|cuanto|cuantos|cuantas)\\b[^.?!]{0,40}\\b(${SUSTANCIA_PEDIDA}|mg|miligramos)\\b`),
  /\b(que|algo que) (me )?(puedo|pueda|debo|deberia) tomar\b(?! (en cuenta|una decision|decisiones|aire|el|la|un|una|las|los)\b)/,
  new RegExp(`\\bque (tomo|me tomo|puedo tomar) para ${PARA_QUE}\\b`),
  /\b(que|cual) (te|infusion|remedio)s? (me )?(recomiendas|puedo tomar|tomo)\b/,
  /\b(me recomiendas|recomiendame|me recetas)\b[^.?!]{0,40}\b(pastillas?|medicamentos?|remedios?|tes?|infusion|infusiones|suplementos?|vitaminas?)\b/,
  /\b(dejo|subo|bajo|cambio|suspendo) (la|mi|mis|el|los) (medicacion|medicamentos?|medicinas?|dosis|pastillas|tratamiento)\b/,
  /\b(mezclar|combinar|tomar)\b[^.?!]{0,30}\b(pastillas|medicamentos|medicacion)\b[^.?!]{0,20}\b(alcohol|vino|cerveza|tragos?)\b|\b(alcohol|vino|cerveza|tragos?)\b[^.?!]{0,20}\bcon (mis |las |el |la )?(pastillas|medicamentos|medicacion)\b/,
];

const RECHAZA_CONSEJO = [
  /\bno (quiero|necesito|busco) (consejos?|un plan|planes|soluciones|que me (digas|arregles|resuelvas|des|armes))\b/,
  /\bsolo (quiero|queria|necesito|necesitaba) (desahogarme|contarlo|decirlo|soltarlo|hablar|sacarlo|que me escuches)\b/,
  /\bno me (digas|des) (que hacer|consejos?)\b/,
  /\bno me armes\b/,
  /\bsin consejos\b/,
  /\bsolo escuchame\b/,
];

/* "No sé qué hacer" es desahogo; "¿qué hago?" es un pedido. */
const PIDE_AYUDA = [
  /(?<!\bno se )\bque (hago|hare|puedo hacer|deberia hacer|harias|me recomiendas|me aconsejas|me sugieres)\b/,
  /\b(dame|me das|me puedes dar|podrias darme|tienes|hay) (una |unas |algun |algunos |alguna |algunas )?(ideas?|consejos?|sugerencias?|tips?|opciones)\b/,
  /\b(ayudame|me ayudas|me puedes ayudar|podrias ayudarme) a (pensar|decidir|ordenar|elegir|resolver|organizar|ver|entender)(lo|la|los|las)?\b/,
  /\b(necesito|quiero) (ideas|consejos?|sugerencias|ayuda para (decidir|pensar|elegir|resolver))\b/,
  /\bcomo (le digo|le hago|hago para|puedo hacer para|le explico)\b/,
  /\b(que opinas|tu que opinas|que piensas tu)\b/,
];

const alguna = (senales, texto) => senales.some((senal) => senal.test(texto));

const esCrisis = (texto) => alguna(SENALES_CRISIS, texto.replace(HIPERBOLES, ''));

const pideSalud = (texto) =>
  alguna(PIDE_SALUD, texto) || (texto.includes('?') && (alguna(PREGUNTA_SALUD, texto) || mencionaSustancia(texto)));

/* La crisis mira toda la conversación: después de una señal, el desahogo ya no
   es común. Los pedidos miran solo el último mensaje: pedir ideas una vez no
   convierte el resto de la charla en consejos. */
/* Solo estar a salvo o acompañada cuenta (revisión del 25-sep): "estoy
   tranquila, ya lo decidí" o "ya me siento mejor, no pasa nada" no lo son. */
const DICE_A_SALVO = /\b(estoy a salvo|me siento a salvo|estoy (acompanad[oa]|con alguien|con mi \w+)|(esta|estan) conmigo)\b/;
const NIEGA_A_SALVO = /\bno (estoy|me siento) (a salvo|segur[oa])\b/;

const diceASalvo = (texto) => DICE_A_SALVO.test(texto) && !NIEGA_A_SALVO.test(texto);

export function elegirModo(mensajes = []) {
  const dichos = mensajes.filter((m) => m.role === 'user').map((m) => normalizar(m.content));
  if (dichos.length === 0) return MODOS.ESCUCHAR;

  const ultimo = dichos[dichos.length - 1];
  /* Desde la última señal de crisis: si después la persona dijo que está a
     salvo, se acompaña sin volver a preguntar lo mismo (seguimiento), hasta
     una señal nueva. Si no lo dijo, sigue la crisis. */
  const ultimaCrisis = dichos.map(esCrisis).lastIndexOf(true);
  if (ultimaCrisis >= 0) {
    return dichos.slice(ultimaCrisis + 1).some(diceASalvo) ? MODOS.SEGUIMIENTO : MODOS.CRISIS;
  }
  if (pideSalud(ultimo)) return MODOS.LIMITE;
  if (alguna(RECHAZA_CONSEJO, ultimo)) return MODOS.ESCUCHAR;
  if (alguna(PIDE_AYUDA, ultimo)) return MODOS.PENSAR;
  return MODOS.ESCUCHAR;
}
