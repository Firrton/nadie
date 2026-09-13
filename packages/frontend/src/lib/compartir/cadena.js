import { createPublicClient, http } from 'viem';

/* Lecturas de HashKey que necesita compartir. Solo lectura: la persona nunca
   manda transacciones desde acá (firma, y el relayer publica).

   Fragmentos de ABI copiados de los contratos (los mismos que usan relayer y el
   portal de la psicóloga). Solo lo que se usa.

   El transporte se inyecta: en la app es http(rpcUrl); en los tests, un nodo de
   mentira que decodifica los eth_call con este mismo ABI. */

export const ABI_CONSENTIMIENTOS = [
  {
    type: 'function',
    name: 'nonces',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

export const ABI_PROFESIONALES = [
  {
    type: 'function',
    name: 'credentials',
    stateMutability: 'view',
    inputs: [{ name: 'professional', type: 'address' }],
    outputs: [
      { name: 'publicKey', type: 'bytes32' },
      { name: 'displayName', type: 'string' },
      { name: 'status', type: 'uint8' },
      { name: 'expiresAt', type: 'uint40' },
      { name: 'issuer', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'isVerified',
    stateMutability: 'view',
    inputs: [{ name: 'professional', type: 'address' }],
    outputs: [{ name: 'verified', type: 'bool' }],
  },
];

export function crearCadena({ config, transporte = http(config.rpcUrl) }) {
  const cliente = createPublicClient({ transport: transporte });

  return {
    async nonce(usuario) {
      return cliente.readContract({
        address: config.consentRegistry,
        abi: ABI_CONSENTIMIENTOS,
        functionName: 'nonces',
        args: [usuario],
      });
    },

    /* La llave con la que se cifra sale de la cadena, no de un .env. */
    async credencial(profesional) {
      const [credencial, isVerified] = await Promise.all([
        cliente.readContract({
          address: config.professionalRegistry,
          abi: ABI_PROFESIONALES,
          functionName: 'credentials',
          args: [profesional],
        }),
        cliente.readContract({
          address: config.professionalRegistry,
          abi: ABI_PROFESIONALES,
          functionName: 'isVerified',
          args: [profesional],
        }),
      ]);
      return { publicKey: credencial[0], isVerified };
    },
  };
}
