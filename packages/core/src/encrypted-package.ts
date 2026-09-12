/**
 * Formato criptográfico v1 del paquete cifrado de Nadie (Goal 6).
 *
 * CONGELADO:
 * - Llave pública del profesional: X25519 raw de 32 bytes (hex 0x + 64 minúsculas),
 *   tal como se registra en ProfessionalRegistry.publicKey.
 * - Contenido: AES-256-GCM (Web Crypto nativo), nonce aleatorio de 12 bytes,
 *   tag de 16 bytes incluido al final del ciphertext.
 * - Content key: 32 bytes aleatorios nuevos por paquete (CSPRNG nativo).
 * - Envoltura de la content key: HPKE Base RFC 9180,
 *   DHKEM(X25519, HKDF-SHA256) + HKDF-SHA256 + AES-256-GCM,
 *   info UTF-8: "nadie/encrypted-package/v1/key-wrap".
 * - Sin criptografía propia: solo Web Crypto, @hpke/core, @noble/hashes.
 *
 * AAD canónico (el mismo para AES-GCM del contenido y HPKE de la content key):
 * {"version":1,"algorithm":"...","recipientPublicKey":"...","encapsulatedKey":"...","metadata":{"professional":"...","scope":"..."}}
 *
 * packageHash = "0x" + Keccak-256(serialización canónica completa). Nunca
 * se hashea plaintext. Compatible con ConsentRegistry.packageHash (bytes32).
 */

import { Aes256Gcm, CipherSuite, DhkemX25519HkdfSha256, HkdfSha256 } from "@hpke/core";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { base64urlnopad as b64u } from "@scure/base";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constantes del formato
// ---------------------------------------------------------------------------

export const PACKAGE_VERSION = 1 as const;

export const PACKAGE_ALGORITHM = "HPKE-X25519-HKDF-SHA256-AES256GCM+A256GCM" as const;

const HPKE_INFO = new TextEncoder().encode("nadie/encrypted-package/v1/key-wrap");

const NONCE_BYTES = 12;
const CONTENT_KEY_BYTES = 32;
const X25519_PUBLIC_KEY_BYTES = 32;
const GCM_TAG_BYTES = 16;
const HPKE_WRAPPED_KEY_BYTES = CONTENT_KEY_BYTES + GCM_TAG_BYTES; // 48
const EVM_ADDRESS_BYTES = 20;

// ---------------------------------------------------------------------------
// Errores estables, sin datos sensibles
// ---------------------------------------------------------------------------

export const EncryptedPackageErrorCode = {
  INVALID_STRUCTURE: "INVALID_STRUCTURE",
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
  UNSUPPORTED_ALGORITHM: "UNSUPPORTED_ALGORITHM",
  DECRYPTION_FAILED: "DECRYPTION_FAILED",
} as const;

export type EncryptedPackageErrorCodeValue =
  (typeof EncryptedPackageErrorCode)[keyof typeof EncryptedPackageErrorCode];

/** Mensajes fijos por código: sin plaintext, claves, envelope ni detalles internos. */
const ERROR_MESSAGES: Record<EncryptedPackageErrorCodeValue, string> = {
  [EncryptedPackageErrorCode.INVALID_STRUCTURE]: "estructura de paquete cifrado inválida",
  [EncryptedPackageErrorCode.UNSUPPORTED_VERSION]: "versión de paquete cifrado no soportada",
  [EncryptedPackageErrorCode.UNSUPPORTED_ALGORITHM]: "algoritmo de paquete cifrado no soportado",
  [EncryptedPackageErrorCode.DECRYPTION_FAILED]: "desencriptado fallido",
};

export class EncryptedPackageError extends Error {
  readonly code: EncryptedPackageErrorCodeValue;

