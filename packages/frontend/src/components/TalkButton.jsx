import React, { useRef, useState } from 'react';
import { VoiceOrb } from './VoiceOrb.jsx';

/* Botón de "mantener presionado para hablar". Envuelve el orbe con la
   interacción de mantener (pointer + teclado: espacio/enter sostenido). */

export function TalkButton({
  size = 220,
  state,
  hint = 'Mantén presionado para hablar',
  hintActive = 'Te escucho.',
  ariaLabel = 'Mantén presionado para hablar',
  onHoldStart,
  onHoldEnd,
  disabled = false,
  style,
  className,
}) {
  const [holding, setHolding] = useState(false);
  const t0 = useRef(0);

  const start = () => {
    if (disabled || holding) return;
    setHolding(true);
    t0.current = Date.now();
    if (onHoldStart) onHoldStart();
  };
  const end = () => {
    if (!holding) return;
    setHolding(false);
    if (onHoldEnd) onHoldEnd(Date.now() - t0.current);
  };

  const orbState = state != null ? state : holding ? 'listening' : 'idle';
  const active = holding || orbState === 'listening';

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-5)', ...style }}>
      <button
        type="button"
        className="n-orbbtn"
        aria-label={ariaLabel}
        disabled={disabled}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          start();
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            end();
          }
        }}
        onBlur={end}
      >
        <VoiceOrb state={orbState} size={size} />
      </button>
      <p
        className="t-small"
        aria-hidden="true"
        style={{ margin: 0, transition: 'color var(--dur-2) var(--ease-out)', color: active ? 'var(--text-1)' : 'var(--text-2)' }}
      >
        {active ? hintActive : hint}
      </p>
    </div>
  );
}
