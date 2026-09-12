import React, { useMemo } from 'react';
import { MoodCurve } from '../components/MoodCurve.jsx';
import { MOOD_DOWN, MOOD_UP } from '../lib/mood.js';
import { buildJourney } from '../lib/journey.js';

const DIAS = ['l', 'm', 'x', 'j', 'v', 's', 'd'];

/* "Tu camino" — el diferenciador a fondo: la app te recuerda.
   Sin juicios de valor ("mal día"): solo el registro y los patrones que se
   calculan EN EL DISPOSITIVO. Nada de esto sale del teléfono. */

export default function Journey({ monthValues }) {
  const j = useMemo(() => buildJourney(monthValues), [monthValues]);

  return (
    <div className="anim-fade-up" style={{ flex: 1, overflowY: 'auto', padding: '0 var(--screen-pad)' }}>
      <header style={{ paddingTop: 'var(--space-6)' }}>
        <h1 className="t-title">Tu camino</h1>
        <p className="t-small" style={{ marginTop: 'var(--space-1)' }}>Solo tuyo. Nadie más lo ve.</p>
      </header>

      <div className="n-card" style={{ marginTop: 'var(--space-5)', padding: 'var(--space-4) var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-2)' }}>
          <span className="t-small">Últimas 4 semanas</span>
          <span className="t-micro">{j.range}</span>
        </div>
        <MoodCurve values={monthValues} width={318} height={104} upColor={MOOD_UP} downColor={MOOD_DOWN} ariaLabel="Ánimo de las últimas cuatro semanas" />
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {DIAS.map((d, i) => (
            <span key={'h' + i} className="t-micro" style={{ textAlign: 'center' }} aria-hidden="true">{d}</span>
          ))}
          {j.cells.map((c) =>
            c.empty ? (
              <div key={c.key} />
            ) : (
              <div
                key={c.key}
                style={{
                  aspectRatio: '1', borderRadius: 'var(--radius-s)',
                  background: c.bg, border: '1px solid ' + c.border,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 10.5, letterSpacing: 'var(--tracking-micro)', color: c.color }}>{c.day}</span>
              </div>
            )
          )}
        </div>
        <p className="t-micro" style={{ marginTop: 'var(--space-3)' }}>
          El color de cada día sigue tu ánimo — arriba o abajo. Sin etiquetas, solo el registro.
        </p>
      </div>

      {j.hasData && (
        <div className="n-card" style={{ marginTop: 'var(--space-6)', padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="t-small" style={{ color: 'var(--text-1)', fontWeight: 'var(--weight-medium)' }}>Lo que nadie va notando</span>
          {j.patterns.map((p, i) => (
            <p key={i} className="t-small" style={{ margin: 0, textWrap: 'pretty' }}>{p}</p>
          ))}
          <span className="t-micro" style={{ marginTop: 'var(--space-1)' }}>Patrones que ve solo este teléfono. Nadie más.</span>
        </div>
      )}

      <p className="t-small" style={{ margin: 'var(--space-6) 0', textWrap: 'pretty' }}>{j.note}</p>
    </div>
  );
}
