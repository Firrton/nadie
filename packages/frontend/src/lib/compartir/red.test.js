import { describe, expect, it } from 'vitest';
import { configDeCompartir, hostsDeCompartir } from './red.js';

const envCompleto = {
  VITE_HASHKEY_RPC_URL: 'https://rpc.ejemplo.test/',
  VITE_GATEWAY_URL: 'http://localhost:8787/',
  VITE_RELAYER_URL: 'http://localhost:8788',
  VITE_EXPLORER_URL: 'https://explorer.ejemplo.test',
  VITE_CONSENT_REGISTRY_ADDRESS: '0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1',
  VITE_PROFESSIONAL_REGISTRY_ADDRESS: '0xD615074c2603336fa0Da8AF44B5CCB9D9C0B2F9c',
  VITE_PSICOLOGA_ADDRESS: '0x00000000000000000000000000000000000000aa',
};

describe('configDeCompartir', () => {
  it('arma la config de HashKey testnet con las URLs sin barra final', () => {
    expect(configDeCompartir(envCompleto)).toEqual({
      chainId: 133,
      rpcUrl: 'https://rpc.ejemplo.test',
      gatewayUrl: 'http://localhost:8787',
      relayerUrl: 'http://localhost:8788',
      explorerUrl: 'https://explorer.ejemplo.test',
      consentRegistry: '0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1',
      professionalRegistry: '0xD615074c2603336fa0Da8AF44B5CCB9D9C0B2F9c',
      professional: '0x00000000000000000000000000000000000000aa',
    });
  });

  /* Sin config completa, compartir NO existe: ni botón ni pedidos. Una app que
     intenta mandar datos a medio configurar es peor que una que no ofrece hacerlo. */
  it('si falta cualquier variable, compartir queda apagado', () => {
    const { VITE_PSICOLOGA_ADDRESS, ...incompleto } = envCompleto;
    expect(configDeCompartir(incompleto)).toBeNull();
    expect(configDeCompartir({})).toBeNull();
  });
});

describe('hostsDeCompartir', () => {
  /* El test de "la app no habla con terceros" usa esta lista como la ÚNICA
     excepción del bundle además de los pesos del modelo. */
  it('declara los orígenes con los que habla compartir, y ninguno más', () => {
    expect(hostsDeCompartir(envCompleto)).toEqual([
      'https://rpc.ejemplo.test',
      'http://localhost:8787',
      'http://localhost:8788',
      'https://explorer.ejemplo.test',
    ]);
    expect(hostsDeCompartir({})).toEqual([]);
  });
});
