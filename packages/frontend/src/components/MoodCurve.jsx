import React from 'react';

export function MoodCurve({
  values = [], width = 320, height = 80, min = 0, max = 1,
  strokeWidth = 2, showDots = true, highlightLast = true,
  upColor = '#7FA4D4', downColor = '#D26A56', flatColor = 'var(--dot-inactive)',
  ariaLabel = 'Curva de ánimo', style, className,
}) {
  const padX = 8, padY = 11;
  const n = values.length;
  const xAt = (i) => +(n === 1 ? width / 2 : padX + (i * (width - 2 * padX)) / (n - 1)).toFixed(1);
  const yAt = (v) => +(height - padY - ((v - min) / (max - min || 1)) * (height - 2 * padY)).toFixed(1);
  const pts = values.map((v, i) => (v == null ? null : { x: xAt(i), y: yAt(v), v, i }));
  const runs = [];
  let cur = [];
  for (const p of pts) { if (p) cur.push(p); else if (cur.length) { runs.push(cur); cur = []; } }
  if (cur.length) runs.push(cur);
  const colorOf = (a, b) => (b.v > a.v ? upColor : b.v < a.v ? downColor : flatColor);
  const segs = [];
  for (const run of runs) {
    for (let i = 0; i < run.length - 1; i++) {
      const p0 = run[Math.max(0, i - 1)], p1 = run[i], p2 = run[i + 1], p3 = run[Math.min(run.length - 1, i + 2)];
      const c1x = +(p1.x + (p2.x - p0.x) / 6).toFixed(1), c1y = +(p1.y + (p2.y - p0.y) / 6).toFixed(1);
      const c2x = +(p2.x - (p3.x - p1.x) / 6).toFixed(1), c2y = +(p2.y - (p3.y - p1.y) / 6).toFixed(1);
      segs.push({ d: 'M ' + p1.x + ' ' + p1.y + ' C ' + c1x + ' ' + c1y + ', ' + c2x + ' ' + c2y + ', ' + p2.x + ' ' + p2.y, color: colorOf(p1, p2) });
    }
  }
  const dotColor = {};
  for (const run of runs) {
    run.forEach((p, k) => { dotColor[p.i] = k === 0 ? flatColor : colorOf(run[k - 1], p); });
  }
  let lastIdx = -1;
  for (let i = n - 1; i >= 0; i--) if (values[i] != null) { lastIdx = i; break; }
  return (
    <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={ariaLabel} className={className} style={{ display: 'block', width: '100%', height: 'auto', ...style }}>
      {segs.map((sg, si) => (
        <path key={si} d={sg.d} fill="none" stroke={sg.color} strokeWidth={strokeWidth} strokeLinecap="round" />
      ))}
      {showDots &&
        pts.map((p, i) => {
          if (!p) return <circle key={i} cx={xAt(i)} cy={height / 2} r={2} fill="var(--dot-inactive)" />;
          const c = dotColor[i] || flatColor;
          if (highlightLast && i === lastIdx) {
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={8} fill={c} opacity="0.18" />
                <circle cx={p.x} cy={p.y} r={4} fill={c} />
              </g>
            );
          }
          return <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={c} opacity="0.75" />;
        })}
    </svg>
  );
}
