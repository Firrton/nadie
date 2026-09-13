import { describe, expect, it } from 'vitest';
import {
  decryptPackage,
  deserializeEncryptedPackage,
  generateEncryptionKeyPair,
  hashEncryptedPackage,
} from '@nadie/core';
import { privateKeyToAccount } from 'viem/accounts';
import { enviarAPsicologa } from './enviar.js';

const cuenta = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const PSICOLOGA = '0x00000000000000000000000000000000000000Aa';

const config = {
  chainId: 133,
  consentRegistry: '0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1',
  professional: PSICOLOGA,
  gatewayUrl: 'http://localhost:8787',
  relayerUrl: 'http://localhost:8788',
};

/* Gateway y relayer de mentira: responden como los reales y guardan lo que
   recibieron, para auditar QUÉ salió del dispositivo. */
function redDePrueba({ estados = ['pending', 'confirmed'] } = {}) {
  const llamadas = [];
  const pendientes = [...estados];
  const fetch = async (url, init = {}) => {
    llamadas.push({ url, init });
    const metodo = init.method || 'GET';
    if (metodo === 'PUT') return new Response(JSON.stringify({ packageHash: 'x' }), { status: 201 });
    if (metodo === 'POST') return new Response(JSON.stringify({ transactionHash: '0x' + 'cd'.repeat(32) }), { status: 202 });
    const status = pendientes.length > 1 ? pendientes.shift() : pendientes[0];
    return new Response(JSON.stringify({ status }), { status: 200 });
  };
  return { fetch, llamadas };
}

async function escenario({ verificada = true, estados } = {}) {
  const llaves = await generateEncryptionKeyPair();
  const red = redDePrueba({ estados });
  const cadena = {
    credencial: async () => ({ publicKey: llaves.publicKey, isVerified: verificada }),
    nonce: async () => 5n,
  };
  return { llaves, red, cadena };
}

const documento = 'Semanas de mucho peso\n2026-08-16 a 2026-09-12\n\nDecirlo en voz alta ayudó.';
const sinEspera = async () => {};

describe('enviarAPsicologa', () => {
  /* Lo que hay que poder demostrar: lo que sube es ilegible para el gateway y la
     psicóloga, con SU llave, lo lee entero. */
  it('sube el paquete cifrado bajo su hash, y la psicóloga lo descifra', async () => {
    const { llaves, red, cadena } = await escenario();

    await enviarAPsicologa({ documento, config, cuenta, cadena, fetch: red.fetch, esperar: sinEspera });

    const subida = red.llamadas.find((l) => l.init.method === 'PUT');
    const sobre = deserializeEncryptedPackage(new Uint8Array(subida.init.body));
    expect(subida.url).toBe('http://localhost:8787/v1/packages/' + hashEncryptedPackage(sobre));
    expect(new TextDecoder().decode(subida.init.body)).not.toContain('Decirlo en voz alta');

    const claro = await decryptPackage(sobre, llaves.privateKey);
    expect(new TextDecoder().decode(claro)).toBe(documento);
  });

  it('firma el permiso, lo manda al relayer y espera la confirmación', async () => {
    const { red, cadena } = await escenario({ estados: ['pending', 'pending', 'confirmed'] });

    const r = await enviarAPsicologa({ documento, config, cuenta, cadena, fetch: red.fetch, esperar: sinEspera });

    const post = red.llamadas.find((l) => l.init.method === 'POST');
    expect(post.url).toBe('http://localhost:8788/v1/transactions/grants');
    expect(post.init.headers['idempotency-key']).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    const cuerpo = JSON.parse(post.init.body);
    expect(cuerpo.message.user).toBe(cuenta.address);
    expect(cuerpo.message.nonce).toBe('5');
    expect(cuerpo.signature).toMatch(/^0x[0-9a-f]{130}$/);

    expect(r.transactionHash).toBe('0x' + 'cd'.repeat(32));
    expect(red.llamadas.filter((l) => (l.init.method || 'GET') === 'GET')).toHaveLength(3);
  });

  /* Sin credencial vigente no sale NADA del dispositivo, ni siquiera cifrado. */
  it('si la psicóloga no está verificada, no sube nada', async () => {
    const { red, cadena } = await escenario({ verificada: false });

    await expect(
      enviarAPsicologa({ documento, config, cuenta, cadena, fetch: red.fetch, esperar: sinEspera }),
    ).rejects.toThrow('profesional-no-verificada');
    expect(red.llamadas).toHaveLength(0);
  });

  it('si la transacción revierte, no lo da por enviado', async () => {
    const { red, cadena } = await escenario({ estados: ['reverted'] });

    await expect(
      enviarAPsicologa({ documento, config, cuenta, cadena, fetch: red.fetch, esperar: sinEspera }),
    ).rejects.toThrow('transaccion-revertida');
  });
});
