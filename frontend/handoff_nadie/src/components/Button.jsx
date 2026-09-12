import React from 'react';
import { Icon } from './Icon.jsx';

/* Botón de Nadie. Píldora plana, sin sombras.
   primary = ámbar con texto oscuro · secondary = superficie con borde ·
   ghost = solo texto muted. Sentence case siempre. */

export function Button({ variant = 'primary', size = 'md', fullWidth = false, icon, iconRight, children, className, ...rest }) {
  const cls = ['n-btn', 'n-btn--' + variant, 'n-btn--' + size, fullWidth ? 'n-btn--full' : null, className]
    .filter(Boolean)
    .join(' ');
  const iconSize = size === 'lg' ? 20 : 18;
  return (
    <button type="button" className={cls} {...rest}>
      {icon ? <Icon name={icon} size={iconSize} /> : null}
      {children != null ? <span>{children}</span> : null}
      {iconRight ? <Icon name={iconRight} size={iconSize} /> : null}
    </button>
  );
}
