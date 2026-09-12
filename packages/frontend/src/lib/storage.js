/* Frontera con el medio de almacenamiento.

   Este archivo es lo ÚNICO de la app que sabe que hoy guardamos en
   localStorage. Cuando esto pase a Capacitor o React Native, se cambia este
   módulo por Keychain / EncryptedSharedPreferences y nada más se entera.

   Qué se guarda: SOLO el registro de ánimo (puntaje + fecha + nota opcional).
   Las transcripciones no se guardan nunca, ni aquí ni en ningún lado.

   localStorage es TEXTO PLANO. No hay forma honesta de cifrarlo contra quien
   tiene el dispositivo: cualquier clave que usáramos tendría que vivir al lado
   del dato. Por eso el Home dice "solo en este teléfono" y no "cifrado" — el
   cifrado real llega con el almacén nativo. */

import { MOOD_MAX, MOOD_MIN } from './mood.js';

const KEY = 'nadie.mood';
const VERSION = 2;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/* La escala es la de `CheckInProposalSchema.score` de @nadie/core: entero 1–10.
   Un check-in con la forma de core entra acá y se conserva; ANTES se descartaba
   dos veces (no traía `value`, y 7 estaba fuera de 0..1). */
function esPuntajeValido(score) {
  return Number.isInteger(score) && score >= MOOD_MIN && score <= MOOD_MAX;
}

function isValidEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (!esPuntajeValido(entry.score)) return false;
  if (entry.note != null && typeof entry.note !== 'string') return false;
  /* Los campos de más pasan: `CheckIn` de core trae emotions, source y linkedSessionId,
     y esta capa no tiene por qué tirarlos solo porque la UI todavía no los dibuja. */
  return true;
}

/* --- Migración v1 → v2 -----------------------------------------------------

   La v1 guardaba `value`: float 0..1 con el neutro en 0.5. La v2 guarda `score`:
   entero 1–10 con el neutro en 5.

   Se migra por PASO MÁS CERCANO, no por regla lineal, y no es una comodidad: el
   único camino que escribe ánimo es `rateToday`, que solo recibe valores de
   RATING_STEPS. O sea que el dato real de una persona SIEMPRE fue uno de estos
   cinco floats, y el mapeo es exacto, sin pérdida. Los valores intermedios solo
   existen en el mes sembrado de demo, y ahí caer al paso vecino es correcto.

   Migrar por FORMA y no por el número de versión guardado es a propósito: el
   campo `v` puede venir ausente, viejo o mal escrito por otra versión de la app;
   la forma de la entrada no puede mentir. Además vuelve la migración idempotente. */
const PASOS_V1 = [
  [0.15, 1],
  [0.35, 3],
  [0.5, 5],
  [0.65, 7],
  [0.85, 9],
];

function migrarDesdeV1(entry) {
  const v = entry.value;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return null;

  let cercano = PASOS_V1[0];
  PASOS_V1.forEach((paso) => {
    if (Math.abs(v - paso[0]) < Math.abs(v - cercano[0])) cercano = paso;
  });

  const migrada = Object.assign({}, entry, { score: cercano[1] });
  delete migrada.value;
  return migrada;
}

/* Deja la entrada en la forma de la v2, venga de donde venga. */
function normalizarEntrada(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (esPuntajeValido(entry.score)) return entry; // ya está en la escala de core
  return migrarDesdeV1(entry);
}

/* Devuelve el registro guardado, o {} ante cualquier problema.
   Un localStorage corrupto, editado a mano o de otra versión no puede tirar la
   app: se descarta lo inválido y se devuelve lo que sí se entiende.

   Leer NO reescribe. Migrar en memoria y dejar que el próximo `rateToday` sea
   quien persista la v2 mantiene esta función sin efectos: un bug acá no puede
   pisar el historial de nadie. El costo es recorrer la migración en cada lectura,
   que sobre 28 días no es costo. */
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
    const entrada = DATE_KEY.test(key) ? normalizarEntrada(entries[key]) : null;
    if (entrada && isValidEntry(entrada)) limpio[key] = entrada;
    else descartados += 1;
  });

  /* Solo la cuenta, nunca el contenido: lo que hay acá es lo más sensible de la
     app y no puede terminar en la consola de nadie. Que aparezca este aviso
     significa que algo escribió con una forma que ni siquiera la migración
     entiende, y que ese dato se está perdiendo. */
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
