import {
  encryptPackage,
  generateEncryptionKeyPair,
  hashEncryptedPackage,
  serializeEncryptedPackage,
} from "@nadie/core";
import { keccak256, stringToBytes } from "viem";
import type { Address, Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

import type { AccessChallenge, ChainPort, GatewayPort, ProfessionalConsent } from "../ports";
import { ClinicianService, parsePrivateKey } from "./clinician-service";

const professional = "0x1000000000000000000000000000000000000001" as Address;
const user = "0x2000000000000000000000000000000000000002" as Address;
const consentId = `0x${"11".repeat(32)}` as Hex;
const challengeId = `0x${"22".repeat(32)}` as Hex;
const signature = `0x${"33".repeat(65)}` as Hex;
const transactionHash = `0x${"44".repeat(32)}` as Hex;

function chain(overrides: Partial<ChainPort> = {}): ChainPort {
  return {
    connect: vi.fn(async () => professional),
    currentAddress: vi.fn(async () => professional),
    credential: vi.fn(async () => ({
      publicKey: `0x${"55".repeat(32)}` as Hex,
      displayName: "Demo professional",
      status: 1,
      expiresAt: 1000,
      issuer: user,
      isVerified: true,
    })),
    grantedConsents: vi.fn(async () => []),
    registerKey: vi.fn(async () => transactionHash),
    open: vi.fn(async () => transactionHash),
    signPersonalMessage: vi.fn(async () => signature),
    reply: vi.fn(async () => transactionHash),
    ...overrides,
  };
}

function gateway(bytes: Uint8Array, challenge: AccessChallenge): GatewayPort {
  return {
    requestChallenge: vi.fn(async () => challenge),
    download: vi.fn(async () => bytes.slice()),
  };
}

function consent(packageHash: Hex, overrides: Partial<ProfessionalConsent> = {}): ProfessionalConsent {
  return {
    consentId,
    user,
    professional,
    packageHash,
    scope: `0x${"66".repeat(32)}` as Hex,
    expiresAt: 2000,
    firstOpenedAt: 0,
    revoked: false,
    isValid: true,
    grantedBlock: 9n,
    ...overrides,
  };
}

describe("ClinicianService", () => {
  it("opens once, signs the exact gateway message and decrypts locally", async () => {
    const keyPair = await generateEncryptionKeyPair();
    const plaintext = new TextEncoder().encode("Synthetic summary for a demo professional.");
    const envelope = await encryptPackage(plaintext, keyPair.publicKey, {
      professional: professional.toLowerCase(),
      scope: "graph-summary",
    });
    const currentConsent = consent(hashEncryptedPackage(envelope) as Hex);
    const challenge = { challengeId, message: "exact gateway challenge", expiresAt: 9999999999 };
    const chainPort = chain();
    const gatewayPort = gateway(serializeEncryptedPackage(envelope), challenge);

    const result = await new ClinicianService(chainPort, gatewayPort).openAndDownload(
      currentConsent,
      keyPair.privateKey,
    );

    expect(result).toEqual(plaintext);
    expect(chainPort.open).toHaveBeenCalledWith(consentId);
    expect(chainPort.signPersonalMessage).toHaveBeenCalledWith(challenge.message);
    expect(gatewayPort.download).toHaveBeenCalledWith(consentId, challengeId, signature);
  });

  it("does not repeat open when firstOpenedAt is already set", async () => {
    const keyPair = await generateEncryptionKeyPair();
    const envelope = await encryptPackage(new Uint8Array([1, 2, 3]), keyPair.publicKey, {
      professional: professional.toLowerCase(),
      scope: "graph-summary",
    });
    const chainPort = chain();
    const gatewayPort = gateway(serializeEncryptedPackage(envelope), {
      challengeId,
      message: "challenge",
      expiresAt: 9999999999,
    });

    await new ClinicianService(chainPort, gatewayPort).openAndDownload(
      consent(hashEncryptedPackage(envelope) as Hex, { firstOpenedAt: 42 }),
      keyPair.privateKey,
    );

    expect(chainPort.open).not.toHaveBeenCalled();
  });

  it("rejects an envelope addressed to another professional", async () => {
    const keyPair = await generateEncryptionKeyPair();
    const envelope = await encryptPackage(new Uint8Array([1]), keyPair.publicKey, {
      professional: user.toLowerCase(),
      scope: "graph-summary",
    });
    const gatewayPort = gateway(serializeEncryptedPackage(envelope), {
      challengeId,
      message: "challenge",
      expiresAt: 9999999999,
    });

    await expect(
      new ClinicianService(chain(), gatewayPort).openAndDownload(
        consent(hashEncryptedPackage(envelope) as Hex, { firstOpenedAt: 42 }),
        keyPair.privateKey,
      ),
    ).rejects.toThrow("dirigido a otra profesional");
  });

  it("sends only the deterministic response hash to the chain port", async () => {
    const chainPort = chain();
    const result = await new ClinicianService(chainPort, gateway(new Uint8Array(), {
      challengeId,
      message: "challenge",
      expiresAt: 9999999999,
    })).reply(consent(`0x${"77".repeat(32)}` as Hex, { firstOpenedAt: 42 }), " Follow up soon. ");

    const expectedHash = keccak256(stringToBytes("Follow up soon."));
    expect(chainPort.reply).toHaveBeenCalledWith(consentId, expectedHash);
    expect(result).toEqual({ hash: expectedHash, transactionHash });
  });

  it("does not submit a response from a different wallet", async () => {
    const chainPort = chain({ currentAddress: vi.fn(async () => user) });
    const service = new ClinicianService(chainPort, gateway(new Uint8Array(), {
      challengeId,
      message: "challenge",
      expiresAt: 9999999999,
    }));

    await expect(
      service.reply(consent(`0x${"77".repeat(32)}` as Hex, { firstOpenedAt: 42 }), "Follow up."),
    ).rejects.toThrow("no es la de la profesional autorizada");
    expect(chainPort.reply).not.toHaveBeenCalled();
  });
});

describe("parsePrivateKey", () => {
  it("accepts only an exact 32-byte hex value", () => {
    expect(parsePrivateKey(`0x${"ab".repeat(32)}`)).toHaveLength(32);
    expect(() => parsePrivateKey("0x1234")).toThrow("llave privada X25519 de 32 bytes");
  });
});
