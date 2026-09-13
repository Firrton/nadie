/**
 * Verificador de firmas EIP-191 con viem y exportaciones del gateway.
 */

import { verifyMessage } from "viem";

import type { SignatureVerifier } from "./gateway";

/** Verificador productivo: viem sobre la red configurada. */
export function createViemSignatureVerifier(): SignatureVerifier {
  return {
    async verifyPersonalMessage(message: string, signature: string, expectedAddress: string): Promise<boolean> {
      try {
        return await verifyMessage({
          message,
          signature: signature as `0x${string}`,
          address: expectedAddress as `0x${string}`,
        });
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
export { parseGatewayEnvironment } from "./config";
export type { GatewayEnvironment } from "./config";
export { createViemChainAuthorization } from "./viem-chain";
export type { ViemChainConfig } from "./viem-chain";
