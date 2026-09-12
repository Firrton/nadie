/* El baúl: la implementación del VaultPort de @nadie/core.

   QUÉ PROTEGE Y QUÉ NO. Las llaves son CryptoKey no extraíbles y viven en el
   mismo dispositivo que los datos: esto NO protege contra alguien que tiene el
   teléfono desbloqueado y abre la app. Lo que sí da:

   - Nada legible en disco (REGLAS §7.2): ni el contenido ni el id del registro.
   - Borrado por destrucción de llave: sin la llave, lo que quedó en IndexedDB
     —incluso restos que el motor no compactó— es ruido.
   - Integridad: un registro alterado, o movido bajo otro id, no se lee.

   EL ALMACÉN Y LAS LLAVES SE INYECTAN. Este archivo no sabe de IndexedDB: recibe
   algo con get/put/delete de bytes por clave string. Así la criptografía se
   prueba entera en Node, y el almacén real se prueba aparte en un navegador. */

const VERSION = 1;
const LARGO_IV = 12;

const texto = new TextEncoder();

/* El id nunca llega en claro al almacén: se guarda bajo HMAC(id). Es
   determinístico —el mismo id cae siempre en la misma clave, así read lo
   encuentra— pero sin la llave no se puede ni adivinar ni enumerar. */
async function claveOpaca(llave, recordId) {
  const firma = await crypto.subtle.sign('HMAC', llave, texto.encode(recordId));
  return Array.from(new Uint8Array(firma), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function crearBoveda({ almacen, llaves }) {
  return {
    async save(recordId, payload) {
      const iv = crypto.getRandomValues(new Uint8Array(LARGO_IV));
      /* El id va como dato adicional autenticado: el cifrado queda atado a su
         id, y copiarlo bajo otra clave hace fallar la verificación. */
      const cifrado = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: texto.encode(recordId) },
        llaves.cifrado,
        payload,
      );

      const sobre = new Uint8Array(1 + LARGO_IV + cifrado.byteLength);
      sobre[0] = VERSION;
      sobre.set(iv, 1);
      sobre.set(new Uint8Array(cifrado), 1 + LARGO_IV);

      await almacen.put(await claveOpaca(llaves.identificador, recordId), sobre);
    },

    async read(recordId) {
      const sobre = await almacen.get(await claveOpaca(llaves.identificador, recordId));
      if (sobre === undefined) return undefined;
      /* Sin mensaje con datos: los errores del baúl no dicen qué había adentro. */
      if (sobre[0] !== VERSION) throw new Error('registro ilegible');
      const claro = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: sobre.subarray(1, 1 + LARGO_IV), additionalData: texto.encode(recordId) },
        llaves.cifrado,
        sobre.subarray(1 + LARGO_IV),
      );
      return new Uint8Array(claro);
    },

    async remove(recordId) {
      await almacen.delete(await claveOpaca(llaves.identificador, recordId));
    },
  };
}
