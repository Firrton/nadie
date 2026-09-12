import React, { useState } from 'react';
import { Check, Play, VoiceBars } from '../components/Glyphs.jsx';
import { Lock } from '../components/Glyphs.jsx';
import { CRISIS_LINE, VOICES } from '../data/content.js';

/* Ajustes. Tres bloques: voz, privacidad (con el borrado real) y un mensaje de
   apoyo. El texto de privacidad es la promesa central del producto — no
   suavizarlo ni moverlo a un footer legal. */

export default function Settings({ voiceId, setVoiceId, previewing, previewVoice, onClearHistory }) {
  const [confirm, setConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);

  return (
    <div className="anim-fade-up" style={{ flex: 1, overflowY: 'auto', padding: '0 var(--screen-pad)' }}>
      <header style={{ paddingTop: 'var(--space-6)' }}>
        <h1 className="t-title">Ajustes</h1>
      </header>

      <section style={{ marginTop: 'var(--space-6)' }}>
        <h2 className="t-heading" style={{ fontSize: 16 }}>La voz que te acompaña</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          {VOICES.map((v) => {
            const on = v.id === voiceId;
            return (
              <div
                key={v.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-m)',
                  background: on ? 'var(--accent-a06)' : 'var(--surface-1)',
                  border: '1px solid ' + (on ? 'var(--accent-a40)' : 'var(--border-1)'),
                  transition: 'background-color var(--dur-2) var(--ease-out), border-color var(--dur-2) var(--ease-out)',
                }}
              >
                <button
                  type="button"
                  className="n-orbbtn"
                  onClick={() => { setVoiceId(v.id); previewVoice(v.id); }}
                  aria-label={'Escuchar una muestra de ' + v.name}
                  style={{ width: 40, height: 40, flex: 'none', alignItems: 'center', justifyContent: 'center', gap: 3, background: 'var(--accent-a10)' }}
                >
                  {previewing === v.id ? <VoiceBars heights={[12, 17, 10]} /> : <Play size={14} color="var(--accent)" />}
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceId(v.id)}
                  aria-pressed={on}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 'var(--space-2)', textAlign: 'left', background: 'none', border: 0, padding: 0,
                    cursor: 'pointer', font: 'inherit', color: 'inherit', minHeight: 'var(--hit-min)',
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontWeight: 'var(--weight-medium)', fontSize: 15, color: 'var(--text-1)' }}>{v.name}</span>
                    <span className="t-micro">{v.desc}</span>
                  </span>
                  {on && <Check size={17} />}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: 'var(--space-7)' }}>
        <h2 className="t-heading" style={{ fontSize: 16 }}>Privacidad</h2>
        <div className="n-card" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
            <span style={{ marginTop: 2, display: 'flex' }}><Lock size={15} color="var(--accent)" /></span>
            <p className="t-small" style={{ color: 'var(--text-1)' }}>
              Lo que dices se queda en este teléfono. Sin cuentas ni nube. No entrena ninguna IA y no se comparte con ninguna empresa — solo tú puedes verlo.
            </p>
          </div>

          {!confirm && !cleared && (
            <button type="button" className="n-btn n-btn--ghost n-btn--md" onClick={() => setConfirm(true)} style={{ justifyContent: 'flex-start', paddingLeft: 0 }}>
              Borrar todo mi historial
            </button>
          )}
          {confirm && (
            <>
              <p className="t-small" style={{ margin: 0 }}>¿Seguro? No hay forma de recuperarlo.</p>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button type="button" className="n-btn n-btn--secondary n-btn--md" onClick={() => { onClearHistory(); setConfirm(false); setCleared(true); }}>Sí, borrar</button>
                <button type="button" className="n-btn n-btn--ghost n-btn--md" onClick={() => setConfirm(false)}>Cancelar</button>
              </div>
            </>
          )}
          {cleared && <p className="t-small" style={{ margin: 0, color: 'var(--text-1)' }}>Listo. Empiezas de cero.</p>}
        </div>
      </section>

      <section style={{ margin: 'var(--space-7) 0 var(--space-6)' }}>
        <h2 className="t-heading" style={{ fontSize: 16 }}>Si estás pasando por algo fuerte</h2>
        <p className="t-small" style={{ marginTop: 'var(--space-3)', textWrap: 'pretty' }}>
          Nadie es un desahogo — no sustituye la ayuda profesional. Si lo que sientes te rebasa, hablar con alguien capacitado ayuda.
        </p>
        <p className="t-micro" style={{ marginTop: 'var(--space-2)' }}>{CRISIS_LINE}</p>
      </section>
    </div>
  );
}
