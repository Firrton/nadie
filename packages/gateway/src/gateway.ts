/**
 * createGatewayApp: app Hono con dependencias inyectables.
 *
 * El gateway guarda y entrega paquetes CIFRADOS. Nunca descifra, nunca tiene
 * llaves blockchain, nunca llama open() ni firma transacciones. Falla
 * cerrado ante cualquier error RPC.
 *
 * Errores uniformes: NOT_AUTHORIZED (404 opaco) para todo rechazo de
 * acceso, sin distinguir la causa. UNAVAILABLE (503) ante fallo RPC.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomBytes, timingSafeEqual } from "node:crypto";

import { deserializeEncryptedPackage, hashEncryptedPackage, serializeEncryptedPackage } from "@nadie/core";

import { sha256Hex } from "./file-store";
import type { ChainAuthorizationPort, PackageStore } from "./ports";

// ---------------------------------------------------------------------------
// Configuración validada
// ---------------------------------------------------------------------------

export interface GatewayConfig {
  chainId: number;
  consentRegistryAddress: string;
  gatewayUrl: string;
  allowedOrigin: string;
  maxPackageBytes: number;
  retentionSeconds: number;
  challengeTtlSeconds: number;
  maxActiveChallenges: number;
}

export const DEFAULT_MAX_PACKAGE_BYTES = 1_048_576;
export const DEFAULT_RETENTION_SECONDS = 604_800;
export const DEFAULT_CHALLENGE_TTL_SECONDS = 60;
export const DEFAULT_MAX_ACTIVE_CHALLENGES = 10_000;

const HASH_RE = /^0x[0-9a-f]{64}$/;
const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

interface ErrorBody {
  error: "INVALID_REQUEST" | "PAYLOAD_TOO_LARGE" | "NOT_AUTHORIZED" | "UNAVAILABLE";
}

type Ctx = { json: (b: ErrorBody, s: 400 | 404 | 503) => Response };

function invalidRequest(c: Ctx): Response {
  return c.json({ error: "INVALID_REQUEST" as const }, 400);
}

function notAuthorized(c: Ctx): Response {
  // 404 opaco uniforme: nunca distinguir la causa.
  return c.json({ error: "NOT_AUTHORIZED" as const }, 404);
}

function unavailable(c: Ctx): Response {
  return c.json({ error: "UNAVAILABLE" as const }, 503);
}

// ---------------------------------------------------------------------------
// Challenge EIP-191
// ---------------------------------------------------------------------------

interface ChallengeRecord {
  /** id aleatorio, hex 32 bytes. */
  challengeId: string;
  /** nonce aleatorio del mensaje, hex 32 bytes. */
  nonce: string;
  consentId: string;
  professional: string;
  expiresAt: number; // segundos Unix
}

interface ChallengeRegistry {
  create(consentId: string, professional: string, nowSeconds: number): ChallengeRecord;
  /** Consumo atómico: devuelve el registro solo si existe, está vigente y no fue usado. */
  consume(challengeId: string, consentId: string, nowSeconds: number): ChallengeRecord | undefined;
  size(): number;
}

function createChallengeRegistry(ttlSeconds: number, maxActive: number): ChallengeRegistry {
  const challenges = new Map<string, ChallengeRecord>();
  let issued = 0;
  return {
    create(consentId: string, professional: string, nowSeconds: number): ChallengeRecord {
      // Limpieza lazy de vencidos.
      for (const [id, rec] of challenges) {
        if (rec.expiresAt <= nowSeconds) challenges.delete(id);
      }
      if (challenges.size >= maxActive) {
        throw new Error("challenge capacity exceeded");
      }
      issued += 1;
      const rec: ChallengeRecord = {
        challengeId: `0x${randomBytes(32).toString("hex")}`,
        nonce: `0x${randomBytes(32).toString("hex")}`,
        consentId,
        professional,
        expiresAt: nowSeconds + ttlSeconds,
      };
      challenges.set(rec.challengeId, rec);
      void issued;
      return rec;
    },
    consume(challengeId: string, consentId: string, nowSeconds: number): ChallengeRecord | undefined {
      const rec = challenges.get(challengeId);
      if (!rec) return undefined;
      challenges.delete(challengeId); // atómico: un solo uso
      if (rec.expiresAt <= nowSeconds) return undefined;
      if (rec.consentId !== consentId) return undefined;
      return rec;
    },
    size(): number {
      return challenges.size;
    },
  };
}

