import React from 'react';
import { Icon } from './Icon.jsx';

/* Navegación inferior sutil: Inicio, Tu camino, Ajustes.
   Activo en ámbar, inactivo en --dot-inactive. Sin fondos ni pastillas. */

const DEFAULT_ITEMS = [
  { id: 'home', icon: 'home', label: 'Inicio' },
  { id: 'camino', icon: 'trending-up', label: 'Tu camino' },
  { id: 'ajustes', icon: 'settings', label: 'Ajustes' },
];

export function BottomNav({ items = DEFAULT_ITEMS, active, onChange, style, className }) {
  return (
    <nav className={'n-nav' + (className ? ' ' + className : '')} style={style} aria-label="Navegación principal">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className="n-nav__item"
          aria-current={active === it.id ? 'true' : undefined}
          onClick={() => onChange && onChange(it.id)}
        >
          <Icon name={it.icon} size={22} strokeWidth={active === it.id ? 2 : 1.75} />
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
