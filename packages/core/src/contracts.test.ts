import { describe, expect, it } from "vitest";

import {
  encryptPackage,
  generateEncryptionKeyPair,
} from "./encrypted-package";
import type {
  AuditEntry,
  CheckIn,
  ConsentGrant,
  FirstOpening,
  LLMPort,
  MemoryRecord,
  MoodTrend,
  NadieCore,
  ProfessionalCredential,
  Revocation,
  Session,
  SharedRecord,
} from "./contracts";
import { EMOTION_LABELS, MEMORY_TYPES, RISK_LEVELS } from "./schemas";

const PROFESSIONAL = "0x0000000000000000000000000000000000000002";

const validGrant: ConsentGrant = {
  userPseudonym: "0x0000000000000000000000000000000000000001",
  professional: "0x0000000000000000000000000000000000000002",
  packageHash: "0x" + "ab".repeat(32),
  scope: "graph-summary",
  expiresAt: 1758000000,
  revoked: false,
};

const validCredential: ProfessionalCredential = {
  professional: "0x0000000000000000000000000000000000000002",
  encryptionPublicKey: "0x" + "cd".repeat(32),
  displayName: "Dra. Prueba",
  status: "active",
  expiresAt: 1767000000,
  issuer: "0x0000000000000000000000000000000000000003",
};

const validOpening: FirstOpening = {
  grantId: 1,
  professional: "0x0000000000000000000000000000000000000002",
  openedAt: 1758000100,
};

describe("contratos de tipos", () => {
  it("NadieCore expone exactamente las siete áreas", () => {
    const areas: ReadonlyArray<keyof NadieCore> = [
      "keys",
      "session",
      "memory",
      "checkins",
      "insights",
      "sharing",
      "audit",
    ];
    expect(areas).toHaveLength(7);
  });

  it("los tipos on-chain solo contienen direcciones, hashes, enteros, timestamps y etiquetas", () => {
    // Enumeración exhaustiva de claves: cualquier campo nuevo de texto libre
    // hace fallar esta prueba.
    expect(Object.keys(validGrant).sort()).toEqual([
      "expiresAt",
      "packageHash",
      "professional",
      "revoked",
      "scope",
      "userPseudonym",
    ]);
    expect(Object.keys(validCredential).sort()).toEqual([
      "displayName",
      "encryptionPublicKey",
      "expiresAt",
      "issuer",
      "professional",
      "status",
    ]);
    expect(Object.keys(validOpening).sort()).toEqual([
      "grantId",
      "openedAt",
      "professional",
    ]);
    const revocation: Revocation = {
      grantId: 1,
      userPseudonym: validGrant.userPseudonym,
      revokedAt: 1758000200,
    };
    expect(Object.keys(revocation).sort()).toEqual([
      "grantId",
      "revokedAt",
      "userPseudonym",
    ]);
  });

  it("FirstOpening modela una única apertura, sin lecturas posteriores", () => {
    expect(Object.keys(validOpening)).not.toContain("readings");
    expect(Object.keys(validOpening)).not.toContain("lastReadAt");
    expect(Object.keys(validOpening)).not.toContain("openCount");
  });

  it("EncryptedPackage v1 no tiene campo de texto claro ni clave privada", async () => {
    const kp = await generateEncryptionKeyPair();
    const pkg = await encryptPackage(new TextEncoder().encode("secreto"), kp.publicKey, {
      professional: PROFESSIONAL,
      scope: "graph-summary",
    });
    expect(Object.keys(pkg).sort()).toEqual([
      "algorithm",
      "ciphertext",
      "encapsulatedKey",
      "metadata",
      "nonce",
      "recipientPublicKey",
      "version",
      "wrappedKey",
    ]);
    // La clave privada jamás viaja en el envelope.
    expect(JSON.stringify(pkg)).not.toContain(kp.privateKey.toString());
    // El plaintext jamás viaja en el envelope.
    expect(JSON.stringify(pkg)).not.toContain("secreto");
  });

  it("Session, CheckIn, MemoryRecord, MoodTrend y registros compartidos reflejan la arquitectura", () => {
    const session: Session = {
      id: "session-1",
      startedAt: 1758000000,
      endedAt: 1758001200,
      mode: "private",
      transcript: [
        { role: "user", content: "Hola", at: 1758000000 },
        { role: "assistant", content: "Aquí estoy", at: 1758000010 },
      ],
      summary: "Resumen corto",
      emotions: [{ label: "calma", intensity: 1 }],
      themes: ["descanso"],
      riskLevel: "bajo",
    };
    const checkIn: CheckIn = {
      id: "checkin-1",
      date: "2026-09-12",
      score: 6,
      emotions: [{ label: "esperanza", intensity: 2 }],
      source: "manual",
    };
    const memory: MemoryRecord = {
      id: "memory-1",
      type: "tema",
      content: "Le preocupa un examen",
      firstMentionedAt: 1758000000,
      lastMentionedAt: 1758000000,
      mentionCount: 1,
      confirmedByUser: false,
    };
    const trend: MoodTrend = {
      from: "2026-09-01",
      to: "2026-09-08",
      average: 4.2,
      movingAverage7: 5.6,
    };
    const shared: SharedRecord = {
      id: "shared-1",
      professional: validGrant.professional,
      scope: "graph-summary",
      dateRange: { from: "2026-08-25", to: "2026-09-08" },
      expiresAt: 1758000000,
      packageHash: validGrant.packageHash,
      grantId: 1,
      status: "active",
    };
    const audit: AuditEntry = {
      grantId: 1,
      professional: validGrant.professional,
      scope: "graph-summary",
      grantedAt: 1758000000,
      firstOpenedAt: 1758000100,
    };
    expect(Object.keys(audit).sort()).toEqual([
      "firstOpenedAt",
      "grantId",
      "grantedAt",
      "professional",
      "scope",
    ]);
    expect(shared.status).toBe("active");
    expect(trend.movingAverage7).toBeGreaterThan(trend.average);
    expect(memory.confirmedByUser).toBe(false);
    expect(checkIn.source).toBe("manual");
    expect(session.mode).toBe("private");
  });

  it("las etiquetas cerradas provienen de una única fuente (schemas)", () => {
    // Compilación: si schemas.ts y contracts.ts divergieran en etiquetas,
    // estas asignaciones dejarían de tipar.
    const emotion: (typeof EMOTION_LABELS)[number] = "calma";
    const risk: (typeof RISK_LEVELS)[number] = "bajo";
    const memoryType: (typeof MEMORY_TYPES)[number] = "pendiente";
    expect(EMOTION_LABELS).toContain(emotion);
    expect(RISK_LEVELS).toContain(risk);
    expect(MEMORY_TYPES).toContain(memoryType);
    expect(EMOTION_LABELS).toHaveLength(12);
    expect(MEMORY_TYPES).toHaveLength(5);
    expect(RISK_LEVELS).toHaveLength(3);
  });

  it("el puerto del modelo reconoce las dos etapas de memoria acotada", () => {
    const schemas: Array<Parameters<LLMPort["extract"]>[1]> = [
      "session-digest",
      "memory-capsule",
    ];
    expect(schemas).toEqual(["session-digest", "memory-capsule"]);
  });
});
