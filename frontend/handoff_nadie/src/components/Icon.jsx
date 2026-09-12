import React from 'react';

// Glifos copiados de Lucide (https://lucide.dev, licencia ISC) via lucide-static.
// Trazo redondeado, 24x24, stroke-only — el unico estilo de icono permitido en Nadie.
const GLYPHS = {
  "dog": "<path d=\"M11.25 16.25h1.5L12 17z\" /> <path d=\"M16 14v.5\" /> <path d=\"M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-4.444a13.15 13.15 0 0 0-.42-3.31\" /> <path d=\"M8 14v.5\" /> <path d=\"M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5\" />",
  "home": "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" /> <path d=\"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />",
  "mic": "<path d=\"M12 19v3\"></path> <path d=\"M19 10v2a7 7 0 0 1-14 0v-2\"></path> <rect x=\"9\" y=\"2\" width=\"6\" height=\"13\" rx=\"3\"></rect>",
  "audio-lines": "<path d=\"M2 10v3\" /> <path d=\"M6 6v11\" /> <path d=\"M10 3v18\" /> <path d=\"M14 8v7\" /> <path d=\"M18 5v13\" /> <path d=\"M22 10v3\" />",
  "lock": "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"></rect> <path d=\"M7 11V7a5 5 0 0 1 10 0v4\"></path>",
  "pause": "<rect x=\"14\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\"></rect> <rect x=\"6\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\"></rect>",
  "play": "<polygon points=\"6 3 20 12 6 21 6 3\"></polygon>",
  "square": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"></rect>",
  "x": "<path d=\"M18 6 6 18\"></path> <path d=\"m6 6 12 12\"></path>",
  "check": "<path d=\"M20 6 9 17l-5-5\"></path>",
  "chevron-left": "<path d=\"m15 18-6-6 6-6\"></path>",
  "chevron-right": "<path d=\"m9 18 6-6-6-6\"></path>",
  "trending-up": "<path d=\"M16 7h6v6\" /> <path d=\"m22 7-8.5 8.5-5-5L2 17\" />",
  "settings": "<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" />"
};

export function Icon({ name, size = 20, strokeWidth = 1.75, label, color, style, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={style}
      className={className}
      dangerouslySetInnerHTML={{ __html: GLYPHS[name] || '' }}
    />
  );
}

Icon.names = Object.keys(GLYPHS);
