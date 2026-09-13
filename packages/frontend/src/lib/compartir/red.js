/* Con quién habla "compartir", y NADIE más.

   Es la segunda excepción a "la app no habla con terceros", después de los
   pesos del modelo, y está acotada igual: un archivo, orígenes declarados, y el
   test de no-external-requests los usa como lista blanca del bundle.

   No es una fuga de la sesión privada: compartir pasa SOLO cuando la persona
   aprueba el resumen y toca enviar. La conversación nunca sale.

   Todo viene del entorno del build (VITE_*), sin URLs escritas acá: si falta
   cualquier variable, compartir no existe — ni botón ni pedidos. */

const CHAIN_ID_HASHKEY_TESTNET = 133;

const VARIABLES = {
  rpcUrl: 'VITE_HASHKEY_RPC_URL',
  gatewayUrl: 'VITE_GATEWAY_URL',
  relayerUrl: 'VITE_RELAYER_URL',
  explorerUrl: 'VITE_EXPLORER_URL',
  consentRegistry: 'VITE_CONSENT_REGISTRY_ADDRESS',
  professionalRegistry: 'VITE_PROFESSIONAL_REGISTRY_ADDRESS',
  professional: 'VITE_PSICOLOGA_ADDRESS',
};

const URLS = ['rpcUrl', 'gatewayUrl', 'relayerUrl', 'explorerUrl'];

const sinBarraFinal = (url) => url.replace(/\/+$/, '');

export function configDeCompartir(env = import.meta.env || {}) {
  const config = { chainId: CHAIN_ID_HASHKEY_TESTNET };
  for (const [campo, variable] of Object.entries(VARIABLES)) {
    const valor = (env[variable] || '').trim();
    if (!valor) return null;
    config[campo] = URLS.includes(campo) ? sinBarraFinal(valor) : valor;
  }
  return config;
}

export function hostsDeCompartir(env = import.meta.env || {}) {
  const config = configDeCompartir(env);
  return config ? URLS.map((campo) => config[campo]) : [];
}
