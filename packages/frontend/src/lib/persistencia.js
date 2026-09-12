/* Pedirle al navegador que NO borre lo que guardamos.

   Medido el 2026-09-12 en este equipo: navigator.storage.persisted() daba false
   y la cuota del origen era de 3470 MB. Sin persistencia, el navegador puede
   desalojar el almacenamiento del sitio cuando necesita espacio.

   LO QUE SE PIERDE NO ES SOLO EL MODELO. Los pesos son 873 MB y se vuelven a
   bajar: es tiempo. El REGISTRO DE ÁNIMO vive en localStorage, que cae bajo la
   misma cuota, y eso no se vuelve a bajar de ningún lado. Es el diario de una
   persona, y es lo único que la app promete guardar.

   CUÁNDO SE PIDE. No al abrir por primera vez: algunos navegadores muestran un
   permiso, y pedirlo antes de que exista algo que perder es pedirle a alguien
   que firme por una caja vacía. Se pide cuando hay algo real que proteger —
   cuando se registra el primer ánimo, o cuando está por bajar el modelo.

   QUE LO NIEGUEN NO ES UN ERROR. La app funciona igual; lo que pierde es la
   garantía. Por eso esto no lanza nunca y nadie espera su resultado. */

let yaSePidio = false;

/* Solo para los tests: cada uno arranca sin memoria del anterior. */
export function olvidarQueSePidio() {
  yaSePidio = false;
}

export async function asegurarPersistencia({
  storage = typeof navigator !== 'undefined' ? navigator.storage : null,
} = {}) {
  if (!storage || typeof storage.persist !== 'function') {
    return { ok: false, motivo: 'sin-api' };
  }

  /* Preguntar antes de pedir: si ya está concedido, volver a pedirlo sería
     arriesgarse a un permiso que no hace falta. */
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) {
      return { ok: true, motivo: 'ya-estaba' };
    }
  } catch (e) {
    return { ok: false, motivo: 'no-se-pudo-consultar' };
  }

  /* Una sola vez por sesión. Insistir después de un "no" es molestar. */
  if (yaSePidio) return { ok: false, motivo: 'ya-se-pidio' };
  yaSePidio = true;

  try {
    const concedido = await storage.persist();
    return { ok: Boolean(concedido), motivo: concedido ? 'concedido' : 'denegado' };
  } catch (e) {
    return { ok: false, motivo: 'no-se-pudo-pedir' };
  }
}
