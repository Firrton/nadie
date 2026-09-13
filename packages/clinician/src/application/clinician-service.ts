import {
  decryptPackage,
  deserializeEncryptedPackage,
  hashEncryptedPackage,
} from "@nadie/core";
import { getAddress, hexToBytes, isHex, keccak256, stringToBytes } from "viem";
import type { Address, Hex } from "viem";

import type {
  ChainPort,
  GatewayPort,
  ProfessionalConsent,
  ProfessionalCredential,
} from "../ports";

export interface Dashboard {
  credential: ProfessionalCredential;
  consents: ProfessionalConsent[];
}

export class ClinicianService {
  readonly #chain: ChainPort;
  readonly #gateway: GatewayPort;

  constructor(chain: ChainPort, gateway: GatewayPort) {
    this.#chain = chain;
    this.#gateway = gateway;
  }

  connect(): Promise<Address> {
    return this.#chain.connect();
  }

  async dashboard(professional: Address): Promise<Dashboard> {
    const connected = await this.#chain.currentAddress();
    if (!connected || getAddress(connected) !== getAddress(professional)) {
      throw new Error("The connected wallet changed. Connect again.");
    }
    const [credential, consents] = await Promise.all([
      this.#chain.credential(professional),
      this.#chain.grantedConsents(professional),
    ]);
    return { credential, consents };
  }

  registerEncryptionPublicKey(publicKey: string): Promise<Hex> {
    if (!isHex(publicKey) || publicKey.length !== 66 || /^0x0+$/.test(publicKey)) {
      throw new Error("The encryption public key is invalid.");
    }
    return this.#chain.registerKey(publicKey);
  }

  async openAndDownload(consent: ProfessionalConsent, privateKey: Uint8Array): Promise<Uint8Array> {
    if (privateKey.byteLength !== 32) throw new Error("Load the 32-byte X25519 private key first.");
    if (!consent.isValid || consent.revoked) throw new Error("This consent is no longer available.");
    const connected = await this.#chain.currentAddress();
    if (!connected || getAddress(connected) !== getAddress(consent.professional)) {
      throw new Error("The connected wallet is not the authorized professional.");
    }

    if (consent.firstOpenedAt === 0) await this.#chain.open(consent.consentId);

    const challenge = await this.#gateway.requestChallenge(consent.consentId, consent.professional);
    const signature = await this.#chain.signPersonalMessage(challenge.message);
    const serialized = await this.#gateway.download(consent.consentId, challenge.challengeId, signature);
    try {
      const envelope = deserializeEncryptedPackage(serialized);
      if (hashEncryptedPackage(envelope).toLowerCase() !== consent.packageHash.toLowerCase()) {
        throw new Error("The encrypted package does not match the on-chain hash.");
      }
      if (getAddress(envelope.metadata.professional) !== getAddress(consent.professional)) {
        throw new Error("The encrypted package is addressed to another professional.");
      }
      return await decryptPackage(envelope, privateKey);
    } finally {
      serialized.fill(0);
    }
  }

  async reply(consent: ProfessionalConsent, response: string): Promise<{ hash: Hex; transactionHash: Hex }> {
    const normalized = response.trim();
    if (normalized.length === 0) throw new Error("Write a response before sending it.");
    if (!consent.isValid || consent.firstOpenedAt === 0) {
      throw new Error("The consent must be active and opened before replying.");
    }
    const connected = await this.#chain.currentAddress();
    if (!connected || getAddress(connected) !== getAddress(consent.professional)) {
      throw new Error("The connected wallet is not the authorized professional.");
    }
    const responseBytes = stringToBytes(normalized);
    try {
      const hash = keccak256(responseBytes);
      const transactionHash = await this.#chain.reply(consent.consentId, hash);
      return { hash, transactionHash };
    } finally {
      responseBytes.fill(0);
    }
  }
}

export function parsePrivateKey(input: string): Uint8Array {
  const normalized = input.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("Expected a 0x-prefixed 32-byte X25519 private key.");
  }
  return hexToBytes(normalized as Hex);
}