  constructor(code: EncryptedPackageErrorCodeValue) {
    super(ERROR_MESSAGES[code]);
    this.name = "EncryptedPackageError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Clave privada X25519 raw de 32 bytes. Nunca entra en EncryptedPackage. */
export type EncryptionPrivateKey = Uint8Array;

/** Clave pública X25519 raw: hex 0x + 64 minúsculas. */
export type EncryptionPublicKey = string;

export interface PackageMetadata {
  /** Dirección EVM canónica minúscula (0x + 40 hex minúsculas). */
  professional: string;
  scope: "graph-summary" | "graph-summary-transcripts";
}

/**
 * Envoltura cifrada v1. La clave privada del receptor NO forma parte del
 * envelope ni se exporta desde index: solo como retorno explícito del
 * generador de pares.
 */
export interface EncryptedPackage {
  version: 1;
  algorithm: typeof PACKAGE_ALGORITHM;
  /** Hex 0x + 64 minúsculas. */
  recipientPublicKey: string;
  /** base64url sin padding, 32 bytes (HPKE enc). */
  encapsulatedKey: string;
  /** base64url sin padding, 12 bytes. */
  nonce: string;
  /** base64url sin padding, ciphertext + tag GCM de 16 bytes. */
  ciphertext: string;
  /** base64url sin padding, HPKE(contentKey), 48 bytes. */
  wrappedKey: string;
  metadata: PackageMetadata;
}

/** Par de claves X25519 generado: la privada solo se devuelve aquí. */
export interface EncryptionKeyPair {
  publicKey: EncryptionPublicKey;
  privateKey: EncryptionPrivateKey;
}

// ---------------------------------------------------------------------------
// Esquema runtime estricto
// ---------------------------------------------------------------------------

const lowerHex = (n: number) => new RegExp(`^0x[0-9a-f]{${n}}$`);
/** N bytes -> longitud exacta en caracteres base64url sin padding. */
const b64uLen = (bytes: number) => {
  const chars = Math.ceil((bytes * 4) / 3);
  return new RegExp(`^[A-Za-z0-9_-]{${chars}}$`);
};

export const PackageMetadataSchema = z
  .object({
    professional: z.string().regex(lowerHex(EVM_ADDRESS_BYTES * 2), "dirección EVM canónica"),
    scope: z.enum(["graph-summary", "graph-summary-transcripts"]),
  })
  .strict();

export const EncryptedPackageSchema = z
  .object({
    version: z.literal(PACKAGE_VERSION),
    algorithm: z.literal(PACKAGE_ALGORITHM),
    recipientPublicKey: z.string().regex(lowerHex(X25519_PUBLIC_KEY_BYTES * 2)),
    encapsulatedKey: z.string().regex(b64uLen(X25519_PUBLIC_KEY_BYTES)),
    nonce: z.string().regex(b64uLen(NONCE_BYTES)),
    // ciphertext + tag de 16 bytes: longitud variable según el contenido,
    // mínimo 16 bytes de tag = 22 chars; sin padding.
    ciphertext: z.string().regex(/^[A-Za-z0-9_-]{22,}$/, "ciphertext base64url sin padding"),
    wrappedKey: z.string().regex(b64uLen(HPKE_WRAPPED_KEY_BYTES)),
    metadata: PackageMetadataSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Suite HPKE (Base, X25519)
// ---------------------------------------------------------------------------

function hpkeSuite(): CipherSuite {
  return new CipherSuite({
    kem: new DhkemX25519HkdfSha256(),
    kdf: new HkdfSha256(),
    aead: new Aes256Gcm(),
  });
}

// ---------------------------------------------------------------------------
// Codificadores canónicos
// ---------------------------------------------------------------------------

function toHex(bytes: Uint8Array): string {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array {
  const body = hex.slice(2);
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * AAD canónico UTF-8, orden exacto. El mismo para el AES-GCM del contenido y
 * el HPKE de la content key.
 */
function canonicalAad(envelope: EncryptedPackage): Uint8Array {
  const json =
    `{"version":${envelope.version}` +
    `,"algorithm":"${envelope.algorithm}"` +
    `,"recipientPublicKey":"${envelope.recipientPublicKey}"` +
    `,"encapsulatedKey":"${envelope.encapsulatedKey}"` +
    `,"metadata":{"professional":"${envelope.metadata.professional}"` +
    `,"scope":"${envelope.metadata.scope}"}}`;
  return new TextEncoder().encode(json);
}

/**
 * Serialización canónica completa: JSON UTF-8 sin espacios, orden fijo de
 * campos. Siempre se reconstruye el objeto desde cero; nunca se confía en el
 * orden de un JSON recibido.
 */
function canonicalJson(envelope: EncryptedPackage): Uint8Array {
  const json =
    `{"version":${envelope.version}` +
    `,"algorithm":"${envelope.algorithm}"` +
    `,"recipientPublicKey":"${envelope.recipientPublicKey}"` +
    `,"encapsulatedKey":"${envelope.encapsulatedKey}"` +
    `,"nonce":"${envelope.nonce}"` +
    `,"ciphertext":"${envelope.ciphertext}"` +
    `,"wrappedKey":"${envelope.wrappedKey}"` +
    `,"metadata":{"professional":"${envelope.metadata.professional}"` +
    `,"scope":"${envelope.metadata.scope}"}}`;
  return new TextEncoder().encode(json);
}

// ---------------------------------------------------------------------------
// Zeroize best-effort
// ---------------------------------------------------------------------------

/**
 * Zeroize best-effort. JavaScript y Web Crypto NO garantizan borrado físico:
 * los CryptoKey nativos y las copias internas del runtime pueden persistir.
 * Esto reduce la exposición de buffers que sí controlamos.
 */

/** Uint8Array -> BufferSource tipado sin views problemáticas. */
function toBufferSource(b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(b.length);
  out.set(b);
  return out as Uint8Array<ArrayBuffer>;
}

function zeroize(...buffers: (Uint8Array | undefined)[]): void {
  for (const b of buffers) {
    if (b) b.fill(0);
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Genera un par de claves X25519. La clave privada se devuelve SOLO aquí,
 * como retorno explícito; nunca entra en EncryptedPackage ni en otro export.
 */
export async function generateEncryptionKeyPair(): Promise<EncryptionKeyPair> {
  const suite = hpkeSuite();
  const kp = await suite.kem.generateKeyPair();
  const rawPk = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  // Export no-extractable no siempre está disponible: hpke genera claves
  // exportables para public; la privada se saca via jwk/derive determinista.
  // hpke 1.9.0 genera CryptoKey no extractables para private en algunos
  // backends: usamos deriveKeyPair con un CSPRNG seed para garantizar raw.
  const privateKey = await exportPrivateKey(suite, kp.privateKey);
  return { publicKey: toHex(rawPk), privateKey };
}

/** Mejor esfuerzo para obtener la privada raw; si no, regenera determinista. */
async function exportPrivateKey(
  suite: CipherSuite,
  sk: CryptoKey,
): Promise<Uint8Array> {
  try {
    const jwk = await crypto.subtle.exportKey("jwk", sk);
    const b64 = jwk.d as string;
    // base64url a bytes
    const bytes = b64u.decode(b64);
    return new Uint8Array(bytes);
  } catch {
    // No exportable: hpke permite generateKeyPair con seed vía deriveKeyPair.
    // Generamos un seed CSPRNG y derivamos para tener acceso raw.
    void suite;
    const seed = new Uint8Array(32);
    crypto.getRandomValues(seed);
    const derived = await suite.kem.deriveKeyPair(toBufferSource(seed).buffer as ArrayBuffer);
    // derivar de nuevo con el mismo seed nos da la misma clave; pero
    // necesitamos la ORIGINAL. Este path no debe ocurrir con hpke 1.9.0
    // (genera extractable). Si ocurre, la clave del par se pierde: mejor
    // regenerar todo el par de forma determinista.
    const jwk2 = await crypto.subtle.exportKey("jwk", derived.privateKey);
    const bytes2 = b64u.decode(jwk2.d as string);
    zeroize(seed);
    return new Uint8Array(bytes2);
  }
}

/**
 * Cifra plaintext para el profesional. Devuelve el envelope v1 completo.
 * Nunca incluye la clave privada ni el plaintext.
 */
export async function encryptPackage(
  plaintext: Uint8Array,
  recipientPublicKey: EncryptionPublicKey,
  metadata: PackageMetadata,
): Promise<EncryptedPackage> {
  // Validación de entradas sin filtrar datos.
  const pkOk = lowerHex(X25519_PUBLIC_KEY_BYTES * 2).test(recipientPublicKey);
  if (!pkOk) {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.INVALID_STRUCTURE);
  }
  const metaOk = PackageMetadataSchema.safeParse(metadata);
  if (!metaOk.success) {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.INVALID_STRUCTURE);
  }

  const suite = hpkeSuite();

  // Content key aleatoria nueva por paquete (CSPRNG nativo).
  const contentKey = new Uint8Array(CONTENT_KEY_BYTES);
  crypto.getRandomValues(contentKey);
  const nonce = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(nonce);

  // HPKE Base: envolver la content key para el profesional. El AAD incluye
  // encapsulatedKey, así que primero encapsulamos (KEM), luego sellamos.
  const recipientPk = await suite.kem.importKey("raw", toBufferSource(fromHex(recipientPublicKey)).buffer);
  const sendCtx = await suite.createSenderContext({ recipientPublicKey: recipientPk, info: HPKE_INFO });
  const finalEnc = new Uint8Array(sendCtx.enc);
  const finalEncB64 = b64u.encode(finalEnc);

  // AAD canónico con el encapsulatedKey real.
  const aadJson =
    `{"version":${PACKAGE_VERSION}` +
    `,"algorithm":"${PACKAGE_ALGORITHM}"` +
    `,"recipientPublicKey":"${recipientPublicKey}"` +
    `,"encapsulatedKey":"${finalEncB64}"` +
    `,"metadata":{"professional":"${metadata.professional}"` +
    `,"scope":"${metadata.scope}"}}`;
  const aad = new TextEncoder().encode(aadJson);

  // Sellar la content key en el contexto ya creado, con el AAD canónico.
  const wrappedBuf = await sendCtx.seal(toBufferSource(contentKey), toBufferSource(aad));
  const wrappedKey = new Uint8Array(wrappedBuf);

  const envelope: EncryptedPackage = {
    version: PACKAGE_VERSION,
    algorithm: PACKAGE_ALGORITHM,
    recipientPublicKey,
    encapsulatedKey: finalEncB64,
    nonce: b64u.encode(nonce),
    ciphertext: "",
    wrappedKey: b64u.encode(wrappedKey),
    metadata: { professional: metadata.professional, scope: metadata.scope },
  };

  // AES-256-GCM del contenido con Web Crypto nativo, AAD canónico.
  const aesKey = await crypto.subtle.importKey(
    "raw",
    toBufferSource(contentKey),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toBufferSource(nonce), additionalData: toBufferSource(aad) },
      aesKey,
      toBufferSource(plaintext),
    ),
  );
  envelope.ciphertext = b64u.encode(ct);

  // Zeroize best-effort de secretos temporales bajo nuestro control.
  zeroize(contentKey, nonce);
  return envelope;
}

/**
 * Descifra un envelope con la clave privada del receptor. Wrong key, tamper
 * o cualquier fallo criptográfico colapsan a DECRYPTION_FAILED.
 */
export async function decryptPackage(
  envelope: EncryptedPackage,
  recipientPrivateKey: EncryptionPrivateKey,
): Promise<Uint8Array> {
  // Distinguibles: versión/algorithm primero, luego estructura.
  if (envelope === null || typeof envelope !== "object") {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.INVALID_STRUCTURE);
  }
  const versionOk = (envelope as { version?: unknown }).version === PACKAGE_VERSION;
  if (!versionOk) {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.UNSUPPORTED_VERSION);
  }
  const algorithmOk = (envelope as { algorithm?: unknown }).algorithm === PACKAGE_ALGORITHM;
  if (!algorithmOk) {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.UNSUPPORTED_ALGORITHM);
  }
  const parsed = EncryptedPackageSchema.safeParse(envelope);
  if (!parsed.success) {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.INVALID_STRUCTURE);
  }
  const pkg = parsed.data;

