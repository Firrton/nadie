import { beforeEach, describe, expect, it } from "vitest";
import { generateEncryptionKeyPair, serializeEncryptedPackage, encryptPackage } from "@nadie/core";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { createGatewayApp, type GatewayConfig, type SignatureVerifier } from "./gateway";
import { parseGatewayEnvironment } from "./config";
import { FilePackageStore, sha256Hex } from "./file-store";
import { createViemSignatureVerifier } from "./index";
import type { BlockRef, ChainAuthorizationPort, ConsentSnapshot, PackageStore, StoredPackageRecord } from "./ports";

// ---------------------------------------------------------------------------
// Fakes deterministas
// ---------------------------------------------------------------------------

class MemoryStore implements PackageStore {
  records = new Map<string, StoredPackageRecord>();
  async put(record: StoredPackageRecord): Promise<void> {
    this.records.set(record.packageHash, record);
  }
  async get(packageHash: string): Promise<StoredPackageRecord | undefined> {
    return this.records.get(packageHash);
  }
  async delete(packageHash: string): Promise<boolean> {
    return this.records.delete(packageHash);
  }
  async sweepExpired(nowSeconds: number): Promise<number> {
    let n = 0;
    for (const [hash, rec] of this.records) {
      if (rec.storedUntil <= nowSeconds) {
        this.records.delete(hash);
        n += 1;
      }
    }
    return n;
  }
}

class FakeChain implements ChainAuthorizationPort {
  latestBlock: BlockRef = { blockNumber: 100n };
  snapshots = new Map<string, ConsentSnapshot>();
  failLatest = false;
  failSnapshot = false;
  latestCalls = 0;
  snapshotCalls: { consentId: string; blockNumber: bigint }[] = [];
  // Bloques vistos por cada snapshot, para exigir el mismo blockNumber.
  blockNumbersSeen: bigint[] = [];

  async getLatestBlock(): Promise<BlockRef> {
    this.latestCalls += 1;
    if (this.failLatest) throw new Error("rpc down");
    return this.latestBlock;
  }

  async getConsentSnapshot(consentId: string, at: BlockRef): Promise<ConsentSnapshot> {
    if (this.failSnapshot) throw new Error("rpc down");
    this.snapshotCalls.push({ consentId, blockNumber: at.blockNumber });
    this.blockNumbersSeen.push(at.blockNumber);
    const snap = this.snapshots.get(consentId);
    if (!snap) throw new Error("rpc down");
    return snap;
  }
}

