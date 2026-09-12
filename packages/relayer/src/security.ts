import { createHash } from "node:crypto";
import { recoverTypedDataAddress } from "viem";

import type { RelayRequest } from "./types";
import { GRANT_TYPES, REVOKE_TYPES } from "./types";
import type { SignatureRecoveryPort } from "./ports";

const SECP256K1_HALF_N = BigInt("0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0");

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isCanonicalEoaSignature(signature: string): boolean {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return false;
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  const v = Number.parseInt(signature.slice(130, 132), 16);
  return s > 0n && s <= SECP256K1_HALF_N && (v === 27 || v === 28);
}

export function createViemSignatureRecovery(): SignatureRecoveryPort {
  return {
    async recover(request: RelayRequest): Promise<`0x${string}`> {
      if (request.kind === "grant") {
        return recoverTypedDataAddress({
          domain: request.domain,
          types: GRANT_TYPES,
          primaryType: "Grant",
          message: { ...request.message, expiresAt: Number(request.message.expiresAt) },
          signature: request.signature,
        });
      }
      return recoverTypedDataAddress({
        domain: request.domain,
        types: REVOKE_TYPES,
        primaryType: "Revoke",
        message: request.message,
        signature: request.signature,
      });
    },
  };
}

export function fingerprintRequest(request: RelayRequest): string {
  const message = Object.fromEntries(
    Object.entries(request.message).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value.toLowerCase()]),
  );
  return sha256(
    JSON.stringify({
      kind: request.kind,
      domain: { ...request.domain, verifyingContract: request.domain.verifyingContract.toLowerCase() },
      message,
      signature: request.signature.toLowerCase(),
    }),
  );
}
