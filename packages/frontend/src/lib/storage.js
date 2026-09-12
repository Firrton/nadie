/* Frontera con el medio de almacenamiento.

   Este archivo es lo ÚNICO de la app que sabe que hoy guardamos en
   localStorage. Cuando esto pase a Capacitor o React Native, se cambia este
   módulo por Keychain / EncryptedSharedPreferences y nada más se entera.

   Qué se guarda: SOLO el registro de ánimo (número + fecha + nota opcional).
   Las transcripciones no se guardan nunca, ni aquí ni en ningún lado.

   localStorage es TEXTO PLANO. No hay forma honesta de cifrarlo contra quien
   tiene el dispositivo: cualquier clave que usáramos tendría que vivir al lado
   del dato. Por eso el Home dice "solo en este teléfono" y no "cifrado" — el
   cifrado real llega con el almacén nativo. */

const KEY = 'nadie.mood';
const VERSION = 1;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isValidEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.value !== 'number' || !Number.isFinite(entry.value)) return false;
  if (entry.value < 0 || entry.value > 1) return false;
  if (entry.note != null && typeof entry.note !== 'string') return false;
  return true;
}

/* OJO — divergencia conocida con @nadie/core.

   `CheckInProposalSchema` (packages/core/src/schemas.js) define el check-in
   como `score: entero 1–10`. Acá el ánimo es `value: float 0..1`, porque esta
   persistencia se escribió antes de que existiera ese contrato.

   Consecuencia concreta: un check-in con la forma de core entra acá y lo
   descarta isValidEntry dos veces — no trae `value`, y si lo renombraras, 7
   está fuera de 0..1. Unificar la escala toca mood.js (RATING_STEPS), la
   comparación contra 0.5 de moodTint y buildJourney, MoodCurve y sus tests: es
   una decisión deliberada, no un rename.

   Mientras tanto, descartar no puede ser silencioso. */

/* Devuelve el registro guardado, o {} ante cualquier problema.
   Un localStorage corrupto, editado a mano o de otra versión no puede tirar la
   app: se descarta lo inválido y se devuelve lo que sí se entiende. */
export function loadMoodLog() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch (e) {
    return {}; // Safari en modo privado, storage deshabilitado por política
  }
  if (!raw) return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {};
  }

  const entries = parsed && typeof parsed === 'object' ? parsed.entries : null;
  if (!entries || typeof entries !== 'object') return {};

  const limpio = {};
  let descartados = 0;
  Object.keys(entries).forEach((key) => {
    if (DATE_KEY.test(key) && isValidEntry(entries[key])) limpio[key] = entries[key];
    else descartados += 1;
  });

  /* Solo la cuenta, nunca el contenido: lo que hay acá es lo más sensible de la
     app y no puede terminar en la consola de nadie. Que aparezca este aviso
     significa que algo escribió con otra forma — ver la divergencia con core
     arriba— y que ese dato se está perdiendo. */
  if (descartados > 0 && typeof console !== 'undefined') {
    console.warn('[nadie] se descartaron ' + descartados + ' entradas del registro por tener una forma desconocida');
  }
  return limpio;
}

/* Guarda el registro. Devuelve false si no se pudo (cuota llena, modo privado).
   La app sigue funcionando con el estado en memoria; lo que no puede es
   caerse porque el disco dijo que no. */
export function saveMoodLog(entries) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, entries }));
    return true;
  } catch (e) {
    return false;
  }
}

/* Borra de verdad. Lo llama "Borrar todo mi historial" en Ajustes, y el copy de
   esa pantalla promete que no hay forma de recuperarlo. */
export function clearMoodLog() {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch (e) {
    return false;
  }
}
