import { getAddress } from "viem";
import { z } from "zod";

import type { GrantRelayRequest, RelayDomain, RevokeRelayRequest } from "./types";

const UINT40_MAX = (1n << 40n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const DECIMAL_RE = /^(0|[1-9][0-9]*)$/;
const BYTES32_RE = /^0x[0-9a-f]{64}$/;
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const decimal = (max: bigint) =>
  z.string().regex(DECIMAL_RE).transform((value, ctx) => {
    const parsed = BigInt(value);
    if (parsed > max) {
      ctx.addIssue({ code: "custom", message: "out of range" });
      return z.NEVER;
    }
    return parsed;
  });

const bytes32 = z.string().regex(BYTES32_RE).transform((value) => value as `0x${string}`);
const nonZeroBytes32 = bytes32.refine((value) => !/^0x0{64}$/.test(value));
const address = z.string().regex(ADDRESS_RE).transform((value, ctx) => {
  try {
    return getAddress(value) as `0x${string}`;
  } catch {
    ctx.addIssue({ code: "custom", message: "invalid address" });
    return z.NEVER;
  }
});
const nonZeroAddress = address.refine((value) => value.toLowerCase() !== `0x${"0".repeat(40)}`);

const domainSchema = z
  .object({
    name: z.literal("NadieConsentRegistry"),
    version: z.literal("1"),
    chainId: z.literal(133),
    verifyingContract: address,
  })
  .strict();

const signatureSchema = z.string().regex(SIGNATURE_RE).transform((value) => value as `0x${string}`);

const grantSchema = z
  .object({
    domain: domainSchema,
    message: z
      .object({
        consentId: nonZeroBytes32,
        user: nonZeroAddress,
        professional: nonZeroAddress,
        packageHash: nonZeroBytes32,
        scope: nonZeroBytes32,
        expiresAt: decimal(UINT40_MAX),
        nonce: decimal(UINT256_MAX),
        deadline: decimal(UINT256_MAX),
      })
      .strict(),
    signature: signatureSchema,
  })
  .strict();

const revokeSchema = z
  .object({
    domain: domainSchema,
    message: z
      .object({
        consentId: nonZeroBytes32,
        user: nonZeroAddress,
        nonce: decimal(UINT256_MAX),
        deadline: decimal(UINT256_MAX),
      })
      .strict(),
    signature: signatureSchema,
  })
  .strict();

export function parseGrantRequest(value: unknown): GrantRelayRequest {
  const parsed = grantSchema.parse(value);
  return { kind: "grant", ...parsed, domain: parsed.domain as RelayDomain };
}

export function parseRevokeRequest(value: unknown): RevokeRelayRequest {
  const parsed = revokeSchema.parse(value);
  return { kind: "revoke", ...parsed, domain: parsed.domain as RelayDomain };
}
