export const CONSENT_REGISTRY_ABI = [
  {
    type: "event",
    name: "Granted",
    inputs: [
      { indexed: true, name: "consentId", type: "bytes32" },
      { indexed: true, name: "user", type: "address" },
      { indexed: true, name: "professional", type: "address" },
      { indexed: false, name: "packageHash", type: "bytes32" },
      { indexed: false, name: "scope", type: "bytes32" },
      { indexed: false, name: "expiresAt", type: "uint40" },
    ],
  },
  {
    type: "function",
    name: "consents",
    stateMutability: "view",
    inputs: [{ name: "consentId", type: "bytes32" }],
    outputs: [
      { name: "user", type: "address" },
      { name: "professional", type: "address" },
      { name: "packageHash", type: "bytes32" },
      { name: "scope", type: "bytes32" },
      { name: "expiresAt", type: "uint40" },
      { name: "firstOpenedAt", type: "uint40" },
      { name: "revoked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "isValid",
    stateMutability: "view",
    inputs: [{ name: "consentId", type: "bytes32" }],
    outputs: [{ name: "valid", type: "bool" }],
  },
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [{ name: "consentId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "reply",
    stateMutability: "nonpayable",
    inputs: [
      { name: "consentId", type: "bytes32" },
      { name: "responseHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export const PROFESSIONAL_REGISTRY_ABI = [
  {
    type: "function",
    name: "credentials",
    stateMutability: "view",
    inputs: [{ name: "professional", type: "address" }],
    outputs: [
      { name: "publicKey", type: "bytes32" },
      { name: "displayName", type: "string" },
      { name: "status", type: "uint8" },
      { name: "expiresAt", type: "uint40" },
      { name: "issuer", type: "address" },
    ],
  },
  {
    type: "function",
    name: "isVerified",
    stateMutability: "view",
    inputs: [{ name: "professional", type: "address" }],
    outputs: [{ name: "verified", type: "bool" }],
  },
  {
    type: "function",
    name: "registerKey",
    stateMutability: "nonpayable",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [],
  },
] as const;
