/**
 * Contratos públicos de NadieCore (Goal 2).
 *
 * Solo tipos e interfaces de puerto, sin implementaciones, adapters ni
 * instancias por defecto (docs/REGLAS.md §3). Todo lo que va on-chain está
 * restringido a direcciones, hashes, enteros, timestamps y etiquetas de
 * alcance: nunca conversaciones, notas, memorias ni resúmenes en texto claro.
 */

import { EMOTION_LABELS, MEMORY_TYPES, RISK_LEVELS } from "./schemas";
import type { CheckInProposal, MemoryExtraction, ShareSummaryDraft } from "./schemas";

// ---------------------------------------------------------------------------
// Primitivas compartidas
// ---------------------------------------------------------------------------

/** Dirección EVM de 20 bytes en hexadecimal. */
export type Address = string;

/** Hash de 32 bytes en hexadecimal (keccak del paquete cifrado). */
export type Hash = string;

/** Timestamp Unix en segundos. */
export type Timestamp = number;

/** Fecha ISO calendario (YYYY-MM-DD), sin zona horaria. */
export type ISODate = string;

// ---------------------------------------------------------------------------
// Modelo de datos local (docs/ARQUITECTURA.MD §5.7) — todo cifrado en el dispositivo
// ---------------------------------------------------------------------------

export type EmotionLabel = (typeof EMOTION_LABELS)[number];

export interface Emotion {
  label: EmotionLabel;
  intensity: 1 | 2 | 3;
}

export type SessionMode = "private" | "enclave" | "voice";

export type RiskLevel = (typeof RISK_LEVELS)[number];

export type MemoryType = (typeof MEMORY_TYPES)[number];

/** Check-in diario: puntaje 1–10, emociones, nota opcional. */
export interface CheckIn {
  id: string;
  date: ISODate;
  score: number;
  emotions: readonly Emotion[];
  note?: string;
  energy?: number;
  sleep?: number;
  source: "manual" | "ai-confirmed";
  linkedSessionId?: string;
}

/** Sesión de conversación (§5.7: incluye la transcripción). */
export interface Session {
  id: string;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  mode: SessionMode;
  transcript: readonly ChatMessage[];
  summary: string;
  emotions: readonly Emotion[];
  themes: readonly string[];
  riskLevel: RiskLevel;
  sharedPackageHash?: Hash;
}

/** Recuerdo semántico: "lo que Nadie sabe de ti". */
export interface MemoryRecord {
  id: string;
  type: MemoryType;
  content: string;
  firstMentionedAt: Timestamp;
  lastMentionedAt: Timestamp;
  mentionCount: number;
  confirmedByUser: boolean;
}

/** Memoria episódica cifrada de una sesión. */
export interface SessionRecord {
  sessionId: string;
  extraction: MemoryExtraction;
}

// ---------------------------------------------------------------------------
// Observaciones de "Mi camino" (docs/ARQUITECTURA.MD §7)
// ---------------------------------------------------------------------------

/** Observación en lenguaje simple: correlación, nunca causa ni diagnóstico. */
export interface Insight {
  id: string;
  text: string;
  computedFrom: ISODate;
  computedTo: ISODate;
}

/** Tendencia de ánimo calculada localmente. */
export interface MoodTrend {
  from: ISODate;
  to: ISODate;
  average: number;
  movingAverage7: number;
}

// ---------------------------------------------------------------------------
// Tipos on-chain (docs/ARQUITECTURA.MD §9) — nunca texto libre personal
// ---------------------------------------------------------------------------

/** Alcances de un permiso: etiquetas cerradas, sin contenido. */
export type ConsentScope = "graph-summary" | "graph-summary-transcripts";

/** Credencial profesional registrada on-chain (§9.1: quién la emitió). */
export interface ProfessionalCredential {
  professional: Address;
  encryptionPublicKey: Hash;
  /** Nombre visible elegido por el profesional para mostrarse al público. */
  displayName: string;
  status: "active" | "suspended";
  expiresAt: Timestamp;
  issuer: Address;
}

/** Permiso de acceso registrado on-chain. */
export interface ConsentGrant {
  userPseudonym: Address;
  professional: Address;
  /** Hash del paquete CIFRADO, nunca del texto claro. */
  packageHash: Hash;
  scope: ConsentScope;
  expiresAt: Timestamp;
  revoked: boolean;
}

/** Primera apertura de un permiso: solo la primera, no lecturas posteriores. */
export interface FirstOpening {
  grantId: number;
  professional: Address;
  openedAt: Timestamp;
}

