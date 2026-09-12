import React, { useEffect, useRef } from 'react';
import { TalkButton } from '../components/TalkButton.jsx';
import { Lock, Pause, Play, Stop } from '../components/Glyphs.jsx';

/* Conversación activa. El orbe lleva el estado (idle / listening / processing /
   speaking); la transcripción es secundaria y va en tipografía distinta según
   quién habla: sans para el usuario, serif para nadie. */

export default function Conversation({ session }) {
  const scroller = useRef(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.turns, session.live]);

  const hint = session.paused
    ? 'En pausa'
    : session.raw === 'processing'
      ? 'Un momento…'
      : session.raw === 'speaking'
        ? ''
        : 'Mantén presionado para hablar';

  const speaking = session.raw === 'speaking';
  const empty = session.turns.length === 0 && !session.live;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-5) var(--screen-pad) var(--space-2)' }}>
        <span className="t-micro" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Lock size={12} />
          Esta conversación se queda aquí
        </span>
      </div>

      <div
        ref={scroller}
        aria-live="polite"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-4) var(--screen-pad)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
      >
        {empty && <p className="t-small" style={{ textAlign: 'center', marginTop: 'var(--space-7)' }}>Cuando quieras. Sin prisa.</p>}

        {session.turns.map((t, i) => (
          <Turn key={i} who={t.who} text={t.text} />
        ))}

        {session.live && <Turn who={speaking ? 'nadie' : 'tú'} text={session.live} live />}
      </div>

      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-3) var(--screen-pad) var(--space-6)' }}>
        <TalkButton
          size={148}
          state={session.state}
          hint={hint}
          hintActive="Te escucho."
          onHoldStart={session.hold}
          onHoldEnd={session.release}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            type="button"
            className="n-btn n-btn--secondary"
            onClick={session.togglePause}
            aria-label={session.paused ? 'Reanudar' : 'Pausar'}
            style={{ width: 52, height: 52, padding: 0, borderRadius: 'var(--radius-full)' }}
          >
            {session.paused ? <Play size={18} /> : <Pause />}
          </button>
          <button type="button" className="n-btn n-btn--secondary n-btn--md" onClick={session.end}>
            <Stop />
            <span>Terminar</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Turn({ who, text, live }) {
  const isNadie = who === 'nadie';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="t-micro" style={{ color: isNadie ? 'var(--accent)' : 'var(--dot-inactive)' }}>{who}</span>
      <p
        style={{
          margin: 0,
          fontFamily: isNadie ? 'var(--font-serif)' : 'var(--font-sans)',
          fontSize: isNadie ? 19 : 16,
          lineHeight: 1.5,
          color: live || isNadie ? 'var(--text-1)' : 'var(--text-2)',
          textWrap: 'pretty',
        }}
      >
        {text}
      </p>
    </div>
  );
}
