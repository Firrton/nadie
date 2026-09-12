export const GRANT_TYPES = {
  Grant: [
    { name: "consentId", type: "bytes32" },
    { name: "user", type: "address" },
    { name: "professional", type: "address" },
    { name: "packageHash", type: "bytes32" },
    { name: "scope", type: "bytes32" },
    { name: "expiresAt", type: "uint40" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const REVOKE_TYPES = {
  Revoke: [
    { name: "consentId", type: "bytes32" },
    { name: "user", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export interface RelayDomain {
  name: "NadieConsentRegistry";
  version: "1";
  chainId: 133;
  verifyingContract: `0x${string}`;
}

export interface GrantMessage {
  consentId: `0x${string}`;
  user: `0x${string}`;
  professional: `0x${string}`;
  packageHash: `0x${string}`;
  scope: `0x${string}`;
  expiresAt: bigint;
  nonce: bigint;
  deadline: bigint;
}

export interface RevokeMessage {
  consentId: `0x${string}`;
  user: `0x${string}`;
  nonce: bigint;
  deadline: bigint;
}

export interface GrantRelayRequest {
  kind: "grant";
  domain: RelayDomain;
  message: GrantMessage;
  signature: `0x${string}`;
}

export interface RevokeRelayRequest {
  kind: "revoke";
  domain: RelayDomain;
  message: RevokeMessage;
  signature: `0x${string}`;
}

export type RelayRequest = GrantRelayRequest | RevokeRelayRequest;

export interface PreparedTransaction {
  readonly request: unknown;
  readonly gas: bigint;
  readonly feePerGas: bigint;
  readonly maxCostWei: bigint;
}

export interface TransactionStatus {
  status: "pending" | "confirmed" | "reverted";
  blockNumber?: bigint;
}
