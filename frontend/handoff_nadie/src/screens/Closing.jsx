import React, { useEffect, useRef, useState } from 'react';
import { VoiceOrb } from '../components/VoiceOrb.jsx';
import { WeekStrip } from '../components/WeekStrip.jsx';
import { MOOD_DOWN, MOOD_UP, RATING_STEPS, moodTint } from '../lib/mood.js';

/* Cierre de sesión. Aquí ocurre lo importante del modelo de producto:
   EL USUARIO califica su día. La app no lo decide por él. Hasta que califica,
   el día no queda registrado. */

const GUARDADO_MS = 600;   // espera antes de guardar mientras escribe
const AVISO_MS = 2000;     // cuánto dura el "guardado"
const CONTADOR_DESDE = 60; // solo mostrar cuántos quedan cerca del tope

/* La nota es OPCIONAL y va después de calificar, nunca antes. Un tap en un
   círculo es fricción cero, y eso es lo que hace que el registro exista; un
   textarea vacío delante de alguien que acaba de desahogarse lo espanta. */
function NoteField({ value, onChange, maxLength }) {
  const [abierto, setAbierto] = useState(Boolean(value));
  const [texto, setTexto] = useState(value || '');
  const [guardado, setGuardado] = useState(false);
  const primera = useRef(true);

  // Autoguardado: un botón "Guardar" mete fricción en el peor momento.
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    const id = setTimeout(() => { onChange(texto); setGuardado(true); }, GUARDADO_MS);
    return () => clearTimeout(id);
  }, [texto, onChange]);

  useEffect(() => {
    if (!guardado) return undefined;
    const id = setTimeout(() => setGuardado(false), AVISO_MS);
    return () => clearTimeout(id);
  }, [guardado]);

  if (!abierto) {
    return (
      <button type="button" className="n-btn n-btn--ghost n-btn--md n-btn--full" onClick={() => setAbierto(true)}>
        ¿Quieres agregar algo?
      </button>
    );
  }

  const quedan = maxLength - texto.length;

  return (
    <div className="n-card" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <label className="t-small" htmlFor="nota-del-dia" style={{ color: 'var(--text-1)' }}>
        Si quieres, cuenta por qué
      </label>
      <textarea
        id="nota-del-dia"
        className="n-note"
        rows={3}
        value={texto}
        maxLength={maxLength}
        placeholder="Solo para ti."
        onChange={(e) => { setTexto(e.target.value); setGuardado(false); }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <span className="t-micro">{guardado ? 'guardado' : 'esto se queda en este teléfono'}</span>
        {quedan <= CONTADOR_DESDE && <span className="t-micro">{quedan}</span>}
      </div>
    </div>
  );
}

export default function Closing({
  exchange, weekValues, rated, onRate, onHome, onOpenJourney,
  note = '', onNoteChange, noteMaxLength = 500, showTherapistNote = true,
}) {
  const summary = exchange <= 1
    ? 'Hablaste poco, pero lo dijiste en voz alta. Con eso alcanza por hoy.'
    : 'Soltaste el peso del día — el trabajo, la casa, lo acumulado. Lo nombraste sin rodeos.';

  return (
    <div className="anim-fade-up" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '0 var(--screen-pad)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'var(--space-9) 0 var(--space-7)' }}>
        <VoiceOrb size={84} />
        <h1 className="t-title" style={{ marginTop: 'var(--space-6)' }}>Quedó dicho.</h1>
        <p className="t-body t-muted" style={{ marginTop: 'var(--space-3)', maxWidth: 300, textWrap: 'pretty' }}>{summary}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {!rated ? (
          <div className="n-card" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <span className="t-small" style={{ color: 'var(--text-1)' }}>Antes de irte: ¿cómo te sientes ahora?</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
              {RATING_STEPS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => onRate(s.value)}
                  aria-label={s.label}
                  style={{
                    width: 48, height: 48, borderRadius: 'var(--radius-full)',
                    background: moodTint(s.value),
                    border: '1px solid var(--border-1)',
                    cursor: 'pointer', padding: 0,
                    transition: 'border-color var(--dur-1) var(--ease-out), transform var(--dur-1) var(--ease-out)',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="t-micro">abajo</span>
              <span className="t-micro">arriba</span>
            </div>
          </div>
        ) : (
          <>
            <WeekStrip values={weekValues} todayIndex={6} upColor={MOOD_UP} downColor={MOOD_DOWN} caption="hoy ya quedó registrado" onClick={onOpenJourney} />
            <p className="t-micro" style={{ margin: 0, textAlign: 'center' }}>Registrado. Solo tú lo ves.</p>
            {onNoteChange && <NoteField value={note} onChange={onNoteChange} maxLength={noteMaxLength} />}
          </>
        )}

        {showTherapistNote && (
          <div className="n-card" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <span className="t-small">Si vas con un terapeuta, llévale esto</span>
            <p className="t-serif-quote" style={{ margin: 0, fontSize: 18, lineHeight: 1.45 }}>
              «No es una sola cosa grande: son mil chicas. Decirlo en voz alta ayudó.»
            </p>
            <span className="t-micro">Nadie acompaña tu desahogo. No sustituye la ayuda profesional.</span>
          </div>
        )}
      </div>

      <div style={{ padding: 'var(--space-5) 0 var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <button type="button" className="n-btn n-btn--primary n-btn--lg n-btn--full" onClick={onHome}>Volver al inicio</button>
        <button type="button" className="n-btn n-btn--ghost n-btn--md n-btn--full" onClick={onOpenJourney}>Ver tu camino</button>
      </div>
    </div>
  );
}
