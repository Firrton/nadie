import React from 'react';
import { VoiceOrb } from './VoiceOrb.jsx';

/* Botón grande de la pantalla principal: abre la conversación.

   NO ES UN MICRÓFONO. No hay voz real todavía, así que no hay "mantener
   presionado" que signifique nada: un toque alcanza. El orbe es la puerta. */

export function TalkButton({
  size = 220,
  state,
  hint = 'Toca para empezar',
  ariaLabel = 'Empezar a escribir',
  onClick,
  disabled = false,
  style,
  className,
}) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-5)', ...style }}>
      <button
        type="button"
        className="n-orbbtn"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={onClick}
      >
        <VoiceOrb state={state} size={size} />
      </button>
      <p className="t-small" aria-hidden="true" style={{ margin: 0, color: 'var(--text-2)' }}>
        {hint}
      </p>
    </div>
  );
}