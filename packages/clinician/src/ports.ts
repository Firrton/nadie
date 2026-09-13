import type { Address, Hex } from "viem";

export interface ProfessionalCredential {
  publicKey: Hex;
  displayName: string;
  status: number;
  expiresAt: number;
  issuer: Address;
  isVerified: boolean;
}

export interface ProfessionalConsent {
  consentId: Hex;
  user: Address;
  professional: Address;
  packageHash: Hex;
  scope: Hex;
  expiresAt: number;
  firstOpenedAt: number;
  revoked: boolean;
  isValid: boolean;
  grantedBlock: bigint;
}

export interface ChainPort {
  connect(): Promise<Address>;
  currentAddress(): Promise<Address | undefined>;
  credential(professional: Address): Promise<ProfessionalCredential>;
  grantedConsents(professional: Address): Promise<ProfessionalConsent[]>;
  registerKey(publicKey: Hex): Promise<Hex>;
  open(consentId: Hex): Promise<Hex>;
  signPersonalMessage(message: string): Promise<Hex>;
  reply(consentId: Hex, responseHash: Hex): Promise<Hex>;
}

export interface AccessChallenge {
  challengeId: Hex;
  message: string;
  expiresAt: number;
}

export interface GatewayPort {
  requestChallenge(consentId: Hex, professional: Address): Promise<AccessChallenge>;
  download(consentId: Hex, challengeId: Hex, signature: Hex): Promise<Uint8Array>;
}
