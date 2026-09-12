import React from 'react';

/* Glifos sueltos usados en pantallas (Lucide, licencia ISC).
   El resto de iconos viven en Icon.jsx. */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function Lock({ size = 14, color = 'var(--text-2)' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color} style={{ flex: 'none' }}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function ChevronLeft({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function Play({ size = 16, color = 'currentColor' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color} stroke="none" aria-hidden="true">
      <polygon points="7 4 19 12 7 20 7 4" />
    </svg>
  );
}

export function Pause({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base}>
      <rect x="14" y="4" width="4" height="16" rx="1" />
      <rect x="6" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function Stop({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" stroke="none" aria-hidden="true">
      <rect width="14" height="14" x="5" y="5" rx="2" />
    </svg>
  );
}

export function Check({ size = 18, color = 'var(--accent)' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color} strokeWidth={2}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* Barras de "voz sonando" — tres barras con la animación anim-eq de foundations. */
export function VoiceBars({ heights = [14, 20, 11] }) {
  return (
    <>
      {heights.map((h, i) => (
        <span
          key={i}
          className="anim-eq"
          style={{
            width: 3,
            height: h,
            borderRadius: 'var(--radius-full)',
            background: 'var(--accent)',
            animationDelay: (i * 0.13).toFixed(2) + 's',
          }}
        />
      ))}
    </>
  );
}
