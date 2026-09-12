import type { GrantRelayRequest, PreparedTransaction, RelayRequest, RevokeRelayRequest, TransactionStatus } from "./types";

export interface ChainRelayerPort {
  getChainId(): Promise<number>;
  getCode(): Promise<`0x${string}`>;
  getRelayerBalance(): Promise<bigint>;
  getUserNonce(user: `0x${string}`): Promise<bigint>;
  simulateGrant(request: GrantRelayRequest): Promise<PreparedTransaction>;
  simulateRevoke(request: RevokeRelayRequest): Promise<PreparedTransaction>;
  submit(prepared: PreparedTransaction): Promise<`0x${string}`>;
  getTransactionStatus(hash: `0x${string}`): Promise<TransactionStatus>;
}

export interface SignatureRecoveryPort {
  recover(request: RelayRequest): Promise<`0x${string}`>;
}

export interface IdempotencyRecord {
  keyDigest: string;
  fingerprint: string;
  state: "processing" | "submitted" | "ambiguous";
  expiresAt: number;
  transactionHash?: `0x${string}`;
}

export interface IdempotencyStore {
  get(keyDigest: string, now: number): IdempotencyRecord | undefined;
  getByFingerprint(fingerprint: string, now: number): IdempotencyRecord | undefined;
  put(record: IdempotencyRecord, now: number): boolean;
  update(record: IdempotencyRecord): void;
  delete(keyDigest: string): void;
  hasTransaction(hash: `0x${string}`, now: number): boolean;
}

/** Bounded in-memory MVP adapter. State and idempotency are lost on restart. */
export class MemoryIdempotencyStore implements IdempotencyStore {
  readonly #records = new Map<string, IdempotencyRecord>();

  constructor(private readonly capacity: number) {}

  get(keyDigest: string, now: number): IdempotencyRecord | undefined {
    this.#sweep(now);
    return this.#records.get(keyDigest);
  }

  getByFingerprint(fingerprint: string, now: number): IdempotencyRecord | undefined {
    this.#sweep(now);
    for (const record of this.#records.values()) {
      if (record.fingerprint === fingerprint) return record;
    }
    return undefined;
  }

  put(record: IdempotencyRecord, now: number): boolean {
    this.#sweep(now);
    if (this.#records.has(record.keyDigest) || this.#records.size >= this.capacity) return false;
    this.#records.set(record.keyDigest, record);
    return true;
  }

  update(record: IdempotencyRecord): void {
    if (this.#records.has(record.keyDigest)) this.#records.set(record.keyDigest, record);
  }

  delete(keyDigest: string): void {
    this.#records.delete(keyDigest);
  }

  hasTransaction(hash: `0x${string}`, now: number): boolean {
    this.#sweep(now);
    for (const record of this.#records.values()) {
      if (record.transactionHash === hash) return true;
    }
    return false;
  }

  #sweep(now: number): void {
    for (const [key, record] of this.#records) {
      if (record.expiresAt <= now) this.#records.delete(key);
    }
  }
}
