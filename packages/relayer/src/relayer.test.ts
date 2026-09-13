import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import { createRelayerApp } from "./app";
import { validateRelayerStartup } from "./bootstrap";
import { parseRelayerEnvironment } from "./config";
import { MemoryIdempotencyStore, type ChainRelayerPort } from "./ports";
import { ChainUnavailableError, RelayService, SimulationRejectedError } from "./relayer";
import { createViemSignatureRecovery } from "./security";
import { GRANT_TYPES, REVOKE_TYPES, type GrantRelayRequest, type PreparedTransaction, type RevokeRelayRequest } from "./types";

const CONTRACT = "0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1" as const;
const USER_KEY = "0x59c6995e998f97a5a0044976f7d9e66c1a1ca9b6d7002dceab80d6e469c92c2a" as const;
const OTHER_KEY = "0x8b3a350cf5c34c9194ca3a545d7d4fac45f0f9f257da55a1e36338f18f0c71b1" as const;
const USER = privateKeyToAccount(USER_KEY);
const OTHER = privateKeyToAccount(OTHER_KEY);
const PROFESSIONAL = "0x566d7a52094F3eBbe640061Ae73A7783B30562DD" as const;
const TX = `0x${"a".repeat(64)}` as const;
const NOW = 1_800_000_000;

interface RawRequest {
  domain: { name: string; version: string; chainId: number; verifyingContract: string };
  message: Record<string, string>;
  signature: string;
}

class FakeChain implements ChainRelayerPort {
  chainId = 133;
  code: `0x${string}` = "0x1234";
  balance = 10n ** 18n;
  nonce = 0n;
  gas = 100_000n;
  cost = 1_000n;
  submits = 0;
  rpcCalls = 0;
  activeSubmits = 0;
  maxActiveSubmits = 0;
  simulationError: Error | undefined = undefined;
  submitError: Error | undefined = undefined;
  submitBarrier: Promise<void> | undefined = undefined;
  preparedKinds: string[] = [];
  preparedRequests: Array<GrantRelayRequest | RevokeRelayRequest> = [];
  status: "pending" | "confirmed" | "reverted" = "pending";
  blockNumber = 55n;

  async getChainId() { this.rpcCalls += 1; return this.chainId; }
  async getCode() { this.rpcCalls += 1; return this.code; }
  async getRelayerBalance() { this.rpcCalls += 1; return this.balance; }
  async getUserNonce() { this.rpcCalls += 1; return this.nonce; }
  async simulateGrant(request: GrantRelayRequest) { this.rpcCalls += 1; return this.#prepare("grant", request); }
  async simulateRevoke(request: RevokeRelayRequest) { this.rpcCalls += 1; return this.#prepare("revoke", request); }
  async #prepare(kind: string, request: GrantRelayRequest | RevokeRelayRequest): Promise<PreparedTransaction> {
    if (this.simulationError) throw this.simulationError;
    this.preparedKinds.push(kind);
    this.preparedRequests.push(request);
    // feePerGas y maxCostWei coherentes: el servicio exige gas * feePerGas === maxCostWei.
    const feePerGas = this.gas > 0n ? this.cost / this.gas + 1n : 1n;
    return { request, gas: this.gas, feePerGas, maxCostWei: this.gas * feePerGas };
  }
  async submit(): Promise<`0x${string}`> {
    this.submits += 1;
    this.activeSubmits += 1;
    this.maxActiveSubmits = Math.max(this.maxActiveSubmits, this.activeSubmits);
    try {
      if (this.submitBarrier) await this.submitBarrier;
      if (this.submitError) throw this.submitError;
      return TX;
    } finally {
      this.activeSubmits -= 1;
    }
  }
  async getTransactionStatus() {
    this.rpcCalls += 1;
    return this.status === "pending" ? { status: "pending" as const } : { status: this.status, blockNumber: this.blockNumber };
  }
}

async function grantRaw(overrides: Partial<RawRequest["message"]> = {}, signer = USER, domainOverrides: Partial<RawRequest["domain"]> = {}): Promise<RawRequest> {
  const domain = { name: "NadieConsentRegistry", version: "1", chainId: 133, verifyingContract: CONTRACT, ...domainOverrides };
  const message = {
    consentId: `0x${"1".repeat(64)}`,
    user: USER.address,
    professional: PROFESSIONAL,
    packageHash: `0x${"2".repeat(64)}`,
    scope: `0x${"3".repeat(64)}`,
    expiresAt: String(NOW + 3600),
    nonce: "0",
    deadline: String(NOW + 60),
    ...overrides,
  };
  const signature = await signer.signTypedData({
    domain: { ...domain, verifyingContract: domain.verifyingContract as `0x${string}` },
    types: GRANT_TYPES,
    primaryType: "Grant",
    message: {
      ...message,
      consentId: message.consentId as `0x${string}`,
      packageHash: message.packageHash as `0x${string}`,
      scope: message.scope as `0x${string}`,
      expiresAt: Number(message.expiresAt),
      nonce: BigInt(message.nonce),
      deadline: BigInt(message.deadline),
    },
  });
  return { domain, message, signature };
}

async function revokeRaw(overrides: Partial<RawRequest["message"]> = {}, signer = USER): Promise<RawRequest> {
  const domain = { name: "NadieConsentRegistry", version: "1", chainId: 133, verifyingContract: CONTRACT };
  const message = {
    consentId: `0x${"1".repeat(64)}`,
    user: USER.address,
    nonce: "0",
    deadline: String(NOW + 60),
    ...overrides,
  };
  const signature = await signer.signTypedData({
    domain,
    types: REVOKE_TYPES,
    primaryType: "Revoke",
    message: { ...message, consentId: message.consentId as `0x${string}`, nonce: BigInt(message.nonce), deadline: BigInt(message.deadline) },
  });
  return { domain, message, signature };
}

function setup(chain = new FakeChain(), overrides: { rate?: number; maxInFlight?: number; capacity?: number } = {}) {
  const service = new RelayService({
    chain,
    signatures: createViemSignatureRecovery(),
    idempotency: new MemoryIdempotencyStore(overrides.capacity ?? 100),
    config: { chainId: 133, consentRegistryAddress: CONTRACT, maxGas: 500_000n, minBalanceWei: 10n, idempotencyTtlSeconds: 3600 },
    now: () => NOW,
  });
  const app = createRelayerApp({
    service,
    config: { allowedOrigin: "http://localhost:5173", maxRequestBytes: 8192, rateLimitPerMinute: overrides.rate ?? 60, maxInFlight: overrides.maxInFlight ?? 8 },
    now: () => NOW,
  });
  return { app, chain, service };
}

async function post(app: ReturnType<typeof createRelayerApp>, path: string, body: RawRequest, key = "valid_key_123456") {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body),
  });
}

