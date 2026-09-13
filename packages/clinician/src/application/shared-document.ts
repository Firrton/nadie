/* Reads the plain-text document the person shares from the Nadie app.

   The format is defined by packages/frontend/src/lib/compartir/documento.js:

     <title>
     <YYYY-MM-DD> a <YYYY-MM-DD>
     <blank>
     <summary, one or more lines>
     <blank>
     Diario de ánimo (1 a 10)
     <YYYY-MM-DD>  <score>/10[  <note>]

   Anything that does not match returns null, and the portal shows the raw
   text instead. What the person sent is never hidden or reinterpreted. */

export interface JournalDay {
  date: string;
  score: number;
  note: string;
}

export interface SharedDocument {
  title: string;
  from: string;
  to: string;
  summary: string;
  journal: JournalDay[];
}

const RANGE = /^(\d{4}-\d{2}-\d{2}) a (\d{4}-\d{2}-\d{2})$/;
const JOURNAL_HEADER = "Diario de ánimo (1 a 10)";
const DAY = /^(\d{4}-\d{2}-\d{2}) {2}(\d{1,2})\/10(?: {2}(.*))?$/;

export function parseSharedDocument(text: string): SharedDocument | null {
  const lines = text.split("\n");
  if (lines.length < 4) return null;

  const [title, range, blank] = lines;
  const period = RANGE.exec(range ?? "");
  if (!title?.trim() || !period || blank !== "") return null;

  const headerIndex = lines.indexOf(JOURNAL_HEADER);
  const summary = lines.slice(3, headerIndex === -1 ? undefined : headerIndex).join("\n").trim();
  if (!summary) return null;

  const journal: JournalDay[] = [];
  if (headerIndex !== -1) {
    for (const line of lines.slice(headerIndex + 1)) {
      const day = DAY.exec(line);
      if (!day) return null;
      const score = Number(day[2]);
      if (score < 1 || score > 10) return null;
      journal.push({ date: day[1], score, note: day[3] ?? "" });
    }
  }

  return { title: title.trim(), from: period[1], to: period[2], summary, journal };
}
