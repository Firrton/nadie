import { getAddress } from "viem";
import { z } from "zod";

const positiveInt = z.coerce.number().int().positive();
const decimalBigInt = z.string().regex(/^(0|[1-9][0-9]*)$/).transform((value) => BigInt(value));

const schema = z
  .object({
    HASHKEY_RPC_URL: z.string().url(),
    HASHKEY_CHAIN_ID: z.coerce.number().int().refine((value) => value === 133),
    CONSENT_REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    RELAYER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine((value) => !/^0x0{64}$/i.test(value)),
    RELAYER_URL: z.string().url().default("http://localhost:8788"),
    RELAYER_PORT: positiveInt.default(8788),
    RELAYER_ALLOWED_ORIGIN: z.string().url().default("http://localhost:5173"),
    RELAYER_MAX_REQUEST_BYTES: positiveInt.default(8192),
    RELAYER_RATE_LIMIT_PER_MINUTE: positiveInt.default(60),
    RELAYER_MAX_IN_FLIGHT: positiveInt.default(8),
    RELAYER_MAX_GAS: decimalBigInt.default(500000n),
    RELAYER_MIN_BALANCE_WEI: decimalBigInt.default(1000000000000000n),
    RELAYER_IDEMPOTENCY_TTL_SECONDS: positiveInt.default(86400),
    RELAYER_MAX_IDEMPOTENCY_ENTRIES: positiveInt.default(10000),
  })
  .strict();

const CONFIG_KEYS = Object.keys(schema.shape) as Array<keyof typeof schema.shape>;

export type RelayerEnvironment = z.infer<typeof schema> & {
  CONSENT_REGISTRY_ADDRESS: `0x${string}`;
  RELAYER_PRIVATE_KEY: `0x${string}`;
};

/** Selects only known keys so ordinary OS environment variables are not mistaken for config. */
export function parseRelayerEnvironment(input: NodeJS.ProcessEnv): RelayerEnvironment {
  const selected: Record<string, string | undefined> = {};
  for (const key of CONFIG_KEYS) selected[key] = input[key];
  const value = schema.parse(selected);
  return {
    ...value,
    CONSENT_REGISTRY_ADDRESS: getAddress(value.CONSENT_REGISTRY_ADDRESS),
    RELAYER_PRIVATE_KEY: value.RELAYER_PRIVATE_KEY as `0x${string}`,
  };
}
