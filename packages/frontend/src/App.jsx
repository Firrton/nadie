import React from 'react';
import { useNadie } from './state/useNadie.js';
import { BottomNav } from './components/BottomNav.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Home from './screens/Home.jsx';
import Conversation from './screens/Conversation.jsx';
import Closing from './screens/Closing.jsx';
import Journey from './screens/Journey.jsx';
import Settings from './screens/Settings.jsx';

/* Shell de la app. Modo oscuro es EL modo — no hay toggle.
   El ancho se limita a 390px porque el diseño es mobile-first; en un
   dispositivo real el shell ocupa toda la pantalla. */

const NAV_SCREENS = ['home', 'camino', 'ajustes'];

export default function App() {
  const n = useNadie();
  const { screen } = n;
  const showNav = NAV_SCREENS.includes(screen);

  return (
    <div
      style={{
        width: '100%', maxWidth: 390, margin: '0 auto', height: '100dvh',
        background: 'var(--bg-0)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative',
      }}
    >
      {screen === 'onboarding' && (
        <Onboarding
          onboarding={n.onboarding}
          voiceId={n.voiceId}
          setVoiceId={n.setVoiceId}
          previewing={n.previewing}
          previewVoice={n.previewVoice}
          onEnter={() => n.go('home')}
        />
      )}

      {screen === 'home' && (
        <Home
          weekValues={n.mood.weekValues}
          hasToday={n.mood.today != null}
          onStart={n.session.start}
          onOpenJourney={() => n.go('camino')}
        />
      )}

      {screen === 'convo' && <Conversation session={n.session} />}

      {screen === 'cierre' && (
        <Closing
          exchange={n.session.exchange}
          weekValues={n.mood.weekValues}
          rated={n.mood.rated}
          onRate={n.mood.rateToday}
          note={n.mood.todayNote}
          onNoteChange={n.mood.setTodayNote}
          noteMaxLength={n.mood.noteMaxLength}
          onHome={() => n.go('home')}
          onOpenJourney={() => n.go('camino')}
        />
      )}

      {screen === 'camino' && <Journey monthValues={n.mood.monthValues} />}

      {screen === 'ajustes' && (
        <Settings
          voiceId={n.voiceId}
          setVoiceId={n.setVoiceId}
          previewing={n.previewing}
          previewVoice={n.previewVoice}
          onClearHistory={n.mood.clearHistory}
        />
      )}

      {showNav && <BottomNav active={screen} onChange={(id) => n.go(id)} />}
    </div>
  );
}
