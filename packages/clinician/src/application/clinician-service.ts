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
      throw new Error("Cambió la cuenta de tu billetera digital. Vuelve a entrar.");
    }
    const [credential, consents] = await Promise.all([
      this.#chain.credential(professional),
      this.#chain.grantedConsents(professional),
    ]);
    return { credential, consents };
  }

  registerEncryptionPublicKey(publicKey: string): Promise<Hex> {
    if (!isHex(publicKey) || publicKey.length !== 66 || /^0x0+$/.test(publicKey)) {
      throw new Error("La llave que se intentó registrar no es válida.");
    }
    return this.#chain.registerKey(publicKey);
  }

  async openAndDownload(consent: ProfessionalConsent, privateKey: Uint8Array): Promise<Uint8Array> {
    if (privateKey.byteLength !== 32) throw new Error("Primero usa tu llave de lectura.");
    if (!consent.isValid || consent.revoked) throw new Error("La persona retiró el acceso o ya venció.");
    const connected = await this.#chain.currentAddress();
    if (!connected || getAddress(connected) !== getAddress(consent.professional)) {
      throw new Error("Esta cuenta no es la de la profesional con quien se compartió.");
    }

    if (consent.firstOpenedAt === 0) await this.#chain.open(consent.consentId);

    const challenge = await this.#gateway.requestChallenge(consent.consentId, consent.professional);
    const signature = await this.#chain.signPersonalMessage(challenge.message);
    const serialized = await this.#gateway.download(consent.consentId, challenge.challengeId, signature);
    try {
      const envelope = deserializeEncryptedPackage(serialized);
      if (hashEncryptedPackage(envelope).toLowerCase() !== consent.packageHash.toLowerCase()) {
        throw new Error("Lo que llegó no coincide con lo que la persona compartió, así que no se abrió.");
      }
      if (getAddress(envelope.metadata.professional) !== getAddress(consent.professional)) {
        throw new Error("Esto se compartió con otra profesional.");
      }
      return await decryptPackage(envelope, privateKey);
    } finally {
      serialized.fill(0);
    }
  }

  async reply(consent: ProfessionalConsent, response: string): Promise<{ hash: Hex; transactionHash: Hex }> {
    const normalized = response.trim();
    if (normalized.length === 0) throw new Error("Escribe una respuesta antes de enviarla.");
    if (!consent.isValid || consent.firstOpenedAt === 0) {
      throw new Error("El permiso tiene que estar vigente y abierto para responder.");
    }
    const connected = await this.#chain.currentAddress();
    if (!connected || getAddress(connected) !== getAddress(consent.professional)) {
      throw new Error("Esta cuenta no es la de la profesional con quien se compartió.");
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
    throw new Error("Esa llave de lectura no es válida. Revisa que la hayas pegado completa.");
  }
  return hexToBytes(normalized as Hex);
}