/** Mensaje EIP-191 determinista del challenge. */
function challengeMessage(cfg: GatewayConfig, rec: ChallengeRecord): string {
  return [
    "Nadie Gateway Access v1",
    cfg.gatewayUrl,
    `chainId ${cfg.chainId}`,
    cfg.consentRegistryAddress,
    rec.consentId,
    rec.professional,
    rec.nonce,
    String(rec.expiresAt),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Verificación de firma EIP-191 (inyectada para tests)
// ---------------------------------------------------------------------------

export interface SignatureVerifier {
  /**
   * Verifica la firma EIP-191 del mensaje contra la address esperada.
   * La implementación productiva usa viem; los tests inyectan la suya.
   */
  verifyPersonalMessage(message: string, signature: string, expectedAddress: string): boolean;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export interface GatewayDeps {
  store: PackageStore;
  chain: ChainAuthorizationPort;
  verifier: SignatureVerifier;
  config: GatewayConfig;
  /** Reloj inyectable para tests deterministas; default: reloj real. */
  now?: () => number;
}

export function createGatewayApp(deps: GatewayDeps): Hono {
  const { store, chain, verifier, config } = deps;
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const challenges = createChallengeRegistry(config.challengeTtlSeconds, config.maxActiveChallenges);

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: (origin) => (origin === config.allowedOrigin ? config.allowedOrigin : undefined),
      allowMethods: ["GET", "PUT", "POST", "DELETE"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: false,
    }),
  );

  // bodyLimit exacto.
  app.use("*", async (c, next): Promise<Response | undefined> => {
    const lengthHeader = c.req.header("content-length");
    if (lengthHeader !== undefined) {
      const length = Number(lengthHeader);
      if (Number.isFinite(length) && length > config.maxPackageBytes) {
        return c.json({ error: "PAYLOAD_TOO_LARGE" as const }, 413);
      }
    }
    await next();
    return undefined;
  });

  // GET /healthz
  app.get("/healthz", (c) => c.json({ status: "ok" }));

  // PUT /v1/packages/:packageHash
  app.put("/v1/packages/:packageHash", async (c) => {
    const packageHash = c.req.param("packageHash");
    if (!HASH_RE.test(packageHash)) {
      return invalidRequest(c);
    }
    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/octet-stream")) {
      return invalidRequest(c);
    }

    const body = new Uint8Array(await c.req.arrayBuffer());
    if (body.byteLength === 0) {
      return invalidRequest(c);
    }
    if (body.byteLength > config.maxPackageBytes) {
      return c.json({ error: "PAYLOAD_TOO_LARGE" as const }, 413);
    }

    // Deserializar, reserializar canónicamente y calcular el hash.
    let envelope;
    try {
      envelope = deserializeEncryptedPackage(body);
    } catch {
      return invalidRequest(c);
    }
    const canonicalBytes = new Uint8Array(serializeEncryptedPackage(envelope));
    const computedHash = hashEncryptedPackage(envelope);
    if (computedHash !== packageHash) {
      return invalidRequest(c);
    }

    // Duplicado: 409 opaco, sin overwrite ni exposición del token anterior.
    const existing = await store.get(packageHash);
    if (existing) {
      return c.json({ error: "INVALID_REQUEST" as const }, 409);
    }

    // Retención y deletionToken de un solo uso.
    const nowSeconds = now();
    const storedUntil = nowSeconds + config.retentionSeconds;
    const deletionToken = randomBytes(32).toString("base64url");

    try {
      await store.put({
        packageHash,
        bytes: canonicalBytes,
        storedUntil,
        deletionTokenDigest: sha256Hex(new TextEncoder().encode(deletionToken)),
      });
    } catch {
      return unavailable(c);
    }
    // Limpieza lazy oportunista.
    void store.sweepExpired(nowSeconds).catch(() => undefined);

    return c.json({ packageHash, storedUntil, deletionToken }, 201);
  });

  // POST /v1/access/challenges
  app.post("/v1/access/challenges", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return invalidRequest(c);
    }
    if (
      body === null ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return invalidRequest(c);
    }
    const obj = body as Record<string, unknown>;
    if (
      Object.keys(obj).length !== 2 ||
      typeof obj.consentId !== "string" ||
      typeof obj.professional !== "string" ||
      !HASH_RE.test(obj.consentId) ||
      !ADDRESS_RE.test(obj.professional)
    ) {
      return invalidRequest(c);
    }

    let rec: ChallengeRecord;
    try {
      rec = challenges.create(obj.consentId, obj.professional, now());
    } catch {
      return invalidRequest(c);
    }
    return c.json({
      challengeId: rec.challengeId,
      message: challengeMessage(config, rec),
      expiresAt: rec.expiresAt,
    });
  });

  // POST /v1/packages/:consentId/access
  app.post("/v1/packages/:consentId/access", async (c) => {
    const consentId = c.req.param("consentId");
    if (!HASH_RE.test(consentId)) {
      return invalidRequest(c);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return invalidRequest(c);
    }
    if (
      body === null ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return invalidRequest(c);
    }
    const obj = body as Record<string, unknown>;
    if (
      Object.keys(obj).length !== 2 ||
      typeof obj.challengeId !== "string" ||
      typeof obj.signature !== "string" ||
      !/^0x[0-9a-f]{64}$/.test(obj.challengeId) ||
      !/^0x[0-9a-f]{130}$/.test(obj.signature)
    ) {
      return invalidRequest(c);
    }

    // 1-2) Consumo atómico del challenge, vigente y ligado al consentId.
    const rec = challenges.consume(obj.challengeId, consentId, now());
    if (!rec) {
      return notAuthorized(c);
    }

    // 3) Firma EIP-191 contra el professional del challenge. Sin RPC antes.
    if (!verifier.verifyPersonalMessage(challengeMessage(config, rec), obj.signature, rec.professional)) {
      return notAuthorized(c);
    }

    // 4) Bloque observado.
    let blockRef;
    try {
      blockRef = await chain.getLatestBlock();
    } catch {
      return unavailable(c);
    }

    // 5) Snapshot en ese bloque exacto.
    let snapshot;
    try {
      snapshot = await chain.getConsentSnapshot(consentId, blockRef);
    } catch {
      return unavailable(c);
    }

    // 6) Condiciones on-chain.
    if (
      !snapshot.exists ||
      !snapshot.valid ||
      !(snapshot.firstOpenedAt > 0) ||
      snapshot.professional !== rec.professional
    ) {
      return notAuthorized(c);
    }

    // 7) Blob por el packageHash ON-CHAIN.
    const record = await store.get(snapshot.packageHash);
    if (!record) {
      return notAuthorized(c);
    }
    const nowSeconds = now();
    if (record.storedUntil <= nowSeconds) {
      // Expirado: limpiar y rechazar.
      void store.delete(snapshot.packageHash).catch(() => undefined);
      return notAuthorized(c);
    }

    // 8) Revalidar estructura y hash contra corrupción.
    let envelope;
    try {
      envelope = deserializeEncryptedPackage(record.bytes);
    } catch {
      return notAuthorized(c);
    }
    const recomputed = hashEncryptedPackage(envelope);
    if (recomputed !== snapshot.packageHash || recomputed !== record.packageHash) {
      return notAuthorized(c);
    }

    // 9) metadata.professional igual al professional on-chain.
    if (envelope.metadata.professional !== snapshot.professional) {
      return notAuthorized(c);
    }

    // 10) Bytes canónicos.
    c.header("Content-Type", "application/octet-stream");
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    return c.body(new Uint8Array(record.bytes));
  });

  // DELETE /v1/packages/:packageHash
  app.delete("/v1/packages/:packageHash", async (c) => {
    const packageHash = c.req.param("packageHash");
    if (!HASH_RE.test(packageHash)) {
      return invalidRequest(c);
    }
    const auth = c.req.header("authorization") ?? "";
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(auth);
    if (!match) {
      // Token inválido y paquete inexistente: mismo 404.
      return notAuthorized(c);
    }
    const record = await store.get(packageHash);
    if (!record) {
      return notAuthorized(c);
    }
    // Comparación constant-time del SHA-256 del token presentado.
    const presented = sha256Hex(new TextEncoder().encode(match[1]));
    const expected = Buffer.from(record.deletionTokenDigest, "hex");
    const presentedBuf = Buffer.from(presented, "hex");
    if (presentedBuf.length !== expected.length || !timingSafeEqual(presentedBuf, expected)) {
      return notAuthorized(c);
    }
    await store.delete(packageHash);
    return c.json({ status: "deleted" });
  });

  return app;
}