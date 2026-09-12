import type { ChainRelayerPort, IdempotencyRecord, IdempotencyStore, SignatureRecoveryPort } from "./ports";
import { fingerprintRequest, isCanonicalEoaSignature, sha256 } from "./security";
import type { PreparedTransaction, RelayRequest } from "./types";

export type RelayerErrorCode =
  | "INVALID_REQUEST"
  | "CONFLICT"
  | "NOT_RELAYABLE"
  | "SUBMISSION_FAILED"
  | "UNAVAILABLE";

export class RelayerError extends Error {
  constructor(
    readonly code: RelayerErrorCode,
    readonly httpStatus: 400 | 409 | 422 | 502 | 503,
  ) {
    super(code);
    this.name = "RelayerError";
  }
}

export class ChainUnavailableError extends Error {}
export class SimulationRejectedError extends Error {}

export interface RelayerConfig {
  chainId: 133;
  consentRegistryAddress: `0x${string}`;
  maxGas: bigint;
  minBalanceWei: bigint;
  idempotencyTtlSeconds: number;
}

export interface RelayServiceDeps {
  chain: ChainRelayerPort;
  signatures: SignatureRecoveryPort;
  idempotency: IdempotencyStore;
  config: RelayerConfig;
  now?: () => number;
}

interface RelayResult {
  transactionHash: `0x${string}`;
}

export class RelayService {
  readonly #chain: ChainRelayerPort;
  readonly #signatures: SignatureRecoveryPort;
  readonly #idempotency: IdempotencyStore;
  readonly #config: RelayerConfig;
  readonly #now: () => number;
  readonly #inflight = new Map<string, Promise<RelayResult>>();
  readonly #fingerprints = new Map<string, Promise<RelayResult>>();
  readonly #nonceReservations = new Map<string, { fingerprint: string; expiresAt: number }>();
  #submitTail: Promise<void> = Promise.resolve();

