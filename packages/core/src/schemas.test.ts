import { describe, expect, it } from "vitest";

import {
  MemoryExtractionSchema,
  CheckInProposalSchema,
  ShareSummaryDraftSchema,
} from "./schemas";

describe("MemoryExtractionSchema", () => {
  const valid = {
    summary:
      "La persona habló del examen de mañana.\nSe siente nerviosa pero estudia con calma.\nPidió ayuda para dormir.",
    emotions: [
      { label: "ansiedad", intensity: 3 },
      { label: "calma", intensity: 1 },
    ],
    themes: ["estudios", "sueño"],
    memories: [
      { type: "pendiente", content: "Preguntar cómo le fue en el examen" },
    ],
    pending: ["Examen de mañana"],
    riskLevel: "bajo",
  };

  const summaryLines = (n: number): string =>
    Array.from({ length: n }, (_, i) => `Línea ${i + 1} del resumen.`).join("\n");

  it("acepta una extracción válida", () => {
    expect(MemoryExtractionSchema.parse(valid)).toEqual(valid);
  });

  it("acepta una extracción mínima sin recuerdos ni pendientes", () => {
    const parsed = MemoryExtractionSchema.parse({
      summary:
        "Sesión corta.\nSin temas nuevos.\nÁnimo estable.",
      emotions: [],
      themes: [],
      riskLevel: "bajo",
    });
    expect(parsed.memories).toEqual([]);
    expect(parsed.pending).toEqual([]);
  });

  it("acepta resúmenes de exactamente 3 y 5 líneas", () => {
    expect(() =>
      MemoryExtractionSchema.parse({ ...valid, summary: summaryLines(3) }),
    ).not.toThrow();
    expect(() =>
      MemoryExtractionSchema.parse({ ...valid, summary: summaryLines(5) }),
    ).not.toThrow();
  });

  it("rechaza resúmenes de 2 y 6 líneas", () => {
    expect(() =>
      MemoryExtractionSchema.parse({ ...valid, summary: summaryLines(2) }),
    ).toThrow();
    expect(() =>
      MemoryExtractionSchema.parse({ ...valid, summary: summaryLines(6) }),
    ).toThrow();
  });

  it("rechaza resumen con líneas vacías que rellenan hasta 3", () => {
    expect(() =>
      MemoryExtractionSchema.parse({
        ...valid,
        summary: "Solo una línea real.\n\n",
      }),
    ).toThrow();
  });

  it("rechaza intensidad fuera de 1–3", () => {
    expect(() =>
      MemoryExtractionSchema.parse({ ...valid, emotions: [{ label: "miedo", intensity: 4 }] }),
    ).toThrow();
  });

  it("rechaza una emoción fuera de la lista fija", () => {
    expect(() =>
      MemoryExtractionSchema.parse({ ...valid, emotions: [{ label: "locura", intensity: 1 }] }),
    ).toThrow();
  });

  it("rechaza un nivel de riesgo desconocido", () => {
    expect(() => MemoryExtractionSchema.parse({ ...valid, riskLevel: "crítico" })).toThrow();
  });

  it("rechaza summary vacío", () => {
    expect(() => MemoryExtractionSchema.parse({ ...valid, summary: "" })).toThrow();
  });

  it("rechaza un tipo de recuerdo desconocido", () => {
    expect(() =>
      MemoryExtractionSchema.parse({
        ...valid,
        memories: [{ type: "diagnóstico", content: "algo" }],
      }),
    ).toThrow();
  });

  it("rechaza campos desconocidos (strict)", () => {
    expect(() => MemoryExtractionSchema.parse({ ...valid, extra: "x" })).toThrow();
  });

  it("rechaza entradas incompletas", () => {
    expect(() => MemoryExtractionSchema.parse({ summary: "solo esto" })).toThrow();
  });
});

describe("CheckInProposalSchema", () => {
  const valid = {
    score: 7,
    emotions: [{ label: "gratitud", intensity: 2 }],
    note: "Día tranquilo",
  };

  it("acepta una propuesta válida", () => {
    expect(CheckInProposalSchema.parse(valid)).toEqual(valid);
  });

  it("acepta una propuesta sin nota", () => {
    expect(CheckInProposalSchema.parse({ score: 5, emotions: [] })).toEqual({
      score: 5,
      emotions: [],
    });
  });

  it("rechaza score fuera de 1–10", () => {
    expect(() => CheckInProposalSchema.parse({ ...valid, score: 0 })).toThrow();
    expect(() => CheckInProposalSchema.parse({ ...valid, score: 11 })).toThrow();
  });

  it("rechaza score decimal", () => {
    expect(() => CheckInProposalSchema.parse({ ...valid, score: 6.5 })).toThrow();
  });

  it("rechaza emoción fuera de la lista fija", () => {
    expect(() =>
      CheckInProposalSchema.parse({
        ...valid,
        emotions: [{ label: "locura", intensity: 2 }],
      }),
    ).toThrow();
    expect(() =>
      CheckInProposalSchema.parse({
        ...valid,
        emotions: [{ label: "diagnóstico", intensity: 2 }],
      }),
    ).toThrow();
  });

  it("rechaza campos desconocidos (strict)", () => {
    expect(() => CheckInProposalSchema.parse({ ...valid, fuente: "manual" })).toThrow();
  });
});

describe("ShareSummaryDraftSchema", () => {
  const valid = {
    title: "Resumen de las últimas dos semanas",
    body: "Ánimo bajo con mejora gradual. Ansiedad ligada a exámenes.",
    moodTrendIncluded: true,
    dateRange: { from: "2026-08-25", to: "2026-09-08" },
  };

  it("acepta un borrador válido", () => {
    expect(ShareSummaryDraftSchema.parse(valid)).toEqual(valid);
  });

  it("rechaza un rango invertido", () => {
    expect(() =>
      ShareSummaryDraftSchema.parse({
        ...valid,
        dateRange: { from: "2026-09-08", to: "2026-08-25" },
      }),
    ).toThrow();
  });

  it("rechaza fechas mal formadas", () => {
    expect(() =>
      ShareSummaryDraftSchema.parse({ ...valid, dateRange: { from: "08/25/2026", to: "2026-09-08" } }),
    ).toThrow();
  });

  it("rechaza fechas imposibles en el rango", () => {
    const impossibleDates = [
      "2026-02-30",
      "2026-04-31",
      "2026-13-01",
      "2026-00-10",
      "2026-09-00",
    ];
    for (const from of impossibleDates) {
      expect(() =>
        ShareSummaryDraftSchema.parse({
          ...valid,
          dateRange: { from, to: "2026-09-08" },
        }),
      ).toThrow();
    }
  });

  it("acepta 29 de febrero en año bisiesto y lo rechaza en año normal", () => {
    expect(() =>
      ShareSummaryDraftSchema.parse({
        ...valid,
        dateRange: { from: "2028-02-29", to: "2028-03-01" },
      }),
    ).not.toThrow();
    expect(() =>
      ShareSummaryDraftSchema.parse({
        ...valid,
        dateRange: { from: "2027-02-29", to: "2027-03-01" },
      }),
    ).toThrow();
  });

  it("rechaza body vacío", () => {
    expect(() => ShareSummaryDraftSchema.parse({ ...valid, body: "  " })).toThrow();
  });

  it("rechaza campos desconocidos (strict)", () => {
    expect(() => ShareSummaryDraftSchema.parse({ ...valid, transcripcion: "..." })).toThrow();
  });
});
