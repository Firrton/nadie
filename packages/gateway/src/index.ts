/**
 * Verificador de firmas EIP-191 con viem y exportaciones del gateway.
 */

import { verifyMessage } from "viem";

import type { SignatureVerifier } from "./gateway";

/** Verificador productivo: viem sobre la red configurada. */
export function createViemSignatureVerifier(): SignatureVerifier {
  return {
    verifyPersonalMessage(message: string, signature: string, expectedAddress: string): boolean {
      try {
        return Boolean(verifyMessage({
          message,
          signature: signature as `0x${string}`,
          address: expectedAddress as `0x${string}`,
        }));
      } catch {
        return false;
      }
    },
  };
}

export { createGatewayApp, DEFAULT_MAX_PACKAGE_BYTES, DEFAULT_RETENTION_SECONDS, DEFAULT_CHALLENGE_TTL_SECONDS } from "./gateway";
export type { GatewayConfig, GatewayDeps, SignatureVerifier } from "./gateway";
export { FilePackageStore, sha256Hex } from "./file-store";
export type { PackageStore, StoredPackageRecord, ChainAuthorizationPort, ConsentSnapshot, BlockRef } from "./ports";