  constructor(deps: RelayServiceDeps) {
    this.#chain = deps.chain;
    this.#signatures = deps.signatures;
    this.#idempotency = deps.idempotency;
    this.#config = deps.config;
    this.#now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  }

  async relay(request: RelayRequest, idempotencyKey: string): Promise<RelayResult> {
    this.#validateLocal(request);
    let recovered: `0x${string}`;
    try {
      recovered = await this.#signatures.recover(request);
    } catch {
      throw new RelayerError("NOT_RELAYABLE", 422);
    }
    if (recovered.toLowerCase() !== request.message.user.toLowerCase()) {
      throw new RelayerError("NOT_RELAYABLE", 422);
    }

    const now = this.#now();
    const keyDigest = sha256(idempotencyKey);
    const fingerprint = fingerprintRequest(request);
    const previous = this.#idempotency.get(keyDigest, now);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new RelayerError("CONFLICT", 409);
      if (previous.state === "submitted" && previous.transactionHash) {
        return { transactionHash: previous.transactionHash };
      }
      if (previous.state === "ambiguous") throw new RelayerError("SUBMISSION_FAILED", 502);
      const active = this.#inflight.get(keyDigest) ?? this.#fingerprints.get(fingerprint);
      if (active) return active;
      // A processing entry without an in-process promise can only be stale after restart.
      throw new RelayerError("SUBMISSION_FAILED", 502);
    }

    const record: IdempotencyRecord = {
      keyDigest,
      fingerprint,
      state: "processing",
      expiresAt: now + this.#config.idempotencyTtlSeconds,
    };

    const matching = this.#idempotency.getByFingerprint(fingerprint, now);
    if (matching?.state === "submitted" && matching.transactionHash) {
      const submitted = { ...record, state: "submitted" as const, transactionHash: matching.transactionHash };
      if (!this.#idempotency.put(submitted, now)) throw new RelayerError("UNAVAILABLE", 503);
      return { transactionHash: matching.transactionHash };
    }
    if (matching?.state === "ambiguous") {
      if (!this.#idempotency.put({ ...record, state: "ambiguous" }, now)) {
        throw new RelayerError("UNAVAILABLE", 503);
      }
      throw new RelayerError("SUBMISSION_FAILED", 502);
    }
    if (!this.#idempotency.put(record, now)) throw new RelayerError("UNAVAILABLE", 503);

    const duplicate = matching?.state === "processing" ? this.#fingerprints.get(fingerprint) : undefined;
    if (matching?.state === "processing" && !duplicate) {
      this.#idempotency.update({ ...matching, state: "ambiguous" });
      this.#idempotency.update({ ...record, state: "ambiguous" });
      throw new RelayerError("SUBMISSION_FAILED", 502);
    }
    if (duplicate) {
      this.#inflight.set(keyDigest, duplicate);
      try {
        const result = await duplicate;
        this.#markSubmitted(record, result.transactionHash);
        return result;
      } catch (error) {
        const source = this.#idempotency.getByFingerprint(fingerprint, this.#now());
        if (source?.state === "ambiguous") {
          this.#idempotency.update({ ...record, state: "ambiguous" });
        } else {
          this.#idempotency.delete(keyDigest);
        }
        throw error;
      } finally {
        this.#inflight.delete(keyDigest);
      }
    }

    const execution = this.#execute(request, record);
    this.#inflight.set(keyDigest, execution);
    this.#fingerprints.set(fingerprint, execution);
    try {
      return await execution;
    } finally {
      this.#inflight.delete(keyDigest);
      this.#fingerprints.delete(fingerprint);
    }
  }

  knowsTransaction(hash: `0x${string}`): boolean {
    return this.#idempotency.hasTransaction(hash, this.#now());
  }

  async transactionStatus(hash: `0x${string}`) {
    if (!this.knowsTransaction(hash)) return undefined;
    try {
      return await this.#chain.getTransactionStatus(hash);
    } catch {
      throw new RelayerError("UNAVAILABLE", 503);
    }
  }

  #validateLocal(request: RelayRequest): void {
    if (request.domain.chainId !== this.#config.chainId) throw new RelayerError("NOT_RELAYABLE", 422);
    if (request.domain.verifyingContract.toLowerCase() !== this.#config.consentRegistryAddress.toLowerCase()) {
      throw new RelayerError("NOT_RELAYABLE", 422);
    }
    if (!isCanonicalEoaSignature(request.signature)) throw new RelayerError("INVALID_REQUEST", 400);
    const now = BigInt(this.#now());
    if (request.message.deadline < now) throw new RelayerError("NOT_RELAYABLE", 422);
    if (request.kind === "grant" && request.message.expiresAt <= now) throw new RelayerError("NOT_RELAYABLE", 422);
  }

  async #execute(request: RelayRequest, record: IdempotencyRecord): Promise<RelayResult> {
    const nonceKey = `${request.message.user.toLowerCase()}:${request.message.nonce.toString()}`;
    this.#sweepNonceReservations();
    const reserved = this.#nonceReservations.get(nonceKey);
    if (reserved && reserved.fingerprint !== record.fingerprint) {
      this.#idempotency.delete(record.keyDigest);
      throw new RelayerError("NOT_RELAYABLE", 422);
    }
    this.#nonceReservations.set(nonceKey, { fingerprint: record.fingerprint, expiresAt: record.expiresAt });

    let submitStarted = false;
    try {
      let chainId: number;
      let nonce: bigint;
      try {
        chainId = await this.#chain.getChainId();
        nonce = await this.#chain.getUserNonce(request.message.user);
      } catch {
        throw new RelayerError("UNAVAILABLE", 503);
      }
      if (chainId !== this.#config.chainId) throw new RelayerError("UNAVAILABLE", 503);
      if (nonce !== request.message.nonce) throw new RelayerError("NOT_RELAYABLE", 422);

      const transactionHash = await this.#serializeSubmit(async () => {
        // Fee quote, gas estimate, and balance are obtained only after this
        // request owns the hot-wallet submit gate. The adapter fixes them on
        // the exact transaction request passed to submit().
        let prepared: PreparedTransaction;
        try {
          prepared = request.kind === "grant"
            ? await this.#chain.simulateGrant(request)
            : await this.#chain.simulateRevoke(request);
        } catch (error) {
          if (error instanceof ChainUnavailableError) throw new RelayerError("UNAVAILABLE", 503);
          throw new RelayerError("NOT_RELAYABLE", 422);
        }
        if (prepared.gas > this.#config.maxGas) throw new RelayerError("NOT_RELAYABLE", 422);
        if (prepared.maxCostWei !== prepared.gas * prepared.feePerGas) {
          throw new RelayerError("UNAVAILABLE", 503);
        }

        let balance: bigint;
        try {
          balance = await this.#chain.getRelayerBalance();
        } catch {
          throw new RelayerError("UNAVAILABLE", 503);
        }
        if (balance < prepared.maxCostWei + this.#config.minBalanceWei) {
          throw new RelayerError("NOT_RELAYABLE", 422);
        }

        submitStarted = true;
        return this.#chain.submit(prepared);
      });
      this.#markSubmitted(record, transactionHash);
      return { transactionHash };
    } catch (error) {
      if (submitStarted) {
        this.#idempotency.update({ ...record, state: "ambiguous" });
        throw new RelayerError("SUBMISSION_FAILED", 502);
      }
      this.#idempotency.delete(record.keyDigest);
      this.#nonceReservations.delete(nonceKey);
      if (error instanceof RelayerError) throw error;
      throw new RelayerError("UNAVAILABLE", 503);
    }
  }

  #markSubmitted(record: IdempotencyRecord, transactionHash: `0x${string}`): void {
    this.#idempotency.update({ ...record, state: "submitted", transactionHash });
  }

  async #serializeSubmit<T>(submit: () => Promise<T>): Promise<T> {
    const before = this.#submitTail;
    let release!: () => void;
    this.#submitTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await before;
    try {
      return await submit();
    } finally {
      release();
    }
  }

  #sweepNonceReservations(): void {
    const now = this.#now();
    for (const [key, value] of this.#nonceReservations) {
      if (value.expiresAt <= now) this.#nonceReservations.delete(key);
    }
  }
}
