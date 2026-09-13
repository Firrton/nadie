import { encryptPackage, hashEncryptedPackage, serializeEncryptedPackage } from '@nadie/core';
import { getAddress, toHex } from 'viem';
import { armarGrant } from './consentimiento.js';

/* Mandarle a la psicóloga lo que la persona aprobó.

   El orden importa y no es negociable:

   1. VERIFICAR antes que nada. Si la credencial no está vigente no sale NADA
      del dispositivo, ni siquiera cifrado.
   2. CIFRAR con la llave pública que la psicóloga registró on-chain. El gateway
      guarda bytes que no puede leer.
   3. SUBIR el paquete bajo su hash.
   4. FIRMAR el permiso (EIP-712). La persona no paga gas: firma y el relayer
      publica.
   5. ESPERAR la confirmación. "Enviado" se dice cuando la cadena lo confirma,
      no cuando el relayer lo recibe.

   Todo lo que toca afuera se inyecta (cadena, fetch, reloj, espera): el flujo
   entero se prueba sin red, con el cifrado REAL de core. */

const ALCANCE = 'graph-summary';
const VIGENCIA_SEGUNDOS = 7 * 24 * 60 * 60;
const PLAZO_DE_FIRMA_SEGUNDOS = 10 * 60;
const INTENTOS_DE_CONFIRMACION = 90;
const PAUSA_ENTRE_INTENTOS_MS = 2000;

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

export async function enviarAPsicologa({
  documento,
  config,
  cuenta,
  cadena,
  fetch = globalThis.fetch.bind(globalThis),
  ahora = () => Math.floor(Date.now() / 1000),
  esperar = pausa,
  alProgresar = () => {},
}) {
  /* Las direcciones llegan de un .env escrito a mano. viem rechaza una con
     mayúsculas mal puestas (checksum inválido): pasar por minúsculas acepta
     cualquier forma y devuelve la canónica. */
  const professional = getAddress(config.professional.toLowerCase());
  const consentRegistry = getAddress(config.consentRegistry.toLowerCase());

  alProgresar('verificando');
  const credencial = await cadena.credencial(professional);
  if (!credencial.isVerified) throw new Error('profesional-no-verificada');

  alProgresar('cifrando');
  /* core exige la dirección en minúsculas dentro de la metadata del paquete. */
  const sobre = await encryptPackage(new TextEncoder().encode(documento), credencial.publicKey, {
    professional: professional.toLowerCase(),
    scope: ALCANCE,
  });
  const packageHash = hashEncryptedPackage(sobre);

  alProgresar('subiendo');
  const subida = await fetch(config.gatewayUrl + '/v1/packages/' + packageHash, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    body: serializeEncryptedPackage(sobre),
  });
  if (subida.status !== 201) throw new Error('gateway-rechazo-' + subida.status);

  alProgresar('firmando');
  const t = ahora();
  const consentId = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const { typedData, cuerpoParaRelayer } = armarGrant({
    chainId: config.chainId,
    verifyingContract: consentRegistry,
    consentId,
    user: cuenta.address,
    professional,
    packageHash,
    scope: ALCANCE,
    expiresAt: t + VIGENCIA_SEGUNDOS,
    nonce: await cadena.nonce(cuenta.address),
    deadline: t + PLAZO_DE_FIRMA_SEGUNDOS,
  });
  const firma = await cuenta.signTypedData(typedData);

  alProgresar('publicando');
  const envio = await fetch(config.relayerUrl + '/v1/transactions/grants', {
    method: 'POST',
    /* La misma clave para el mismo consentimiento: si se reintenta, el relayer
       no lo publica dos veces. */
    headers: { 'content-type': 'application/json', 'idempotency-key': consentId.slice(2, 34) },
    body: JSON.stringify(cuerpoParaRelayer(firma)),
  });
  if (envio.status !== 202) throw new Error('relayer-rechazo-' + envio.status);
  const { transactionHash } = await envio.json();

  alProgresar('confirmando');
  for (let i = 0; i < INTENTOS_DE_CONFIRMACION; i += 1) {
    const { status } = await (await fetch(config.relayerUrl + '/v1/transactions/' + transactionHash)).json();
    if (status === 'confirmed') {
      alProgresar('listo');
      return { consentId, packageHash, transactionHash };
    }
    if (status === 'reverted') throw new Error('transaccion-revertida');
    await esperar(PAUSA_ENTRE_INTENTOS_MS);
  }
  throw new Error('confirmacion-demorada');
}