/** Revocación de un permiso. */
export interface Revocation {
  grantId: number;
  userPseudonym: Address;
  revokedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Paquete cifrado (Goal 6 lo implementa; aquí solo el tipo compartido)
// ---------------------------------------------------------------------------

/** Envoltura cifrada de punta a punta. El gateway nunca ve texto claro. */
export interface EncryptedPackage {
  version: number;
  ciphertext: string;
  nonce: string;
  wrappedKey: string;
}

/** Registro de un paquete compartido, local al dispositivo. */
export interface SharedRecord {
  id: string;
  professional: Address;
  scope: ConsentScope;
  dateRange: { from: ISODate; to: ISODate };
  expiresAt: Timestamp;
  packageHash: Hash;
  grantId: number;
  status: "active" | "opened" | "revoked" | "expired";
}

// ---------------------------------------------------------------------------
// Entradas de auditoría (docs/ARQUITECTURA.MD §8 paso 8)
// ---------------------------------------------------------------------------

export interface AuditEntry {
  grantId: number;
  professional: Address;
  scope: ConsentScope;
  grantedAt: Timestamp;
  firstOpenedAt?: Timestamp;
  revokedAt?: Timestamp;
}

// ---------------------------------------------------------------------------
// Llaves (docs/ARQUITECTURA.MD §11)
// ---------------------------------------------------------------------------

export interface KeySet {
  vaultKey: Uint8Array;
  encryptionPublicKey: Hash;
  signingAddresses: ReadonlyMap<Address, Address>;
}

export interface RecoveryPhrase {
  words: readonly string[];
}

// ---------------------------------------------------------------------------
// Puertos (docs/REGLAS.md §3): solo interfaces, sin implementación
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at: Timestamp;
}

/** Puerto de inferencia: chat y extract contra un LLM local o de enclave. */
export interface LLMPort {
  chat(
    messages: readonly ChatMessage[],
    context: readonly string[],
  ): Promise<readonly ChatMessage[]>;
  extract(
    transcript: readonly ChatMessage[],
    schema: "memory" | "checkin" | "share-summary",
  ): Promise<unknown>;
}

/** Puerto del baúl cifrado: guardar y leer, sin texto claro en disco. */
export interface VaultPort {
  save(recordId: string, payload: Uint8Array): Promise<void>;
  read(recordId: string): Promise<Uint8Array | undefined>;
  remove(recordId: string): Promise<void>;
}

export interface GrantRequest {
  professional: Address;
  scope: ConsentScope;
  packageHash: Hash;
  expiresAt: Timestamp;
}

export interface GrantResult {
  grantId: number;
  userPseudonym: Address;
}

/** Puerto de cadena: leer credenciales/permisos y firmar sin gas. */
export interface ChainPort {
  isProfessionalVerified(professional: Address): Promise<boolean>;
  getConsentGrant(grantId: number): Promise<ConsentGrant | undefined>;
  getFirstOpening(grantId: number): Promise<FirstOpening | undefined>;
  signGrant(request: GrantRequest): Promise<Uint8Array>;
  signRevocation(grantId: number): Promise<Uint8Array>;
}

// ---------------------------------------------------------------------------
// Contrato público de NadieCore (docs/REGLAS.md §3.1)
// ---------------------------------------------------------------------------

export interface NadieCore {
  /** Llaves del usuario y derivación de cuentas de firma por profesional. */
  readonly keys: {
    generate(): Promise<KeySet>;
    deriveSigningAddress(professional: Address): Promise<Address>;
    revealRecoveryPhrase(): Promise<RecoveryPhrase>;
  };

  /** Conversación: abrir, intercambiar y cerrar una sesión. */
  readonly session: {
    open(mode: SessionMode): Promise<Session>;
    send(sessionId: string, message: string): Promise<string>;
    close(sessionId: string): Promise<MemoryExtraction>;
  };

  /** Memoria visible y editable. */
  readonly memory: {
    list(): Promise<readonly MemoryRecord[]>;
    confirm(memoryId: string): Promise<MemoryRecord>;
    edit(memoryId: string, content: string): Promise<MemoryRecord>;
    forget(memoryId: string): Promise<void>;
    forgetAll(): Promise<void>;
  };

  /** Check-in diario: manual o propuesto por la IA y confirmado. */
  readonly checkins: {
    save(checkIn: CheckIn): Promise<CheckIn>;
    proposeFromSession(sessionId: string): Promise<CheckInProposal>;
    list(): Promise<readonly CheckIn[]>;
  };

  /** "Mi camino": gráfico y observaciones. */
  readonly insights: {
    moodTrend(from: ISODate, to: ISODate): Promise<MoodTrend>;
    observations(from: ISODate, to: ISODate): Promise<readonly Insight[]>;
  };

  /** Compartir con un profesional verificado: el 2-de-2. */
  readonly sharing: {
    draftSummary(from: ISODate, to: ISODate): Promise<ShareSummaryDraft>;
    approveDraft(draft: ShareSummaryDraft): Promise<EncryptedPackage>;
    grant(request: GrantRequest): Promise<GrantResult>;
    revoke(grantId: number): Promise<void>;
    list(): Promise<readonly SharedRecord[]>;
  };

  /** Auditoría: qué se compartió, quién abrió y cuándo. */
  readonly audit: {
    entries(): Promise<readonly AuditEntry[]>;
  };
}
