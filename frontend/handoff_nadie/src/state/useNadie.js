import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_MONTH, DEMO_REPLIES, DEMO_USER_LINES, VOICES } from '../data/content.js';

/* Estado único de la app. Todo vive en memoria — sin localStorage, sin cuentas.
   En producción, sustituir el guion de demo por:
     - reconocimiento de voz en el dispositivo  -> pushUserTurn(texto)
     - respuesta del modelo                     -> pushNadieTurn(texto)
   y persistir SOLO el registro de ánimo (números + fecha) en el almacenamiento
   cifrado del dispositivo. Nunca subir transcripciones. */

export function useNadie({ initialScreen = 'onboarding' } = {}) {
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

  const [month, setMonth] = useState(DEMO_MONTH);
  const [today, setToday] = useState(null); // ánimo de hoy: lo pone el usuario

  const timers = useRef([]);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

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

  /* El usuario califica su día. Solo aquí se escribe el ánimo. */
  const rateToday = useCallback((value) => { setToday(value); setRated(true); }, []);

  const clearHistory = useCallback(() => {
    setMonth(DEMO_MONTH.map(() => null));
    setToday(null);
    setTurns([]);
    setExchange(0);
    setRated(false);
  }, []);

  const monthValues = useMemo(() => [...month, today], [month, today]);
  const weekValues = useMemo(() => monthValues.slice(-7), [monthValues]);
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
      start: startSession,
      end: endSession,
    },
    mood: { weekValues, monthValues, today, rated, rateToday, clearHistory },
  };
}
