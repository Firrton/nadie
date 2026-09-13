import { getAddress } from "viem";
import { z } from "zod";

const positiveInt = z.coerce.number().int().positive();

const schema = z
  .object({
    HASHKEY_RPC_URL: z.string().url(),
    HASHKEY_CHAIN_ID: z.coerce.number().int().refine((value) => value === 133),
    CONSENT_REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    GATEWAY_URL: z.string().url().default("http://localhost:8787"),
    GATEWAY_PORT: positiveInt.default(8787),
    GATEWAY_STORAGE_DIR: z.string().default(".data/gateway"),
    GATEWAY_ALLOWED_ORIGIN: z.string().url().default("http://localhost:5173"),
    GATEWAY_MAX_PACKAGE_BYTES: positiveInt.default(1_048_576),
    GATEWAY_RETENTION_SECONDS: positiveInt.default(604_800),
    GATEWAY_CHALLENGE_TTL_SECONDS: positiveInt.default(60),
  })
  .strict();

const CONFIG_KEYS = Object.keys(schema.shape) as Array<keyof typeof schema.shape>;

export type GatewayEnvironment = z.infer<typeof schema> & {
  CONSENT_REGISTRY_ADDRESS: `0x${string}`;
};

/** Selects known gateway variables before strict validation. */
export function parseGatewayEnvironment(input: NodeJS.ProcessEnv): GatewayEnvironment {
  const selected: Record<string, string | undefined> = {};
  for (const key of CONFIG_KEYS) selected[key] = input[key];
  const value = schema.parse(selected);
  return {
    ...value,
    CONSENT_REGISTRY_ADDRESS: getAddress(value.CONSENT_REGISTRY_ADDRESS),
  };
}
