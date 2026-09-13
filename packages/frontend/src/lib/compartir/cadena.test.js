import { describe, expect, it } from 'vitest';
import { custom, decodeFunctionData, encodeFunctionResult, getAddress } from 'viem';
import { ABI_CONSENTIMIENTOS, ABI_PROFESIONALES, crearCadena } from './cadena.js';

const config = {
  chainId: 133,
  consentRegistry: '0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1',
  professionalRegistry: '0xD615074c2603336fa0Da8AF44B5CCB9D9C0B2F9c',
};

const PSICOLOGA = '0x00000000000000000000000000000000000000aa';
const USUARIO = '0x00000000000000000000000000000000000000bb';
const LLAVE = '0x' + '5e'.repeat(32);

/* Un nodo de mentira que contesta eth_call DECODIFICANDO lo que le piden con
   el ABI: si el adaptador llama a la función equivocada, o al contrato
   equivocado, esto no contesta lo que el test espera. */
function nodoDePrueba({ verificada = true, nonce = 7n } = {}) {
  const pedidos = [];
  const transporte = custom({
    async request({ method, params }) {
      if (method === 'eth_chainId') return '0x85';
      if (method !== 'eth_call') throw new Error('método inesperado: ' + method);
      const { to, data } = params[0];
      pedidos.push(getAddress(to));

      if (getAddress(to) === config.consentRegistry) {
        const { functionName, args } = decodeFunctionData({ abi: ABI_CONSENTIMIENTOS, data });
        expect(functionName).toBe('nonces');
        expect(args[0].toLowerCase()).toBe(USUARIO);
        return encodeFunctionResult({ abi: ABI_CONSENTIMIENTOS, functionName, result: nonce });
      }

      const { functionName } = decodeFunctionData({ abi: ABI_PROFESIONALES, data });
      if (functionName === 'isVerified') {
        return encodeFunctionResult({ abi: ABI_PROFESIONALES, functionName, result: verificada });
      }
      return encodeFunctionResult({
        abi: ABI_PROFESIONALES,
        functionName,
        result: [LLAVE, 'Lic. Demo', 1, 1900000000, USUARIO],
      });
    },
  });
  return { transporte, pedidos };
}

describe('crearCadena', () => {
  it('lee el nonce del usuario en el ConsentRegistry', async () => {
    const { transporte } = nodoDePrueba({ nonce: 7n });
    const cadena = crearCadena({ config, transporte });

    expect(await cadena.nonce(USUARIO)).toBe(7n);
  });

  /* La llave X25519 con la que se cifra sale de la cadena, no de un .env: así
     nadie puede hacer que la app cifre para otra persona cambiando un archivo. */
  it('lee la llave pública y si la psicóloga está verificada', async () => {
    const { transporte, pedidos } = nodoDePrueba({ verificada: true });
    const cadena = crearCadena({ config, transporte });

    expect(await cadena.credencial(PSICOLOGA)).toEqual({ publicKey: LLAVE, isVerified: true });
    expect(pedidos.every((a) => a === config.professionalRegistry)).toBe(true);
  });
});