class FakeVerifier implements SignatureVerifier {
  lastMessage: string | undefined;
  fail = false;
  verifyPersonalMessage(message: string, _signature: string, _expected: string): boolean {
    this.lastMessage = message;
    return !this.fail;
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const PROFESSIONAL = "0x2345678901abcdef2345678901abcdef23456789";
const CONSENT_ID = "0x" + "ab".repeat(32);

let clock = 1_000_000;
const now = () => clock;

const config: GatewayConfig = {
  chainId: 133,
  consentRegistryAddress: "0x" + "cd".repeat(20),
  gatewayUrl: "http://localhost:8787",
  allowedOrigin: "http://localhost:5173",
  maxPackageBytes: 1_048_576,
  retentionSeconds: 604_800,
  challengeTtlSeconds: 60,
  maxActiveChallenges: 10_000,
};

async function makeEnvelope() {
  const kp = await generateEncryptionKeyPair();
  const envelope = await encryptPackage(new TextEncoder().encode("resumen secreto"), kp.publicKey, {
    professional: PROFESSIONAL,
    scope: "graph-summary",
  });
  const bytes = serializeEncryptedPackage(envelope);
  // packageHash real calculado en el test según necesidad
  const { hashEncryptedPackage } = await import("@nadie/core");
  const packageHash = hashEncryptedPackage(envelope);
  return { envelope, bytes, packageHash, kp };
}

function makeApp(overrides?: { store?: PackageStore; chain?: FakeChain; verifier?: FakeVerifier }) {
  const store = overrides?.store ?? new MemoryStore();
  const chain = overrides?.chain ?? new FakeChain();
  const verifier = overrides?.verifier ?? new FakeVerifier();
  const app = createGatewayApp({ store, chain, verifier, config, now });
  return { app, store, chain, verifier };
}

describe("gateway adapters and configuration", () => {
  it("accepts ordinary unrelated operating-system environment variables", () => {
    const env = parseGatewayEnvironment({
      PATH: "/usr/local/bin:/usr/bin",
      HOME: "/tmp/home",
      HASHKEY_RPC_URL: "http://127.0.0.1:8545",
      HASHKEY_CHAIN_ID: "133",
      CONSENT_REGISTRY_ADDRESS: config.consentRegistryAddress,
    });
    expect(env.HASHKEY_CHAIN_ID).toBe(133);
    expect(env.GATEWAY_PORT).toBe(8787);
  });
});

function fetchHelper(app: ReturnType<typeof createGatewayApp>) {
  return (path: string, init?: RequestInit) => app.fetch(new Request(`http://localhost${path}`, init));
}

// ---------------------------------------------------------------------------
// PUT /v1/packages/:packageHash
// ---------------------------------------------------------------------------

describe("PUT /v1/packages/:packageHash", () => {
  it("upload válido responde 201 con hash, storedUntil y deletionToken, y guarda bytes canónicos", async () => {
    const { app, store } = makeApp();
    const f = fetchHelper(app);
    const { bytes, packageHash } = await makeEnvelope();
    const res = await f(`/v1/packages/${packageHash}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from(bytes),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { packageHash: string; storedUntil: number; deletionToken: string };
    expect(body.packageHash).toBe(packageHash);
    expect(body.storedUntil).toBe(now() + config.retentionSeconds);
    expect(body.deletionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Bytes guardados = canónicos.
    const stored = await store.get(packageHash);
    expect(stored && Array.from(stored.bytes)).toEqual(Array.from(bytes));
  });

  it("hash mismatch responde 400", async () => {
    const { app } = makeApp();
    const f = fetchHelper(app);
    const { bytes } = await makeEnvelope();
    const wrongHash = "0x" + "ee".repeat(32);
    const res = await f(`/v1/packages/${wrongHash}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from(bytes),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_REQUEST" });
  });

  it("envelope inválido responde 400", async () => {
    const { app } = makeApp();
    const f = fetchHelper(app);
    const res = await f(`/v1/packages/${"0x" + "ab".repeat(32)}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from(new Uint8Array([1, 2, 3])),
    });
    expect(res.status).toBe(400);
  });

  it("content-type incorrecto responde 400", async () => {
    const { app } = makeApp();
    const f = fetchHelper(app);
    const { bytes, packageHash } = await makeEnvelope();
    const res = await f(`/v1/packages/${packageHash}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: Buffer.from(bytes),
    });
    expect(res.status).toBe(400);
  });

  it("hash de path no canónico responde 400", async () => {
    const { app } = makeApp();
    const f = fetchHelper(app);
    const { bytes } = await makeEnvelope();
    const res = await f(`/v1/packages/${"0x" + "AB".repeat(32)}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from(bytes),
    });
    expect(res.status).toBe(400);
  });

  it("límite exacto pasa y el exceso responde 413", async () => {
    const smallConfig = { ...config, maxPackageBytes: 100 };
    const store = new MemoryStore();
    const chain = new FakeChain();
    const app = createGatewayApp({ store, chain, verifier: new FakeVerifier(), config: smallConfig, now });
    const f = fetchHelper(app);
    // body de exactamente 100 bytes: no es un envelope válido, pero el 400
    // demuestra que pasó el límite; con 101 bytes el 413 llega antes.
    const res100 = await f(`/v1/packages/${"0x" + "ab".repeat(32)}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream", "content-length": "100" },
      body: Buffer.from(new Uint8Array(100)),
    });
    expect(res100.status).toBe(400);
    const res101 = await f(`/v1/packages/${"0x" + "ab".repeat(32)}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream", "content-length": "101" },
      body: Buffer.from(new Uint8Array(101)),
    });
    expect(res101.status).toBe(413);
    expect(await res101.json()).toEqual({ error: "PAYLOAD_TOO_LARGE" });
  });

  it("duplicado responde 409 sin overwrite ni token previo", async () => {
    const { app, store } = makeApp();
    const f = fetchHelper(app);
    const { bytes, packageHash } = await makeEnvelope();
    const first = await f(`/v1/packages/${packageHash}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from(bytes),
    });
    const firstBody = (await first.json()) as { deletionToken: string };
    const second = await f(`/v1/packages/${packageHash}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from(bytes),
    });
    expect(second.status).toBe(409);
    const secondBody = (await second.json()) as { deletionToken?: string };
    expect(secondBody.deletionToken).toBeUndefined();
    // El registro original sigue intacto.
    const rec = await store.get(packageHash);
    expect(rec && Array.from(rec.bytes)).toEqual(Array.from(bytes));
    expect(rec?.deletionTokenDigest).toBe(sha256Hex(new TextEncoder().encode(firstBody.deletionToken)));
  });

  it("el storage nunca contiene plaintext ni claves privadas", async () => {
    const store = new MemoryStore();
    const { app } = makeApp({ store });
    const f = fetchHelper(app);
    const { bytes, packageHash } = await makeEnvelope();
    await f(`/v1/packages/${packageHash}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from(bytes),
    });
    const dump = JSON.stringify(Array.from(store.records.values()));
    expect(dump).not.toContain("resumen secreto");
    expect(dump).not.toContain("privateKey");
  });
});

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

