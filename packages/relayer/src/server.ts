import { serve } from "@hono/node-server";

import { createRelayerApp } from "./app";
import { validateRelayerStartup } from "./bootstrap";
import { parseRelayerEnvironment } from "./config";
import { MemoryIdempotencyStore } from "./ports";
import { RelayService } from "./relayer";
import { createViemSignatureRecovery } from "./security";
import { createViemRelayer } from "./viem-chain";

async function main(): Promise<void> {
  const env = parseRelayerEnvironment(process.env);
  const chain = createViemRelayer({
    rpcUrl: env.HASHKEY_RPC_URL,
    consentRegistryAddress: env.CONSENT_REGISTRY_ADDRESS,
    privateKey: env.RELAYER_PRIVATE_KEY,
  });

  // Fail before listening if network, deployment, or operational balance is wrong.
  await validateRelayerStartup(chain, env.RELAYER_MIN_BALANCE_WEI);

  const idempotency = new MemoryIdempotencyStore(env.RELAYER_MAX_IDEMPOTENCY_ENTRIES);
  const service = new RelayService({
    chain,
    signatures: createViemSignatureRecovery(),
    idempotency,
    config: {
      chainId: 133,
      consentRegistryAddress: env.CONSENT_REGISTRY_ADDRESS,
      maxGas: env.RELAYER_MAX_GAS,
      minBalanceWei: env.RELAYER_MIN_BALANCE_WEI,
      idempotencyTtlSeconds: env.RELAYER_IDEMPOTENCY_TTL_SECONDS,
    },
  });

  const app = createRelayerApp({
    service,
    config: {
      allowedOrigin: env.RELAYER_ALLOWED_ORIGIN,
      maxRequestBytes: env.RELAYER_MAX_REQUEST_BYTES,
      rateLimitPerMinute: env.RELAYER_RATE_LIMIT_PER_MINUTE,
      maxInFlight: env.RELAYER_MAX_IN_FLIGHT,
    },
  });
  serve({ fetch: app.fetch, port: env.RELAYER_PORT });
}

void main().catch(() => {
  process.exitCode = 1;
});