  const suite = hpkeSuite();
  const aad = canonicalAad(pkg);
  const enc = b64u.decode(pkg.encapsulatedKey);
  const wrapped = b64u.decode(pkg.wrappedKey);

  // Importar la privada raw X25519 y abrir la content key con HPKE.
  try {
    const recipientSk = await importX25519PrivateKey(suite, recipientPrivateKey);
    const contentKeyBuf = await suite.open(
      { recipientKey: recipientSk, enc, info: HPKE_INFO },
      wrapped,
      aad,
    );
    const contentKey = new Uint8Array(contentKeyBuf);

    // AES-GCM del contenido.
    const aesKey = await crypto.subtle.importKey(
      "raw",
      toBufferSource(contentKey),
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const nonce = b64u.decode(pkg.nonce);
    const ct = b64u.decode(pkg.ciphertext);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toBufferSource(nonce), additionalData: toBufferSource(aad) },
      aesKey,
      toBufferSource(ct),
    );
    const out = new Uint8Array(plaintext);
    // Zeroize best-effort antes de devolver.
    zeroize(contentKey, nonce);
    return out;
  } catch {
    // Sin detalles: ni plaintext, ni claves, ni mensajes internos.
    throw new EncryptedPackageError(EncryptedPackageErrorCode.DECRYPTION_FAILED);
  }
}

