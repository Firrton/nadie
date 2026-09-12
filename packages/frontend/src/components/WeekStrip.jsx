import React from 'react';
import { MoodCurve } from './MoodCurve.jsx';

/* La tira de "tu semana" — el diferenciador en la pantalla principal.
   7 puntos de ánimo, el último resaltado. Tarjeta sobria; si recibe
   onClick, toda la tira es un botón (lleva a "Tu camino"). */

export function WeekStrip({
  values = [],
  days = ['l', 'm', 'x', 'j', 'v', 's', 'd'],
  title = 'Tu semana',
  caption,
  todayIndex,
  onClick,
  upColor,
  downColor,
  style,
  className,
}) {
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'div';
  let lastIdx = -1;
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) { lastIdx = i; break; }
  const today = todayIndex != null ? todayIndex : lastIdx;

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={'n-card' + (className ? ' ' + className : '')}
      style={{
        display: 'block',
        width: '100%',
        padding: 'var(--space-4) var(--space-5)',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        cursor: interactive ? 'pointer' : undefined,
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-2)' }}>
        <span className="t-small">{title}</span>
        {caption ? <span className="t-micro">{caption}</span> : null}
      </div>
      <MoodCurve values={values} width={310} height={54} upColor={upColor} downColor={downColor} ariaLabel="Ánimo de los últimos siete días" />
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 2px 0' }} aria-hidden="true">
        {days.map((d, i) => (
          <span
            key={i}
            className="t-micro"
            style={{ width: 14, textAlign: 'center', color: i === today ? 'var(--accent)' : 'var(--dot-inactive)' }}
          >
            {d}
          </span>
        ))}
      </div>
    </Tag>
  );
}
