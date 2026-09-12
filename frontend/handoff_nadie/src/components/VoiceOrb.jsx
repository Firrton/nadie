import React from 'react';
import { Icon } from './Icon.jsx';

/* El orbe de voz — el corazón de Nadie. Círculos concéntricos de ámbar con
   opacidad creciente hacia el centro (resplandor suave SIN blur ni glow).
   Estados: idle (respira ~3s) · listening (respira hondo + ondas) ·
   processing (puntos) · speaking (barras de voz). */

const RINGS = [
  { d: 1.0, bg: 'var(--accent-a06)' },
  { d: 0.8, bg: 'var(--accent-a10)' },
  { d: 0.62, bg: 'var(--accent-a16)' },
  { d: 0.46, bg: 'var(--accent-a26)' },
];
const CORE = 0.32;

function layer(w) {
  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: w,
    height: w,
    borderRadius: 'var(--radius-full)',
  };
}

export function VoiceOrb({ state = 'idle', size = 200, icon = 'dog', label, className, style }) {
  const coreSize = Math.round(size * CORE);
  const wrapperAnim =
    state === 'idle' ? 'anim-breathe' : state === 'listening' ? 'anim-breathe-deep' : state === 'speaking' ? 'anim-breathe' : '';

  return (
    <div
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ position: 'relative', width: size, height: size, flex: 'none', ...style }}
    >
      {state === 'listening' && (
        <React.Fragment>
          <div className="anim-ripple" style={{ position: 'absolute', inset: 0, borderRadius: 'var(--radius-full)', border: '1px solid var(--accent-a40)' }}></div>
          <div className="anim-ripple" style={{ position: 'absolute', inset: 0, borderRadius: 'var(--radius-full)', border: '1px solid var(--accent-a26)', animationDelay: '0.95s' }}></div>
        </React.Fragment>
      )}

      <div className={wrapperAnim} style={{ position: 'absolute', inset: 0 }}>
        {RINGS.map((r, i) => (
          <div
            key={i}
            className={state === 'speaking' ? 'anim-pulse-soft' : undefined}
            style={{ ...layer(Math.round(size * r.d)), background: r.bg, animationDelay: state === 'speaking' ? i * 0.14 + 's' : undefined }}
          ></div>
        ))}

        <div
          className={state === 'processing' ? 'anim-pulse-soft' : undefined}
          style={{ ...layer(coreSize), background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: Math.max(3, Math.round(coreSize * 0.07)) }}
        >
          {(state === 'idle' || state === 'listening') && (
            <Icon name={icon} size={Math.round(coreSize * 0.5)} strokeWidth={1.75} color="var(--text-on-accent)" />
          )}
          {state === 'processing' &&
            [0, 1, 2].map((i) => (
              <span
                key={i}
                className="anim-dot"
                style={{ width: Math.max(5, Math.round(coreSize * 0.09)), height: Math.max(5, Math.round(coreSize * 0.09)), borderRadius: 'var(--radius-full)', background: 'var(--text-on-accent)', animationDelay: i * 0.18 + 's' }}
              ></span>
            ))}
          {state === 'speaking' &&
            [0.55, 1, 0.75, 0.4].map((h, i) => (
              <span
                key={i}
                className="anim-eq"
                style={{ width: Math.max(3, Math.round(coreSize * 0.055)), height: Math.round(coreSize * 0.42 * h), borderRadius: 'var(--radius-full)', background: 'var(--text-on-accent)', animationDelay: i * 0.13 + 's' }}
              ></span>
            ))}
        </div>
      </div>
    </div>
  );
}
