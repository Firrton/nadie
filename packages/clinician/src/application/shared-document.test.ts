import { describe, expect, it } from "vitest";

import { parseSharedDocument } from "./shared-document";

/* Mismo formato que arma packages/frontend/src/lib/compartir/documento.js. */
const document = [
  "Semanas de mucho peso",
  "2026-08-16 a 2026-09-12",
  "",
  "Habló de cansancio acumulado.",
  "Le pesa sentir que molesta.",
  "",
  "Diario de ánimo (1 a 10)",
  "2026-09-10  3/10",
  "2026-09-12  7/10  hablé con mi hermana",
].join("\n");

describe("parseSharedDocument", () => {
  it("reads title, period and the approved summary", () => {
    const parsed = parseSharedDocument(document);

    expect(parsed?.title).toBe("Semanas de mucho peso");
    expect(parsed?.from).toBe("2026-08-16");
    expect(parsed?.to).toBe("2026-09-12");
    expect(parsed?.summary).toBe("Habló de cansancio acumulado.\nLe pesa sentir que molesta.");
  });

  it("reads each journal day with its score and optional note", () => {
    expect(parseSharedDocument(document)?.journal).toEqual([
      { date: "2026-09-10", score: 3, note: "" },
      { date: "2026-09-12", score: 7, note: "hablé con mi hermana" },
    ]);
  });

  it("a document without journal has an empty journal", () => {
    const withoutJournal = document.split("\n\nDiario de ánimo")[0];

    expect(parseSharedDocument(withoutJournal)?.journal).toEqual([]);
  });

  /* Si el formato no es el esperado, la pantalla muestra el texto tal cual:
     nunca se esconde ni se reinterpreta lo que la persona mandó. */
  it("returns null for text that is not a shared document", () => {
    expect(parseSharedDocument("hola, esto es otra cosa")).toBeNull();
    expect(parseSharedDocument("")).toBeNull();
  });
});
