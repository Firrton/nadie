import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

/* La cuenta con la que la persona firma sus permisos.

   Tiene que DURAR: el permiso lo revoca la misma cuenta que lo firmó. No paga
   gas nunca (firma y el relayer publica), así que no hace falta fondearla.

   DEUDA DECLARADA: hoy vive en localStorage, en claro, igual que el registro de
   ánimo. El lugar correcto es el baúl (lib/vault), que ya cifra pero todavía no
   tiene su adaptador de IndexedDB. Cuando lo tenga, esta llave se muda ahí. */

const CLAVE = 'nadie.firma';
const LLAVE_PRIVADA = /^0x[0-9a-f]{64}$/;

export function cargarOCrearCuenta({ storage = globalThis.localStorage } = {}) {
  const guardada = storage.getItem(CLAVE);
  if (guardada && LLAVE_PRIVADA.test(guardada)) return privateKeyToAccount(guardada);

  const nueva = generatePrivateKey();
  storage.setItem(CLAVE, nueva);
  return privateKeyToAccount(nueva);
}
