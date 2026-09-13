import React from 'react';
import { useNadie } from './state/useNadie.js';
import { BottomNav } from './components/BottomNav.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Home from './screens/Home.jsx';
import Conversation from './screens/Conversation.jsx';
import Closing from './screens/Closing.jsx';
import Compartir from './screens/Compartir.jsx';
import Journey from './screens/Journey.jsx';
import Settings from './screens/Settings.jsx';

/* Shell de la app. Modo oscuro es EL modo — no hay toggle.
   El ancho se limita a 390px porque el diseño es mobile-first; en un
   dispositivo real el shell ocupa toda la pantalla. */

const NAV_SCREENS = ['home', 'camino', 'ajustes'];

export default function App({ llm, carga = null, seedDemo = false, compartir = null }) {
  const n = useNadie({ llm, seedDemo, compartir });
  const { screen } = n;
  const showNav = NAV_SCREENS.includes(screen);

  return (
    <div
      style={{
        width: '100%', maxWidth: 390, margin: '0 auto', height: '100dvh',
        background: 'var(--bg-0)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative',
        /* Las zonas seguras se aplican UNA vez, acá. Con box-sizing: border-box
           el padding se descuenta de los 100dvh, así que el área que scrollea
           se achica sola y ninguna pantalla tiene que saber del notch. El fondo
           de la nav es el mismo --bg-0 del shell, así que no se ve costura. */
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
        paddingLeft: 'var(--safe-left)',
        paddingRight: 'var(--safe-right)',
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
          carga={carga}
        />
      )}

      {screen === 'convo' && <Conversation session={n.session} />}

      {screen === 'cierre' && (
        <Closing
          exchange={n.session.exchange}
          weekValues={n.mood.weekValues}
          rated={n.mood.rated}
          onRate={n.mood.rateToday}
          propuesta={n.mood.propuesta}
          note={n.mood.todayNote}
          onNoteChange={n.mood.setTodayNote}
          noteMaxLength={n.mood.noteMaxLength}
          onHome={() => n.go('home')}
          onOpenJourney={() => n.go('camino')}
          onShare={n.compartir ? n.compartir.preparar : null}
        />
      )}

      {screen === 'compartir' && n.compartir && (
        <Compartir compartir={n.compartir} onHome={() => n.go('home')} onBack={() => n.go('cierre')} />
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