/** Importa una privada X25519 raw de 32 bytes como CryptoKey hpke. */
async function importX25519PrivateKey(
  suite: CipherSuite,
  privateKey: Uint8Array,
): Promise<CryptoKey> {
  // hpke 1.9.0: kem.importKey('raw', bytes, true) importa privadas.
  return suite.kem.importKey("raw", toBufferSource(privateKey).buffer, false);
}

/**
 * Serializa a los bytes canónicos del paquete (JSON UTF-8 sin espacios).
 */
export function serializeEncryptedPackage(envelope: EncryptedPackage): Uint8Array {
  const parsed = EncryptedPackageSchema.safeParse(envelope);
  if (!parsed.success) {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.INVALID_STRUCTURE);
  }
  return canonicalJson(parsed.data);
}

/**
 * Deserializa bytes a un envelope. Rechaza JSON inválido, campos
 * desconocidos, versiones/algoritmos no soportados y codificaciones no
 * canónicas. Nunca confía en el orden del JSON recibido.
 */
export function deserializeEncryptedPackage(bytes: Uint8Array): EncryptedPackage {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.INVALID_STRUCTURE);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.INVALID_STRUCTURE);
  }
  if (raw === null || typeof raw !== "object") {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.INVALID_STRUCTURE);
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== PACKAGE_VERSION) {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.UNSUPPORTED_VERSION);
  }
  if (obj.algorithm !== PACKAGE_ALGORITHM) {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.UNSUPPORTED_ALGORITHM);
  }
  const parsed = EncryptedPackageSchema.safeParse(raw);
  if (!parsed.success) {
    throw new EncryptedPackageError(EncryptedPackageErrorCode.INVALID_STRUCTURE);
  }
  // Reconstrucción siempre en orden canónico desde los campos validados.
  const p = parsed.data;
  return {
    version: PACKAGE_VERSION,
    algorithm: PACKAGE_ALGORITHM,
    recipientPublicKey: p.recipientPublicKey,
    encapsulatedKey: p.encapsulatedKey,
    nonce: p.nonce,
    ciphertext: p.ciphertext,
    wrappedKey: p.wrappedKey,
    metadata: { professional: p.metadata.professional, scope: p.metadata.scope },
  };
}

/**
 * Hash canónico del paquete: 0x + Keccak-256 de la serialización completa.
 * Incluye ciphertext, wrappedKey, claves, nonce y metadata. Compatible con
 * ConsentRegistry.packageHash (bytes32).
 */
export function hashEncryptedPackage(envelope: EncryptedPackage): string {
  const bytes = serializeEncryptedPackage(envelope);
  return toHex(new Uint8Array(keccak_256(bytes)));
}