describe("POST /v1/access/challenges", () => {
  it("crea challenge aleatorio con mensaje ligado y TTL", async () => {
    const { app } = makeApp();
    const f = fetchHelper(app);
    const res = await f("/v1/access/challenges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consentId: CONSENT_ID, professional: PROFESSIONAL }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { challengeId: string; message: string; expiresAt: number };
    expect(body.challengeId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.expiresAt).toBe(now() + 60);
    expect(body.message).toContain("Nadie Gateway Access v1");
    expect(body.message).toContain(config.gatewayUrl);
    expect(body.message).toContain("chainId 133");
    expect(body.message).toContain(config.consentRegistryAddress);
    expect(body.message).toContain(CONSENT_ID);
    expect(body.message).toContain(PROFESSIONAL);
    expect(body.message).toContain(String(body.expiresAt));
    // Dos challenges difieren (nonce aleatorio).
    const res2 = await f("/v1/access/challenges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consentId: CONSENT_ID, professional: PROFESSIONAL }),
    });
    const body2 = (await res2.json()) as { message: string };
    expect(body2.message).not.toBe(body.message);
  });

  it("body estricto: extra o inválido responde 400", async () => {
    const { app } = makeApp();
    const f = fetchHelper(app);
    const extra = await f("/v1/access/challenges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consentId: CONSENT_ID, professional: PROFESSIONAL, extra: 1 }),
    });
    expect(extra.status).toBe(400);
    const bad = await f("/v1/access/challenges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consentId: "no-hex", professional: PROFESSIONAL }),
    });
    expect(bad.status).toBe(400);
  });

  it("no consulta blockchain ni storage", async () => {
    const chain = new FakeChain();
    const store = new MemoryStore();
    const { app } = makeApp({ chain, store });
    const f = fetchHelper(app);
    await f("/v1/access/challenges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consentId: CONSENT_ID, professional: PROFESSIONAL }),
    });
    expect(chain.latestCalls).toBe(0);
    expect(chain.snapshotCalls.length).toBe(0);
    expect(store.records.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/packages/:consentId/access
// ---------------------------------------------------------------------------

describe("POST /v1/packages/:consentId/access", () => {
  async function setupAccess(overrides?: { snapshot?: Partial<ConsentSnapshot> }) {
    const { bytes, packageHash } = await makeEnvelope();
    const store = new MemoryStore();
    await store.put({
      packageHash,
      bytes,
      storedUntil: now() + 3600,
      deletionTokenDigest: sha256Hex(new TextEncoder().encode("token")),
    });
    const chain = new FakeChain();
    chain.snapshots.set(CONSENT_ID, {
      exists: true,
      professional: PROFESSIONAL,
      packageHash,
      firstOpenedAt: 12345,
      valid: true,
      ...overrides?.snapshot,
    });
    const verifier = new FakeVerifier();
    const app = createGatewayApp({ store, chain, verifier, config, now });
    const f = fetchHelper(app);
    const challenge = (await (
      await f("/v1/access/challenges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consentId: CONSENT_ID, professional: PROFESSIONAL }),
      })
    ).json()) as { challengeId: string };
    return { app, f, store, chain, verifier, bytes, packageHash, challengeId: challenge.challengeId };
  }

  const accessBody = (challengeId: string) =>
    JSON.stringify({ challengeId, signature: "0x" + "ab".repeat(65) });

  it("acceso válido devuelve los bytes canónicos con headers correctos", async () => {
    const t = await setupAccess();
    const res = await t.f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const bodyBytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bodyBytes)).toEqual(Array.from(t.bytes));
  });

  it("challenge vencido responde 404 uniforme", async () => {
    const t = await setupAccess();
    clock += 61; // vence el TTL de 60s
    const res = await t.f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_AUTHORIZED" });
    clock -= 61;
  });

  it("replay del challenge responde 404", async () => {
    const t = await setupAccess();
    const first = await t.f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(first.status).toBe(200);
    const replay = await t.f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(replay.status).toBe(404);
    expect(await replay.json()).toEqual({ error: "NOT_AUTHORIZED" });
  });

  it("challenge ligado a otro consentId responde 404", async () => {
    const t = await setupAccess();
    const otherConsent = "0x" + "cd".repeat(32);
    const res = await t.f(`/v1/packages/${otherConsent}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_AUTHORIZED" });
  });

  it("firma inválida responde 404 SIN consultar RPC", async () => {
    const t = await setupAccess();
    t.verifier.fail = true;
    const res = await t.f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(res.status).toBe(404);
    expect(t.chain.latestCalls).toBe(0);
    expect(t.chain.snapshotCalls.length).toBe(0);
  });

  it("el adapter viem real rechaza la firma de otra wallet con 404", async () => {
    const { bytes, packageHash } = await makeEnvelope();
    const store = new MemoryStore();
    await store.put({
      packageHash,
      bytes,
      storedUntil: now() + 3600,
      deletionTokenDigest: sha256Hex(new TextEncoder().encode("token")),
    });
    const expected = privateKeyToAccount(generatePrivateKey());
    const attacker = privateKeyToAccount(generatePrivateKey());
    const professional = expected.address.toLowerCase();
    const chain = new FakeChain();
    chain.snapshots.set(CONSENT_ID, {
      exists: true,
      professional,
      packageHash,
      firstOpenedAt: 12345,
      valid: true,
    });
    const app = createGatewayApp({
      store,
      chain,
      verifier: createViemSignatureVerifier(),
      config,
      now,
    });
    const f = fetchHelper(app);
    const challenge = (await (
      await f("/v1/access/challenges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consentId: CONSENT_ID, professional }),
      })
    ).json()) as { challengeId: string; message: string };
    const signature = await attacker.signMessage({ message: challenge.message });

    const response = await f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: challenge.challengeId, signature }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "NOT_AUTHORIZED" });
    expect(chain.latestCalls).toBe(0);
  });

  it("consentimiento inexistente/inválido/no abierto/profesional distinto: mismo 404", async () => {
    for (const snapshot of [
      { exists: false },
      { valid: false },
      { firstOpenedAt: 0 },
      { professional: "0x" + "99".repeat(20) },
    ]) {
      const t = await setupAccess({ snapshot: snapshot as Partial<ConsentSnapshot> });
      const res = await t.f(`/v1/packages/${CONSENT_ID}/access`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: accessBody(t.challengeId),
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "NOT_AUTHORIZED" });
    }
  });

  it("blob ausente responde 404", async () => {
    const t = await setupAccess();
    await t.store.delete(t.packageHash);
    const res = await t.f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_AUTHORIZED" });
  });

  it("blob corrupto (hash no coincide) responde 404", async () => {
    const t = await setupAccess();
    // Corromper el blob guardado.
    const rec = (await t.store.get(t.packageHash))!;
    const corrupted = new Uint8Array(rec.bytes);
    corrupted[corrupted.length - 5] = corrupted[corrupted.length - 5]! ^ 0xff;
    await t.store.put({ ...rec, bytes: corrupted });
    const res = await t.f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(res.status).toBe(404);
  });

  it("metadata.professional distinto al on-chain responde 404", async () => {
    const t = await setupAccess({ snapshot: { professional: "0x" + "99".repeat(20) } });
    // El snapshot dice otro profesional; el challenge era para PROFESSIONAL.
    const res = await t.f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(res.status).toBe(404);
  });

  it("blob expirado responde 404 y se limpia", async () => {
    const t = await setupAccess();
    const rec = (await t.store.get(t.packageHash))!;
    await t.store.put({ ...rec, storedUntil: now() });
    const res = await t.f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(res.status).toBe(404);
  });

  it("RPC caído en getLatestBlock responde 503 y nunca concede acceso", async () => {
    const t = await setupAccess();
    t.chain.failLatest = true;
    const res = await t.f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "UNAVAILABLE" });
  });

  it("RPC caído en snapshot responde 503", async () => {
    const t = await setupAccess();
    t.chain.failSnapshot = true;
    const res = await t.f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(res.status).toBe(503);
  });

  it("lecturas on-chain usan exactamente el mismo blockNumber", async () => {
    const t = await setupAccess();
    await t.f(`/v1/packages/${CONSENT_ID}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    });
    expect(t.chain.blockNumbersSeen).toEqual([100n]);
    expect(t.chain.snapshotCalls[0]?.consentId).toBe(CONSENT_ID);
  });

  it("accesos concurrentes: un solo challenge no sirve dos veces", async () => {
    const t = await setupAccess();
    const bodies = Array.from({ length: 5 }, () => ({
      method: "POST" as const,
      headers: { "content-type": "application/json" },
      body: accessBody(t.challengeId),
    }));
    const results = await Promise.all(
      bodies.map((b) => t.f(`/v1/packages/${CONSENT_ID}/access`, b)),
    );
    const ok = results.filter((r) => r.status === 200);
    const denied = results.filter((r) => r.status === 404);
    expect(ok.length).toBe(1);
    expect(denied.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /v1/packages/:packageHash", () => {
  it("eliminación válida borra el paquete", async () => {
    const { app, store } = makeApp();
    const f = fetchHelper(app);
    const { bytes, packageHash } = await makeEnvelope();
    const put = (await (
      await f(`/v1/packages/${packageHash}`, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: Buffer.from(bytes),
      })
    ).json()) as { deletionToken: string };
    const res = await f(`/v1/packages/${packageHash}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${put.deletionToken}` },
    });
    expect(res.status).toBe(200);
    expect(await store.get(packageHash)).toBeUndefined();
  });

  it("token inválido y paquete inexistente devuelven el mismo 404", async () => {
    const { app } = makeApp();
    const f = fetchHelper(app);
    const { bytes, packageHash } = await makeEnvelope();
    await f(`/v1/packages/${packageHash}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from(bytes),
    });
    const badToken = await f(`/v1/packages/${packageHash}`, {
      method: "DELETE",
      headers: { authorization: "Bearer AAAAinvalido" },
    });
    const missing = await f(`/v1/packages/${"0x" + "77".repeat(32)}`, {
      method: "DELETE",
      headers: { authorization: "Bearer " + "A".repeat(43) },
    });
    expect(badToken.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await badToken.json()).toEqual({ error: "NOT_AUTHORIZED" });
    expect(await missing.json()).toEqual({ error: "NOT_AUTHORIZED" });
  });
});

// ---------------------------------------------------------------------------
// Health, retención y CORS
// ---------------------------------------------------------------------------

describe("health, retención y CORS", () => {
  it("GET /healthz responde exactamente", async () => {
    const { app } = makeApp();
    const res = await fetchHelper(app)("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("cleanup por retención borra expirados", async () => {
    const store = new MemoryStore();
    const { app } = makeApp({ store });
    const f = fetchHelper(app);
    const { bytes, packageHash } = await makeEnvelope();
    await f(`/v1/packages/${packageHash}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from(bytes),
    });
    clock += config.retentionSeconds + 1;
    const second = await makeEnvelope();
    // Un PUT nuevo dispara el sweep lazy y borra el expirado.
    await f(`/v1/packages/${second.packageHash}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from(second.bytes),
    });
    expect(await store.get(packageHash)).toBeUndefined();
    expect(await store.get(second.packageHash)).toBeDefined();
    clock -= config.retentionSeconds + 1;
  });

  it("CORS permite el origen configurado y rechaza otros", async () => {
    const { app } = makeApp();
    const f = fetchHelper(app);
    const ok = await f("/healthz", { headers: { origin: "http://localhost:5173" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const bad = await f("/healthz", { headers: { origin: "https://evil.example" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FilePackageStore real (filesystem)
// ---------------------------------------------------------------------------

describe("FilePackageStore", () => {
  const dir = `.data/gateway-test-${process.pid}`;

  beforeEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(dir, { recursive: true, force: true });
  });

  it("put/get/delete/sweep con escritura atómica y sin plaintext", async () => {
    const store = new FilePackageStore(dir);
    await store.init();
    const { bytes, packageHash } = await makeEnvelope();
    await store.put({
      packageHash,
      bytes,
      storedUntil: now() + 100,
      deletionTokenDigest: sha256Hex(new TextEncoder().encode("tok")),
    });
    const rec = await store.get(packageHash);
    expect(rec && Array.from(rec.bytes)).toEqual(Array.from(bytes));
    // Sin plaintext en disco.
    const { readdir, readFile } = await import("node:fs/promises");
    const files = await readdir(dir);
    const dump: string[] = [];
    for (const file of files) {
      dump.push(await readFile(`${dir}/${file}`, "utf8").catch(() => ""));
    }
    expect(dump.join("|")).not.toContain("resumen secreto");
    // Delete y sweep.
    expect(await store.delete(packageHash)).toBe(true);
    expect(await store.get(packageHash)).toBeUndefined();
    await store.put({
      packageHash,
      bytes,
      storedUntil: now() - 1,
      deletionTokenDigest: "x",
    });
    expect(await store.sweepExpired(now())).toBe(1);
    expect(await store.get(packageHash)).toBeUndefined();
  });

  it("path traversal imposible: hash no canónico rechazado", async () => {
    const store = new FilePackageStore(dir);
    await store.init();
    await expect(
      store.put({
        packageHash: "../../etc/passwd",
        bytes: new Uint8Array(1),
        storedUntil: 1,
        deletionTokenDigest: "x",
      }),
    ).rejects.toThrow();
  });
});
