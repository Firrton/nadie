/**
 * Arranque del gateway: valida configuración estricta (fail-fast), verifica
 * que el RPC reporte chain ID 133, barre expirados y escucha.
 *
 * Sin request logger ni console.*: errores de arranque terminan el proceso
 * con exit code distinto de cero.
 */

import { serve } from "@hono/node-server";
import { createPublicClient, http } from "viem";

import { parseGatewayEnvironment } from "./config";
import { FilePackageStore } from "./file-store";
import { createGatewayApp, type GatewayConfig } from "./gateway";
import { createViemChainAuthorization } from "./viem-chain";
import { createViemSignatureVerifier } from "./index";

async function main(): Promise<void> {
  let env;
  try {
    env = parseGatewayEnvironment(process.env);
  } catch {
    process.exitCode = 1;
    return;
  }

  // Verificación real del chain ID antes de arrancar.
  const client = createPublicClient({ transport: http(env.HASHKEY_RPC_URL) });
  const chainId = await client.getChainId();
  if (chainId !== 133) {
    process.exitCode = 1;
    return;
  }

  const config: GatewayConfig = {
    chainId: env.HASHKEY_CHAIN_ID,
    consentRegistryAddress: env.CONSENT_REGISTRY_ADDRESS.toLowerCase(),
    gatewayUrl: env.GATEWAY_URL,
    allowedOrigins: env.GATEWAY_ALLOWED_ORIGIN,
    maxPackageBytes: env.GATEWAY_MAX_PACKAGE_BYTES,
    retentionSeconds: env.GATEWAY_RETENTION_SECONDS,
    challengeTtlSeconds: env.GATEWAY_CHALLENGE_TTL_SECONDS,
    maxActiveChallenges: 10_000,
  };

  const store = new FilePackageStore(env.GATEWAY_STORAGE_DIR);
  await store.init();
  await store.sweepExpired(Math.floor(Date.now() / 1000));

  const app = createGatewayApp({
    store,
    chain: createViemChainAuthorization({
      rpcUrl: env.HASHKEY_RPC_URL,
      chainId: env.HASHKEY_CHAIN_ID,
      consentRegistryAddress: config.consentRegistryAddress,
    }),
    verifier: createViemSignatureVerifier(),
    config,
  });

  serve({ fetch: app.fetch, port: env.GATEWAY_PORT });
}

void main();
