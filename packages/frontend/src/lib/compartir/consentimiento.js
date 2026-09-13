import { keccak256, stringToBytes } from 'viem';

/* El consentimiento que firma la persona (EIP-712).

   Tipos copiados de packages/relayer/src/types.ts, que a su vez replica el
   contrato. NO se importa @nadie/relayer: su index arrastra node:crypto y rompe
   el bundle del navegador.

   LA TRAMPA DE LOS NÚMEROS. Para FIRMAR, viem necesita los tipos de Solidity
   (uint40 como Number, uint256 como BigInt). Para el RELAYER, el JSON lleva
   strings decimales. Mismo valor, dos codificaciones; mezclarlas da una firma
   que recupera otra dirección y un 422 sin más explicación. */

export const GRANT_TYPES = {
  Grant: [
    { name: 'consentId', type: 'bytes32' },
    { name: 'user', type: 'address' },
    { name: 'professional', type: 'address' },
    { name: 'packageHash', type: 'bytes32' },
    { name: 'scope', type: 'bytes32' },
    { name: 'expiresAt', type: 'uint40' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export function armarGrant({
  chainId, verifyingContract, consentId, user, professional, packageHash, scope, expiresAt, nonce, deadline,
}) {
  const domain = { name: 'NadieConsentRegistry', version: '1', chainId, verifyingContract };
  const message = {
    consentId,
    user,
    professional,
    packageHash,
    scope: keccak256(stringToBytes(scope)),
    expiresAt: Number(expiresAt),
    nonce: BigInt(nonce),
    deadline: BigInt(deadline),
  };

  return {
    typedData: { domain, types: GRANT_TYPES, primaryType: 'Grant', message },
    cuerpoParaRelayer: (signature) => ({
      domain,
      message: {
        ...message,
        expiresAt: String(message.expiresAt),
        nonce: message.nonce.toString(),
        deadline: message.deadline.toString(),
      },
      signature,
    }),
  };
}
