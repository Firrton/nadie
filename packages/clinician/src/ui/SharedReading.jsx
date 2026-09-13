import { parseSharedDocument } from "../application/shared-document";

/* Lo que la persona compartió, descifrado en este equipo.

   El color sigue la misma regla que la app de la persona
   (packages/frontend/src/lib/mood.js): por encima del 5 es "arriba" (azul),
   por debajo es "abajo" (rojo), el 5 es neutro, y la intensidad crece con la
   distancia al neutro. */

const NEUTRAL = 5;
const UP = "127, 164, 212";
const DOWN = "210, 106, 86";

function moodTint(score) {
  if (score === NEUTRAL) return "var(--surface-2)";
  const t = Math.min(1, Math.abs(score - NEUTRAL) / (NEUTRAL - 1));
  const alpha = t < 0.2 ? 0.1 : t < 0.45 ? 0.16 : t < 0.7 ? 0.28 : 0.42;
  return `rgba(${score > NEUTRAL ? UP : DOWN}, ${alpha})`;
}

function moodStroke(score) {
  if (score === NEUTRAL) return "var(--text-2)";
  return `rgb(${score > NEUTRAL ? UP : DOWN})`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const noon = (isoDate) => new Date(`${isoDate}T12:00:00`);

function shortDate(isoDate) {
  return noon(isoDate).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

function MoodCurve({ from, to, journal }) {
  const width = 640;
  const height = 150;
  const padX = 12;
  const padY = 16;
  const span = Math.max(1, Math.round((noon(to) - noon(from)) / DAY_MS));
  const x = (date) => padX + ((noon(date) - noon(from)) / DAY_MS / span) * (width - padX * 2);
  const y = (score) => padY + ((10 - score) / 9) * (height - padY * 2);
  const points = journal.map((day) => `${x(day.date).toFixed(1)},${y(day.score).toFixed(1)}`).join(" ");

  return (
    <svg className="curve" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Curva del ánimo en el período compartido">
      <line x1={padX} x2={width - padX} y1={y(NEUTRAL)} y2={y(NEUTRAL)} stroke="var(--border-subtle)" strokeDasharray="3 5" />
      {journal.length > 1 ? (
        <polyline points={points} fill="none" stroke="var(--mood-line)" strokeOpacity="0.45" strokeWidth="1.5" />
      ) : null}
      {journal.map((day) => (
        <circle key={day.date} cx={x(day.date)} cy={y(day.score)} r="4" fill={moodStroke(day.score)} />
      ))}
    </svg>
  );
}

export default function SharedReading({ text, onClear }) {
  const document = parseSharedDocument(text);

  if (!document) {
    return (
      <section className="n-card reading" aria-label="Contenido descifrado">
        <div className="section-head">
          <p className="t-micro">Descifrado en este equipo</p>
          <button className="n-btn n-btn--ghost n-btn--md" onClick={onClear}>Quitar de la pantalla</button>
        </div>
        <p className="t-body reading-raw">{text}</p>
      </section>
    );
  }

  return (
    <section className="n-card reading" aria-label="Contenido descifrado">
      <div className="section-head">
        <p className="t-micro">Descifrado en este equipo · {shortDate(document.from)} – {shortDate(document.to)}</p>
        <button className="n-btn n-btn--ghost n-btn--md" onClick={onClear}>Quitar de la pantalla</button>
      </div>

      <h2 className="t-title">{document.title}</h2>
      <p className="t-small" style={{ marginTop: "var(--space-2)" }}>Resumen redactado en el teléfono de la persona y aprobado por ella antes de enviarlo.</p>
      <p className="reading-summary" style={{ marginTop: "var(--space-5)" }}>{document.summary}</p>

      {document.journal.length > 0 ? (
        <>
          <hr className="divider" />
          <div className="section-head">
            <h3 className="t-heading">Diario de ánimo</h3>
            <span className="t-small">{document.journal.length} días registrados · escala 1 a 10</span>
          </div>
          <MoodCurve from={document.from} to={document.to} journal={document.journal} />
          <ol className="days">
            {[...document.journal].reverse().map((day) => (
              <li className="day" key={day.date}>
                <span className="t-small">{shortDate(day.date)}</span>
                <span className="day-score" style={{ background: moodTint(day.score) }}>{day.score}</span>
                {/* Sin nota, el espacio queda vacío: un "Sin nota" repetido tapa las notas que sí hay. */}
                <span className="t-body">{day.note}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
