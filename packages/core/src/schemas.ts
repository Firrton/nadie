/**
 * Esquemas runtime estrictos (Zod v4) para las salidas del modelo.
 *
 * Reglas (docs/REGLAS.md §3 y §5):
 * - La salida del modelo se valida contra el esquema; si no valida, se descarta.
 * - Ningún esquema acepta campos desconocidos.
 * - Los recuerdos jamás incluyen diagnósticos ni etiquetas clínicas.
 */

import { z } from "zod";

/** Etiquetas emocionales fijas del check-in (docs/ARQUITECTURA.MD §6). */
export const EMOTION_LABELS = [
  "alegría",
  "calma",
  "gratitud",
  "esperanza",
  "tristeza",
  "ansiedad",
  "miedo",
  "enojo",
  "frustración",
  "soledad",
  "cansancio",
  "culpa",
] as const;

/** Tipos de recuerdo semántico (docs/ARQUITECTURA.MD §5.7). */
export const MEMORY_TYPES = [
  "persona",
  "tema",
  "detonante",
  "estrategia-que-ayuda",
  "pendiente",
] as const;

/** Señal de riesgo local: tres niveles, nunca diagnóstico. */
export const RISK_LEVELS = ["bajo", "medio", "alto"] as const;

const EmotionSchema = z
  .object({
    label: z.enum(EMOTION_LABELS),
    intensity: z.number().int().min(1).max(3),
  })
  .strict();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha ISO YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    if (m < 1 || m > 12) return false;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return d >= 1 && d <= daysInMonth;
  }, "fecha calendario inválida");

/** Resumen de 3 a 5 líneas no vacías (docs/ARQUITECTURA.MD §5.2). */
const SummarySchema = z
  .string()
  .refine(
    (s) => {
      const lines = s.split("\n").filter((line) => line.trim().length > 0);
      return lines.length >= 3 && lines.length <= 5;
    },
    { message: "el resumen debe tener entre 3 y 5 líneas no vacías" },
  );

/**
 * Extracción de memoria al cerrar una sesión (docs/ARQUITECTURA.MD §5.2):
 * resumen de 3–5 líneas, emociones, temas, recuerdos nuevos o actualizados,
 * pendientes y señal de riesgo.
 */
export const MemoryExtractionSchema = z
  .object({
    summary: SummarySchema,
    emotions: z.array(EmotionSchema),
    themes: z.array(z.string().min(1)),
    memories: z
      .array(
        z
          .object({
            type: z.enum(MEMORY_TYPES),
            content: z.string().min(1),
          })
          .strict(),
      )
      .default([]),
    pending: z.array(z.string().min(1)).default([]),
    riskLevel: z.enum(RISK_LEVELS),
  })
  .strict();

export type MemoryExtraction = z.output<typeof MemoryExtractionSchema>;

/* El mismo contrato acotado sirve para resumir una sesión y para la cápsula
   acumulativa. Son conceptos distintos, pero duplicar la forma permitiría que
   divergieran sin querer. */
const BoundedMemorySchema = z
  .object({
    important: z.array(z.string().trim().min(1).max(80)).max(4),
    people: z.array(z.string().trim().min(1).max(80)).max(3),
    openLoops: z.array(z.string().trim().min(1).max(80)).max(3),
    recentChanges: z.array(z.string().trim().min(1).max(80)).max(2),
  })
  .strict();

export const SessionDigestSchema = BoundedMemorySchema;
export const MemoryCapsuleSchema = BoundedMemorySchema;

export type SessionDigest = z.output<typeof SessionDigestSchema>;
export type MemoryCapsule = z.output<typeof MemoryCapsuleSchema>;

/**
 * Propuesta de check-in derivada de la conversación. Nunca se guarda sin
 * confirmación de la persona (docs/ARQUITECTURA.MD §6).
 */
export const CheckInProposalSchema = z
  .object({
    score: z.number().int().min(1).max(10),
    emotions: z.array(EmotionSchema),
    note: z.string().min(1).optional(),
  })
  .strict();

export type CheckInProposal = z.output<typeof CheckInProposalSchema>;

/**
 * Borrador de resumen para compartir con un profesional verificado
 * (docs/ARQUITECTURA.MD §8 paso 3). El rango de fechas no puede invertirse.
 */
export const DateRangeSchema = z
  .object({ from: isoDate, to: isoDate })
  .strict()
  .refine((r) => r.from <= r.to, { message: "rango de fechas invertido" });

export const ShareSummaryDraftSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().trim().min(1),
    moodTrendIncluded: z.boolean(),
    dateRange: DateRangeSchema,
  })
  .strict();

export type ShareSummaryDraft = z.output<typeof ShareSummaryDraftSchema>;