describe("transaction relayer", () => {
  it("relays exact grant and revoke calls", async () => {
    const first = setup();
    expect((await post(first.app, "/v1/transactions/grants", await grantRaw())).status).toBe(202);
    expect(first.chain.preparedKinds).toEqual(["grant"]);
    expect(first.chain.preparedRequests[0]?.message).toMatchObject({ nonce: 0n, expiresAt: BigInt(NOW + 3600) });
    const second = setup();
    expect((await post(second.app, "/v1/transactions/revocations", await revokeRaw())).status).toBe(202);
    expect(second.chain.preparedKinds).toEqual(["revoke"]);
  });

  it.each([
    ["wrong chain", { chainId: 134 }, 400],
    ["wrong contract", { verifyingContract: `0x${"4".repeat(40)}` }, 422],
  ])("rejects %s domain before RPC", async (_name, domain, expectedStatus) => {
    const { app, chain } = setup();
    const response = await post(app, "/v1/transactions/grants", await grantRaw({}, USER, domain));
    expect(response.status).toBe(expectedStatus);
    expect(chain.rpcCalls).toBe(0);
  });

  it("rejects a different signer before RPC", async () => {
    const { app, chain } = setup();
    const response = await post(app, "/v1/transactions/grants", await grantRaw({}, OTHER));
    expect(response.status).toBe(422);
    expect(chain.rpcCalls).toBe(0);
  });

  it("rejects a signature made for another domain while the request claims the allowlisted domain", async () => {
    const { app, chain } = setup();
    const body = await grantRaw({}, USER, { chainId: 134 });
    body.domain.chainId = 133;
    const response = await post(app, "/v1/transactions/grants", body);
    expect(response.status).toBe(422);
    expect(chain.rpcCalls).toBe(0);
  });

  it.each([
    ["short", "0x12"],
    ["bad v", `0x${"1".repeat(128)}00`],
    ["high s", `0x${"1".repeat(64)}${"f".repeat(64)}1b`],
  ])("rejects %s signature without RPC", async (_name, signature) => {
    const { app, chain } = setup();
    const body = await grantRaw();
    body.signature = signature;
    expect((await post(app, "/v1/transactions/grants", body)).status).toBe(400);
    expect(chain.rpcCalls).toBe(0);
  });

  it("rejects wrong shared nonce and replay", async () => {
    const { app, chain } = setup();
    chain.nonce = 1n;
    const response = await post(app, "/v1/transactions/grants", await grantRaw());
    expect(response.status).toBe(422);
    expect(chain.submits).toBe(0);
  });

  it("accepts deadline equal to now and rejects expired deadline", async () => {
    const equal = setup();
    expect((await post(equal.app, "/v1/transactions/grants", await grantRaw({ deadline: String(NOW) }))).status).toBe(202);
    const expired = setup();
    expect((await post(expired.app, "/v1/transactions/grants", await grantRaw({ deadline: String(NOW - 1) }))).status).toBe(422);
  });

  it("rejects non-future expiry and integer range/canonical errors", async () => {
    const one = setup();
    expect((await post(one.app, "/v1/transactions/grants", await grantRaw({ expiresAt: String(NOW) }))).status).toBe(422);
    const two = setup();
    const malformed = await grantRaw();
    malformed.message.nonce = "00";
    expect((await post(two.app, "/v1/transactions/grants", malformed)).status).toBe(400);
    const three = setup();
    const oversized = await grantRaw();
    oversized.message.expiresAt = String(1n << 40n);
    expect((await post(three.app, "/v1/transactions/grants", oversized)).status).toBe(400);
  });

  it("enforces strict JSON, content type, idempotency key, and body size", async () => {
    const { app } = setup();
    const body = await grantRaw();
    expect((await app.request("/v1/transactions/grants", { method: "POST", body: JSON.stringify(body) })).status).toBe(400);
    const extra = { ...body, extra: true };
    expect((await app.request("/v1/transactions/grants", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "valid_key_123456" }, body: JSON.stringify(extra) })).status).toBe(400);
    const oversized = "x".repeat(9000);
    expect((await app.request("/v1/transactions/grants", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "valid_key_123456" }, body: oversized })).status).toBe(413);
  });

  it("fails closed on wrong RPC chain", async () => {
    const chain = new FakeChain(); chain.chainId = 1;
    expect((await post(setup(chain).app, "/v1/transactions/grants", await grantRaw())).status).toBe(503);
    expect(chain.submits).toBe(0);
  });

  it("does not send when simulation rejects, gas is excessive, or balance is insufficient", async () => {
    const simulation = new FakeChain(); simulation.simulationError = new SimulationRejectedError();
    expect((await post(setup(simulation).app, "/v1/transactions/grants", await grantRaw())).status).toBe(422);
    const gas = new FakeChain(); gas.gas = 500_001n;
    expect((await post(setup(gas).app, "/v1/transactions/grants", await grantRaw())).status).toBe(422);
    const balance = new FakeChain(); balance.balance = 1_009n;
    expect((await post(setup(balance).app, "/v1/transactions/grants", await grantRaw())).status).toBe(422);
    expect(simulation.submits + gas.submits + balance.submits).toBe(0);
  });

  it("maps RPC failures to unavailable", async () => {
    const chain = new FakeChain(); chain.simulationError = new ChainUnavailableError();
    expect((await post(setup(chain).app, "/v1/transactions/grants", await grantRaw())).status).toBe(503);
  });

  it("is idempotent and conflicts on a reused key with another payload", async () => {
    const { app, chain } = setup();
    const body = await grantRaw();
    const first = await post(app, "/v1/transactions/grants", body);
    const second = await post(app, "/v1/transactions/grants", body);
    expect(await second.json()).toEqual(await first.json());
    expect(chain.submits).toBe(1);
    const otherBody = await grantRaw({ consentId: `0x${"9".repeat(64)}` });
    expect((await post(app, "/v1/transactions/grants", otherBody)).status).toBe(409);
  });

  it("coalesces concurrent identical signatures across different keys", async () => {
    let release!: () => void;
    const chain = new FakeChain(); chain.submitBarrier = new Promise<void>((resolve) => { release = resolve; });
    const { app } = setup(chain);
    const body = await grantRaw();
    const first = post(app, "/v1/transactions/grants", body, "first_key_1234567");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = post(app, "/v1/transactions/grants", body, "second_key_123456");
    release();
    expect((await first).status).toBe(202);
    expect((await second).status).toBe(202);
    expect(chain.submits).toBe(1);
  });

  it("blocks distinct requests sharing user and nonce", async () => {
    let release!: () => void;
    const chain = new FakeChain(); chain.submitBarrier = new Promise<void>((resolve) => { release = resolve; });
    const { app } = setup(chain);
    const first = post(app, "/v1/transactions/grants", await grantRaw(), "first_key_1234567");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await post(app, "/v1/transactions/revocations", await revokeRaw(), "second_key_123456");
    expect(second.status).toBe(422);
    release();
    expect((await first).status).toBe(202);
  });

  it("serializes submits from different users", async () => {
    const chain = new FakeChain();
    let releases = 0;
    chain.submitBarrier = new Promise<void>((resolve) => setTimeout(() => { releases += 1; resolve(); }, 10));
    const { app } = setup(chain);
    const first = post(app, "/v1/transactions/grants", await grantRaw(), "first_key_1234567");
    const secondBody = await grantRaw({ user: OTHER.address, consentId: `0x${"8".repeat(64)}` }, OTHER);
    const second = post(app, "/v1/transactions/grants", secondBody, "second_key_123456");
    await Promise.all([first, second]);
    expect(releases).toBe(1);
    expect(chain.maxActiveSubmits).toBe(1);
  });

  it("allows retry before submit but never retries ambiguous submit", async () => {
    const retryChain = new FakeChain(); retryChain.simulationError = new SimulationRejectedError();
    const retry = setup(retryChain); const body = await grantRaw();
    expect((await post(retry.app, "/v1/transactions/grants", body)).status).toBe(422);
    retryChain.simulationError = undefined;
    expect((await post(retry.app, "/v1/transactions/grants", body)).status).toBe(202);
    const ambiguousChain = new FakeChain(); ambiguousChain.submitError = new Error("uncertain");
    const ambiguous = setup(ambiguousChain);
    expect((await post(ambiguous.app, "/v1/transactions/grants", body)).status).toBe(502);
    ambiguousChain.submitError = undefined;
    expect((await post(ambiguous.app, "/v1/transactions/grants", body)).status).toBe(502);
    expect(ambiguousChain.submits).toBe(1);
  });

  it.each(["pending", "confirmed", "reverted"] as const)("reports only known %s receipts", async (status) => {
    const { app, chain } = setup(); chain.status = status;
    await post(app, "/v1/transactions/grants", await grantRaw());
    const response = await app.request(`/v1/transactions/${TX}`);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe(status);
    if (status !== "pending") expect(json.blockNumber).toBe("55");
    expect((await app.request(`/v1/transactions/0x${"b".repeat(64)}`)).status).toBe(404);
  });

  it("enforces rate limit and CORS and exposes minimal health", async () => {
    const { app } = setup(new FakeChain(), { rate: 1 });
    expect(await (await app.request("/healthz")).json()).toEqual({ status: "ok" });
    await post(app, "/v1/transactions/grants", await grantRaw(), "first_key_1234567");
    expect((await post(app, "/v1/transactions/grants", await grantRaw(), "second_key_123456")).status).toBe(429);
    expect((await app.request("/healthz", { headers: { origin: "https://evil.example" } })).status).toBe(400);
    const allowed = await app.request("/healthz", { headers: { origin: "http://localhost:5173" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  it("bounds concurrent HTTP work", async () => {
    let release!: () => void;
    const chain = new FakeChain(); chain.submitBarrier = new Promise<void>((resolve) => { release = resolve; });
    const { app } = setup(chain, { maxInFlight: 1 });
    const first = post(app, "/v1/transactions/grants", await grantRaw(), "first_key_1234567");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await post(app, "/v1/transactions/grants", await grantRaw(), "second_key_123456");
    expect(second.status).toBe(429);
    release();
    expect((await first).status).toBe(202);
  });

  it("rejects invalid config and zero key", () => {
    const base = {
      HASHKEY_RPC_URL: "https://testnet.hsk.xyz",
      HASHKEY_CHAIN_ID: "133",
      CONSENT_REGISTRY_ADDRESS: CONTRACT,
      RELAYER_PRIVATE_KEY: USER_KEY,
    };
    expect(parseRelayerEnvironment({ ...base }).RELAYER_PORT).toBe(8788);
    expect(() => parseRelayerEnvironment({ ...base, HASHKEY_CHAIN_ID: "1" })).toThrow();
    expect(() => parseRelayerEnvironment({ ...base, RELAYER_PRIVATE_KEY: `0x${"0".repeat(64)}` })).toThrow();
  });

  it("fails startup for absent bytecode, wrong chain, and low balance", async () => {
    const code = new FakeChain(); code.code = "0x";
    await expect(validateRelayerStartup(code, 10n)).rejects.toThrow();
    const chain = new FakeChain(); chain.chainId = 1;
    await expect(validateRelayerStartup(chain, 10n)).rejects.toThrow();
    const balance = new FakeChain(); balance.balance = 9n;
    await expect(validateRelayerStartup(balance, 10n)).rejects.toThrow();
  });
});
