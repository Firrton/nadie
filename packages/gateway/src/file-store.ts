/**
 * Adapter filesystem de PackageStore. Local y de instancia única: apto solo
 * para el MVP (documentado en README). Sin plaintext: solo bytes cifrados
 * canónicos y metadatos mínimos.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { PackageStore, StoredPackageRecord } from "./ports";

const HASH_RE = /^0x[0-9a-f]{64}$/;

/**
 * Escritura segura: filename derivado exclusivamente del packageHash ya
 * validado (regex bytes32 canónico), sin traversal posible. Escritura
 * temporal + rename atómico.
 */
export class FilePackageStore implements PackageStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = resolve(dir);
  }

  /** Crea el directorio con permisos restrictivos (0o700). */
  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
  }

  private recordPath(packageHash: string): string {
    if (!HASH_RE.test(packageHash)) {
      throw new Error("invalid package hash");
    }
    return join(this.dir, `${packageHash.slice(2)}.json.bin`);
  }

  private metaPath(packageHash: string): string {
    if (!HASH_RE.test(packageHash)) {
      throw new Error("invalid package hash");
    }
    return join(this.dir, `${packageHash.slice(2)}.meta.json`);
  }

  async put(record: StoredPackageRecord): Promise<void> {
    if (!HASH_RE.test(record.packageHash)) {
      throw new Error("invalid package hash");
    }
    // Serialización propia del registro: hash | storedUntil | digest | bytes
    const meta = JSON.stringify({
      packageHash: record.packageHash,
      storedUntil: record.storedUntil,
      deletionTokenDigest: record.deletionTokenDigest,
    });
    const blob = Buffer.from(record.bytes);
    const tmpBlob = this.recordPath(record.packageHash) + ".tmp";
    const tmpMeta = this.metaPath(record.packageHash) + ".tmp";
    await writeFile(tmpBlob, blob, { mode: 0o600 });
    await writeFile(tmpMeta, meta, { mode: 0o600 });
    await rename(tmpBlob, this.recordPath(record.packageHash));
    await rename(tmpMeta, this.metaPath(record.packageHash));
  }

  async get(packageHash: string): Promise<StoredPackageRecord | undefined> {
    if (!HASH_RE.test(packageHash)) {
      return undefined;
    }
    let blob: Buffer;
    let metaText: string;
    try {
      blob = await readFile(this.recordPath(packageHash));
      metaText = await readFile(this.metaPath(packageHash), "utf8");
    } catch {
      return undefined;
    }
    let meta: { packageHash: string; storedUntil: number; deletionTokenDigest: string };
    try {
      meta = JSON.parse(metaText) as typeof meta;
    } catch {
      return undefined;
    }
    if (
      typeof meta.packageHash !== "string" ||
      typeof meta.storedUntil !== "number" ||
      typeof meta.deletionTokenDigest !== "string" ||
      meta.packageHash !== packageHash
    ) {
      return undefined;
    }
    return {
      packageHash,
      bytes: new Uint8Array(blob),
      storedUntil: meta.storedUntil,
      deletionTokenDigest: meta.deletionTokenDigest,
    };
  }

  async delete(packageHash: string): Promise<boolean> {
    if (!HASH_RE.test(packageHash)) {
      return false;
    }
    try {
      await rm(this.recordPath(packageHash));
      await rm(this.metaPath(packageHash));
      return true;
    } catch {
      return false;
    }
  }

  async sweepExpired(nowSeconds: number): Promise<number> {
    let removed = 0;
    let entries: string[];
    try {
      entries = await readdir(this.dir);
    } catch {
      return 0;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".meta.json")) continue;
      const metaPath = join(this.dir, entry);
      try {
        const metaText = await readFile(metaPath, "utf8");
        const meta = JSON.parse(metaText) as { storedUntil: number };
        if (typeof meta.storedUntil === "number" && meta.storedUntil <= nowSeconds) {
          await rm(metaPath);
          await rm(join(this.dir, entry.replace(/\.meta\.json$/, ".json.bin")));
          removed += 1;
        }
      } catch {
        // registro ilegible: lo dejamos; la limpieza manual puede purgarlo
      }
    }
    return removed;
  }
}

/** SHA-256 hex de un token; usado por el gateway y por los tests. */
export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}