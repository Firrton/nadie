import React from 'react';
import { TalkButton } from '../components/TalkButton.jsx';
import { WeekStrip } from '../components/WeekStrip.jsx';
import { Lock } from '../components/Glyphs.jsx';
import { MOOD_DOWN, MOOD_UP } from '../lib/mood.js';

/* Pantalla principal. Tres bloques: promesa, orbe, "tu semana".
   La tira de la semana es el diferenciador frente a un chatbot genérico:
   deja ver que la app te recuerda. No moverla "abajo del fold". */

export default function Home({ weekValues, hasToday, onStart, onOpenJourney }) {
  return (
    <div className="anim-fade-up" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '0 var(--screen-pad)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 'var(--space-5)', minHeight: 'var(--hit-min)' }}>
        <span className="t-logo">nadie</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Lock />
          <span className="t-micro">cifrado</span>
        </span>
      </header>

      <div style={{ paddingTop: 'var(--space-8)' }}>
        <h1 className="t-display">Aquí nadie te juzga.</h1>
        <p className="t-small" style={{ marginTop: 'var(--space-3)' }}>Lo que digas se queda aquí. Nadie más lo escucha.</p>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6) 0', minHeight: 300 }}>
        <TalkButton size={218} onHoldEnd={onStart} />
      </div>

      <div style={{ paddingBottom: 'var(--space-4)' }}>
        <WeekStrip
          values={weekValues}
          todayIndex={6}
          upColor={MOOD_UP}
          downColor={MOOD_DOWN}
          caption={hasToday ? 'hoy ya quedó registrado' : 'hoy aún sin registro'}
          onClick={onOpenJourney}
        />
      </div>
    </div>
  );
}
