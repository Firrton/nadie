import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_MONTH, DEMO_REPLIES, DEMO_USER_LINES, VOICES } from '../data/content.js';
import { clearMoodLog, loadMoodLog, saveMoodLog } from '../lib/storage.js';
import { dateKey, entriesFromSeries, lastNDays, upsertEntry } from '../lib/moodLog.js';

/* Estado único de la app.

   La conversación vive en memoria y muere con la sesión — a propósito: las
   transcripciones no se guardan. Lo único que persiste es el REGISTRO DE ÁNIMO
   (número + fecha + nota opcional), en el dispositivo, vía lib/storage.js.

   En producción, sustituir el guion de demo por:
     - reconocimiento de voz en el dispositivo  -> pushUserTurn(texto)
     - respuesta del modelo                     -> pushNadieTurn(texto)

   `seedDemo` siembra el mes de ejemplo de content.js para poder revisar "Tu
   camino" con datos. Es opt-in explícito y ESCRIBE en el almacenamiento del
   dispositivo: no lo actives en la app real. */

const VENTANA_DIAS = 28;
const NOTA_MAX = 500;

export function useNadie({ initialScreen = 'onboarding', seedDemo = false } = {}) {
  const [screen, setScreen] = useState(initialScreen);
  const [obStep, setObStep] = useState(0);
  const [under18, setUnder18] = useState(false);
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [previewing, setPreviewing] = useState(null);

  const [convo, setConvo] = useState('idle'); // idle | listening | processing | speaking
  const [paused, setPaused] = useState(false);
  const [turns, setTurns] = useState([]);
  const [live, setLive] = useState('');
  const [exchange, setExchange] = useState(0);
  const [rated, setRated] = useState(false);

  /* El registro: mapa por fecha, leído del dispositivo una sola vez. */
  const [entries, setEntries] = useState(() => {
    const guardado = loadMoodLog();
    if (Object.keys(guardado).length > 0 || !seedDemo) return guardado;
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    return entriesFromSeries(DEMO_MONTH, ayer);
  });

  const timers = useRef([]);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // Las acciones escriben a partir del último registro sin depender de él como
  // dependencia, igual que pausedRef con `paused`.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const after = useCallback((ms, fn) => { timers.current.push(setTimeout(fn, ms)); }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => { clearTimeout(t); clearInterval(t); });
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const go = useCallback((next) => { clearTimers(); setPreviewing(null); setScreen(next); }, [clearTimers]);

  /* --- simulación de voz: escribe el texto palabra por palabra --- */
  const streamWords = useCallback((text, ms, onTick, onDone) => {
    const words = text.split(' ');
    let i = 0;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      i += 1;
      onTick(words.slice(0, i).join(' '));
      if (i >= words.length) { clearInterval(id); if (onDone) after(360, onDone); }
    }, ms);
    timers.current.push(id);
  }, [after]);

  const speakReply = useCallback(() => {
    const reply = DEMO_REPLIES[Math.min(exchange, DEMO_REPLIES.length - 1)];
    setConvo('speaking');
    setLive('');
    streamWords(reply, 120, setLive, () => {
      setTurns((t) => [...t, { who: 'nadie', text: reply }]);
      setLive('');
      setConvo('idle');
      setExchange((n) => n + 1);
    });
  }, [exchange, streamWords]);

  const stopListening = useCallback(() => {
    setConvo((c) => {
      if (c !== 'listening') return c;
      clearTimers();
      const said = live;
      if (!said) { setLive(''); return 'idle'; }
      setTurns((t) => [...t, { who: 'tú', text: said }]);
      setLive('');
      after(1000, speakReply);
      return 'processing';
    });
  }, [after, clearTimers, live, speakReply]);

  const startListening = useCallback((auto) => {
    const line = DEMO_USER_LINES[Math.min(exchange, DEMO_USER_LINES.length - 1)];
    setConvo('listening');
    setLive('');
    streamWords(line, 150, setLive, auto ? () => stopListeningRef.current() : null);
  }, [exchange, streamWords]);

  // stopListening cambia de identidad cada render; el stream necesita la última.
  const stopListeningRef = useRef(stopListening);
  stopListeningRef.current = stopListening;

  /* Camino de TEXTO. El README (§1.1 F1) pone el texto como requisito central y
     la voz como opcional, y el plan de 48h recorta la voz antes que casi todo:
     esto tiene que funcionar sin micrófono, sin permisos y sin que salga un
     byte del dispositivo. Es el nivel 1 del router, el que corre con WebLLM.

     Escribir interrumpe lo que esté pasando — clearTimers corta el guion de
     demo a mitad de camino, igual que hablarle encima a alguien. La excepción
     es mientras nadie habla: ahí la respuesta a medias se perdería. */
  const canSend = !paused && convo !== 'speaking';

  const pushUserTurn = useCallback((text) => {
    const dicho = text.trim();
    if (!dicho) return;
    clearTimers();
    setLive('');
    setTurns((t) => [...t, { who: 'tú', text: dicho }]);
    setConvo('processing');
    after(1000, speakReply);
  }, [after, clearTimers, speakReply]);

  const startSession = useCallback((heldMs) => {
    if (heldMs != null && heldMs < 250) return; // un toque corto no abre sesión
    clearTimers();
    setScreen('convo');
    setConvo('idle');
    setTurns([]);
    setLive('');
    setExchange(0);
    setPaused(false);
    setRated(false);
    after(420, () => startListening(true));
  }, [after, clearTimers, startListening]);

  const endSession = useCallback(() => {
    clearTimers();
    setConvo('idle');
    setPaused(false);
    setScreen('cierre');
  }, [clearTimers]);

  /* El usuario califica su día. Solo aquí se escribe el ánimo — la app nunca
     lo decide por él. Volver a calificar el mismo día pisa el valor anterior:
     el copy pregunta "¿cómo te sientes ahora?", así que vale la última. */
  const rateToday = useCallback((value) => {
    const next = upsertEntry(entriesRef.current, dateKey(), { value });
    setEntries(next);
    saveMoodLog(next);
    setRated(true);
  }, []);

  /* La nota es opcional y sale del usuario, no de la transcripción. Es el dato
     más sensible de la app: se guarda igual que el ánimo y se borra con él. */
  const setTodayNote = useCallback((text) => {
    const key = dateKey();
    if (!entriesRef.current[key]) return; // sin calificar no hay día que anotar
    const next = upsertEntry(entriesRef.current, key, { note: text.slice(0, NOTA_MAX) });
    setEntries(next);
    saveMoodLog(next);
  }, []);

  const clearHistory = useCallback(() => {
    setEntries({});
    clearMoodLog();
    setTurns([]);
    setExchange(0);
    setRated(false);
  }, []);

  const monthValues = useMemo(() => lastNDays(entries, VENTANA_DIAS), [entries]);
  const weekValues = useMemo(() => monthValues.slice(-7), [monthValues]);
  const todayEntry = entries[dateKey()];
  const today = todayEntry ? todayEntry.value : null;
  const todayNote = todayEntry && todayEntry.note ? todayEntry.note : '';
  const voice = VOICES.find((v) => v.id === voiceId) || VOICES[0];

  const previewVoice = useCallback((id) => {
    setPreviewing(id);
    after(2400, () => setPreviewing((cur) => (cur === id ? null : cur)));
  }, [after]);

  return {
    screen, go,
    onboarding: {
      step: obStep,
      under18,
      next: () => setObStep(1),
      back: () => { setObStep((s) => Math.max(0, s - 1)); setUnder18(false); },
      confirmAge: () => setObStep(2),
      denyAge: () => setUnder18(true),
    },
    voice, voiceId, setVoiceId, previewing, previewVoice,
    session: {
      state: paused ? 'idle' : convo,
      raw: convo,
      paused,
      turns, live, exchange,
      togglePause: () => setPaused((p) => !p),
      hold: () => { if (convo === 'idle' && !paused) startListening(false); },
      release: () => stopListening(),
      send: pushUserTurn,
      canSend,
      start: startSession,
      end: endSession,
    },
    mood: {
      weekValues, monthValues, today, todayNote, rated,
      rateToday, setTodayNote, clearHistory,
      noteMaxLength: NOTA_MAX,
    },
  };
}
