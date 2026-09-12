/**
 * Puertos del gateway de paquetes cifrados (Goal 7).
 *
 * Solo interfaces: sin adapters concretos ni instancias por defecto.
 */

/** Registro interno de un paquete almacenado. Nunca contiene plaintext. */
export interface StoredPackageRecord {
  /** packageHash canónico (0x + 64 hex minúsculas). */
  packageHash: string;
  /** Bytes cifrados canónicos del envelope. */
  bytes: Uint8Array;
  /** Timestamp Unix (segundos) hasta el que se retiene. */
  storedUntil: number;
  /** SHA-256 del deletionToken, hex. El token claro jamás se guarda. */
  deletionTokenDigest: string;
}

/**
 * Puerto de persistencia de paquetes. El adapter filesystem es local y
 * apto solo para el MVP: no multi-instancia ni serverless.
 */
export interface PackageStore {
  put(record: StoredPackageRecord): Promise<void>;
  get(packageHash: string): Promise<StoredPackageRecord | undefined>;
  delete(packageHash: string): Promise<boolean>;
  /** Elimina los registros vencidos. Devuelve cuántos borró. */
  sweepExpired(nowSeconds: number): Promise<number>;
}

/** Snapshot del consentimiento leído on-chain en un bloque exacto. */
export interface ConsentSnapshot {
  exists: boolean;
  /** professional on-chain (0x + 40 hex minúsculas). */
  professional: string;
  /** packageHash on-chain (0x + 64 hex minúsculas). */
  packageHash: string;
  firstOpenedAt: number;
  /** isValid(consentId) en el mismo bloque. */
  valid: boolean;
}

export interface BlockRef {
  blockNumber: bigint;
}

/**
 * Puerto de autorización on-chain. La implementación (viem) lee TODO en un
 * único bloque observado: consents() e isValid() no pueden separarse en
 * bloques distintos.
 */
export interface ChainAuthorizationPort {
  /** Bloque más reciente observable. Falla cerrado ante error RPC. */
  getLatestBlock(): Promise<BlockRef>;
  /** Snapshot del consentimiento en el bloque indicado. */
  getConsentSnapshot(consentId: string, at: BlockRef): Promise<ConsentSnapshot>;
}