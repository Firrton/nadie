import React from 'react';
import { VoiceOrb } from '../components/VoiceOrb.jsx';
import { ChevronLeft, Lock } from '../components/Glyphs.jsx';
import { VOICES } from '../data/content.js';

/* Onboarding en 3 pasos: promesa -> 18+ -> voz + privacidad.
   El paso 1 entra escalonado (delays 0.4 / 1.05 / 1.6s) para que se lea como
   una confesión, no como una pantalla de marketing. */

export default function Onboarding({ onboarding, voiceId, setVoiceId, previewing, previewVoice, onEnter }) {
  const { step, under18 } = onboarding;
  const voice = VOICES.find((v) => v.id === voiceId) || VOICES[0];
  const playing = previewing === voice.id;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 var(--screen-pad)', overflowY: 'auto' }}>
      <div style={{ minHeight: 56, display: 'flex', alignItems: 'center', paddingTop: 'var(--space-4)' }}>
        {step > 0 && (
          <button
            type="button"
            className="n-btn n-btn--ghost n-btn--md"
            onClick={onboarding.back}
            aria-label="Volver"
            style={{ padding: '6px 10px', marginLeft: -10 }}
          >
            <ChevronLeft />
          </button>
        )}
      </div>

      {step === 0 && (
        <>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 'var(--space-8)' }}>
            <div className="anim-fade-up">
              <VoiceOrb size={72} />
            </div>
            <p className="t-title anim-fade-up" style={{ marginTop: 'var(--space-8)', color: 'var(--text-2)', animationDelay: '0.4s' }}>
              Hay cosas que no le cuentas a nadie.
            </p>
            <h1 className="t-display anim-fade-up" style={{ marginTop: 'var(--space-4)', fontSize: 40, animationDelay: '1.05s' }}>
              Cuéntaselas a <i>nadie</i>.
            </h1>
            <p className="t-small anim-fade-up" style={{ marginTop: 'var(--space-6)', animationDelay: '1.6s', textWrap: 'pretty' }}>
              Una voz que te escucha sin caras, sin cuentas y sin juicio. Y que no te olvida.
            </p>
          </div>
          <div style={{ paddingBottom: 'var(--space-4)' }}>
            <button type="button" className="n-btn n-btn--primary n-btn--lg n-btn--full" onClick={onboarding.next}>Pasa</button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div className="anim-fade-up" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 'var(--space-8)' }}>
            <h1 className="t-title">Antes de pasar —</h1>
            <p className={under18 ? 't-body' : 't-body t-muted'} style={{ marginTop: 'var(--space-3)' }}>
              {under18
                ? 'Este espacio es para mayores de 18. Cuídate — y vuelve cuando los cumplas.'
                : 'esto es un espacio para adultos. ¿Tienes 18 o más?'}
            </p>
          </div>
          {!under18 && (
            <div style={{ paddingBottom: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <button type="button" className="n-btn n-btn--primary n-btn--lg n-btn--full" onClick={onboarding.confirmAge}>Sí, tengo 18 o más</button>
              <button type="button" className="n-btn n-btn--ghost n-btn--md n-btn--full" onClick={onboarding.denyAge}>Todavía no</button>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <div className="anim-fade-up" style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 'var(--space-4)' }}>
            <h1 className="t-title" style={{ marginTop: 'var(--space-2)' }}>La voz que te escucha</h1>
            <p className="t-small" style={{ marginTop: 'var(--space-2)' }}>Este es tu espacio. Empieza cuando quieras.</p>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-5)', padding: 'var(--space-5) 0' }}>
              {/* cada voz respira a su propio ritmo — así se "oye" con los ojos */}
              <div style={{ '--breathe-dur': voice.breatheDur }}>
                <button type="button" className="n-orbbtn" onClick={() => previewVoice(voice.id)} aria-label={'Escuchar una muestra de ' + voice.name}>
                  <VoiceOrb state={playing ? 'speaking' : 'idle'} size={170} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24, lineHeight: 1.2, color: 'var(--text-1)' }}>{voice.name}</span>
                <span className="t-small">{voice.desc}</span>
              </div>

              <div style={{ minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {previewing === voice.id ? (
                  <p className="t-serif-quote anim-fade-up" style={{ margin: 0, fontSize: 18, textAlign: 'center' }}>«{voice.quote}»</p>
                ) : (
                  <span className="t-micro">Tócala para escucharla</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {VOICES.map((v) => {
                  const on = v.id === voiceId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className="n-btn n-btn--md"
                      onClick={() => setVoiceId(v.id)}
                      aria-pressed={on}
                      style={{
                        background: on ? 'var(--surface-1)' : 'transparent',
                        color: on ? 'var(--text-1)' : 'var(--text-2)',
                        borderColor: on ? 'var(--accent-a40)' : 'var(--border-1)',
                      }}
                    >
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ paddingBottom: 'var(--space-4)' }}>
            <p className="t-small" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 'var(--space-3)' }}>
              <Lock size={13} />
              Lo que digas se queda aquí. Nadie más lo escucha.
            </p>
            <button type="button" className="n-btn n-btn--primary n-btn--lg n-btn--full" onClick={onEnter}>Entrar</button>
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingBottom: 'var(--space-6)' }} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 6, height: 6, borderRadius: 'var(--radius-full)',
              background: i === step ? 'var(--accent)' : 'var(--surface-2)',
              transition: 'background-color var(--dur-2) var(--ease-out)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
