/**
 * API pública de @nadie/core (Goal 2: contratos de software primero).
 *
 * Solo tipos, esquemas runtime y puertos. Sin implementaciones concretas.
 */

export type {
  Address,
  Hash,
  Timestamp,
  ISODate,
  Emotion,
  EmotionLabel,
  SessionMode,
  RiskLevel,
  MemoryType,
  CheckIn,
  Session,
  MemoryRecord,
  SessionRecord,
  Insight,
  MoodTrend,
  ConsentScope,
  ProfessionalCredential,
  ConsentGrant,
  FirstOpening,
  Revocation,
  EncryptedPackage,
  SharedRecord,
  AuditEntry,
  KeySet,
  RecoveryPhrase,
  ChatMessage,
  LLMPort,
  VaultPort,
  ChainPort,
  GrantRequest,
  GrantResult,
  NadieCore,
} from "./contracts";

export {
  EMOTION_LABELS,
  MEMORY_TYPES,
  RISK_LEVELS,
  MemoryExtractionSchema,
  CheckInProposalSchema,
  ShareSummaryDraftSchema,
  DateRangeSchema,
} from "./schemas";

export type {
  MemoryExtraction,
  CheckInProposal,
  ShareSummaryDraft,
} from "./schemas";
