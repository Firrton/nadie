# Handoff: Nadie — app móvil de voz

## Overview

**Nadie** es una app móvil de voz para desahogo emocional, dirigida a jóvenes
hispanohablantes de 18 a 30 años (mayoría hombres). El usuario le habla a un
compañero de voz para procesar cómo está, **califica él mismo cómo se siente** al
cerrar la sesión, y la app guarda ese registro para mostrarle cómo evoluciona en
el tiempo.

No es una app clínica ni de terapia. Es un espacio privado para decir lo que no
le cuentas a nadie.

La verdad central de la marca: *"las personas me juzgan, un chatbot no."* El
nombre entrega la promesa dos veces — "Aquí nadie te juzga" significa a la vez
"no hay nadie para juzgarte" y "la app Nadie no te juzga".

**El diferenciador frente a ChatGPT, y hay que verlo en pantalla:** Nadie te
recuerda. ChatGPT te olvida cada conversación. Por eso el registro de ánimo (la
tira "tu semana" en Home y la pantalla "Tu camino") es protagonista, no un extra.

## About the design files

Este bundle **ya es una app React funcional** (Vite), no solo documentación:
arranca, navega entre las 6 pantallas y simula una sesión de voz completa.

Aun así, trátalo como **referencia de diseño de alta fidelidad**, no como código
de producción listo para enviar:

- La conversación es un **guion simulado** (texto que aparece palabra por
  palabra). No hay micrófono, ni reconocimiento de voz, ni modelo conectado.
- El estado vive **solo en memoria**. No hay persistencia ni backend.
- No hay tests, i18n, analytics, ni manejo de errores.

Lo que sí es final y hay que respetar al integrarlo: la **jerarquía visual, los
tokens, la tipografía, el copy y los estados de interacción**.

## Fidelity

**Alta fidelidad (hifi).** Colores, tipografía, espaciado, animaciones y copy son
finales. Recréalo igual. Si tu codebase ya tiene un design system, usa sus
primitivas pero conserva los valores de `src/styles/tokens/`.

## Cómo correrlo

Este paquete es parte del monorepo. Las dependencias se instalan desde la raíz:

```bash
pnpm install
pnpm --filter @nadie/frontend dev
```

Los tests corren con `pnpm --filter @nadie/frontend test`, o con
`pnpm -r run test` desde la raíz junto con el resto de los paquetes.

Ábrelo en el inspector móvil (390 × 844). Para empezar en Home en vez del
onboarding, cambia `initialScreen` en `src/App.jsx`:

```js
const n = useNadie({ initialScreen: 'home' });
```

## Screens / views

### 1. Onboarding — `src/screens/Onboarding.jsx`

Tres pasos, con indicador de puntos abajo y flecha de volver a partir del paso 2.

**Paso 1 — la promesa.** Layout: columna centrada verticalmente, padding lateral
`--screen-pad` (20px).
- Orbe pequeño (72px) arriba.
- `p.t-title` en `--text-2`: "Hay cosas que no le cuentas a nadie."
- `h1.t-display` 40px serif: "Cuéntaselas a *nadie*." (la palabra "nadie" en
  cursiva — es la marca).
- `p.t-small`: "Una voz que te escucha sin caras, sin cuentas y sin juicio. Y que no te olvida."
- Los tres bloques entran escalonados con `anim-fade-up` y delays de **0.4s /
  1.05s / 1.6s**. Ese ritmo es intencional: se lee como una confesión, no como
  una pantalla de marketing. No lo aceleres.
- CTA primario full-width: "Pasa".

**Paso 2 — verificación de edad.** Sin fecha de nacimiento, sin datos invasivos.
- `h1.t-title`: "Antes de pasar —"
- `p.t-body.t-muted`: "esto es un espacio para adultos. ¿Tienes 18 o más?"
- Botón primario: "Sí, tengo 18 o más". Botón ghost: "Todavía no".
- Si responde "Todavía no": el texto cambia a "Este espacio es para mayores de
  18. Cuídate — y vuelve cuando los cumplas." y **desaparecen los botones**. Sin
  bloqueo agresivo, sin regaño. Puede volver con la flecha.

**Paso 3 — voz + privacidad.**
- `h1.t-title`: "La voz que te escucha" / `p.t-small`: "Este es tu espacio. Empieza cuando quieras."
- Un orbe grande (170px) al centro que **se toca para escuchar la muestra**. Cada
  voz respira a un ritmo distinto vía `--breathe-dur` (Brasa 3.6s, Niebla 4.4s,
  Cauce 2.9s) — así la diferencia entre voces se "oye" con los ojos.
- Nombre de la voz en serif 24px + descripción en `t-small`.
- Al tocar el orbe, el orbe pasa a estado `speaking` y aparece la frase de esa
  voz entre comillas latinas («») en `t-serif-quote`. Antes de tocar:
  "Tócala para escucharla".
- Tres botones-pestaña para cambiar de voz (Brasa / Niebla / Cauce). El activo
  lleva `--surface-1` + borde `--accent-a40`.
- Pie: candado + "Lo que digas se queda aquí. Nadie más lo escucha." y CTA "Entrar".

Las tres voces tienen nombres neutros a propósito — ni género ni rol. No
convertirlas en "voz masculina / femenina".

### 2. Home — `src/screens/Home.jsx` (la pantalla más importante)

Columna, tres zonas de arriba a abajo:
1. **Header**: logotipo "nadie" (serif, minúscula, `t-logo`) a la izquierda;
   candado 14px + "cifrado" (`t-micro`) a la derecha.
2. **Titular**: `h1.t-display` "Aquí nadie te juzga." + `p.t-small` "Lo que digas
   se queda aquí. Nadie más lo escucha."
3. **Orbe** (218px) centrado, `flex: 1`, `min-height: 300px`. Es el botón de
   mantener presionado; el hint "Mantén presionado para hablar" va debajo,
   dentro del componente.
4. **Tira "tu semana"** abajo: 7 puntos con mini-curva, último punto resaltado.
   Toda la tira es tocable y lleva a "Tu camino". Caption: "hoy aún sin registro"
   / "hoy ya quedó registrado".

Una pulsación menor a **250ms** no abre sesión (evita abrir por accidente).

### 3. Conversación activa — `src/screens/Conversation.jsx`

- Arriba, centrado: candado + "Esta conversación se queda aquí" (`t-micro`).
- **Transcripción** en el centro, scrolleable, `aria-live="polite"`, auto-scroll al
  final. Cada turno lleva una etiqueta `t-micro` ("tú" en `--dot-inactive`,
  "nadie" en `--accent`) y el texto:
  - usuario: sans 16px, `--text-2`
  - nadie: **serif 19px**, `--text-1`
  Esa diferencia tipográfica es lo que hace que la voz de la app se sienta como
  alguien y no como un log.
- Vacío: "Cuando quieras. Sin prisa."
- **Orbe** (148px) abajo con los 4 estados. Hint según estado: "Mantén presionado
  para hablar" / "Te escucho." / "Un momento…" / nada mientras habla / "En pausa".
- Dos controles: pausar (círculo 52px, icono pausa/play) y "Terminar" (cuadrado +
  label). Nada más — la pantalla no es un panel de control.
- "Terminar" lleva al cierre.

### 4. Cierre de sesión — `src/screens/Closing.jsx`

Aquí ocurre lo importante del modelo de producto.

- Orbe pequeño (84px) centrado, `h1.t-title` "Quedó dicho." y un resumen cálido
  de 1–2 frases (`t-body.t-muted`, max 300px). El resumen depende de cuántos
  intercambios hubo.
- **El usuario califica su día**: tarjeta "Antes de irte: ¿cómo te sientes ahora?"
  con **5 círculos de 48px** cuyo fondo va de rojo a azul (ver `RATING_STEPS`).
  Labels "abajo" / "arriba" debajo. Cada círculo tiene `aria-label` ("Muy abajo",
  "Abajo", "A medias", "Arriba", "Muy arriba").
  **La app no califica por él.** Hasta que el usuario toca un círculo, el día no
  queda registrado.
- Al calificar, la tarjeta se reemplaza por la tira de la semana con el día de hoy
  ya pintado + "Registrado. Solo tú lo ves."
- **Nota para el terapeuta** (opcional, prop `showTherapistNote`): una cita en
  serif de la sesión + "Nadie acompaña tu desahogo. No sustituye la ayuda
  profesional." Encuadra la app como complemento, nunca reemplazo.
- CTAs: "Volver al inicio" (primario) y "Ver tu camino" (ghost).

### 5. Tu camino — `src/screens/Journey.jsx`

- `h1.t-title` "Tu camino" + `t-small` "Solo tuyo. Nadie más lo ve."
- **Tarjeta de curva**: "Últimas 4 semanas" + rango de fechas en `t-micro`, y la
  curva de 28 puntos (318 × 104). Los tramos que suben van en **azul**, los que
  bajan en **rojo**.
- **Calendario** de 4 semanas, grid de 7 columnas, celdas cuadradas
  (`aspect-ratio: 1`), gap 6px, encabezados l m x j v s d. Cada día se tiñe según
  su ánimo (azul arriba / rojo abajo / `--surface-2` si es neutro / transparente
  si no hay registro). Hoy lleva borde `--accent-a55`.
  Nota: "El color de cada día sigue tu ánimo — arriba o abajo. Sin etiquetas, solo
  el registro."
- **Tarjeta de patrones** "Lo que nadie va notando": 2 observaciones calculadas de
  los datos + "Patrones que ve solo este teléfono. Nadie más."
  Los patrones se calculan **en el dispositivo** (`src/lib/journey.js`). No
  mandar ánimo ni transcripciones a un servidor para analizarlos.
- Cierre: "N momentos en 28 días. Nadie los recuerda para que tú no tengas que
  cargarlos solo."

Sin juicios de valor. Nunca "mal día", "buen día", "racha", ni medallas.

### 6. Ajustes — `src/screens/Settings.jsx`

Tres bloques (`h2.t-heading` 16px cada uno):
- **La voz que te acompaña**: las 3 voces en fila, con botón de muestra (barras
  animadas mientras suena) y check en la activa.
- **Privacidad**: candado + el texto que define el producto —
  "Lo que dices se queda en este teléfono. Sin cuentas ni nube. No entrena
  ninguna IA y no se comparte con ninguna empresa — solo tú puedes verlo."
  Debajo, "Borrar todo mi historial" → confirmación ("¿Seguro? No hay forma de
  recuperarlo.") → "Listo. Empiezas de cero."
- **Si estás pasando por algo fuerte**: invita a buscar apoyo profesional sin
  alarmar, con líneas de crisis reales (México 800 911 2000 · España 024).
  **Verificar y ampliar por país antes de lanzar.**

## Componentes reutilizables — `src/components/`

| Componente | Props principales | Notas |
|---|---|---|
| `VoiceOrb` | `state` (idle/listening/processing/speaking), `size`, `icon` | El corazón de la app. Círculos concéntricos en opacidad creciente hacia el centro — **sin blur ni glow**. El núcleo lleva el perrito (`icon="dog"`). |
| `TalkButton` | `size`, `state`, `hint`, `hintActive`, `onHoldStart`, `onHoldEnd` | Envuelve el orbe. `onHoldEnd` recibe los ms que se mantuvo presionado. Soporta ratón, touch y teclado. |
| `MoodCurve` | `values` (0..1 o null), `width`, `height`, `upColor`, `downColor` | Curva suave (Catmull-Rom). Colorea cada tramo según dirección. Salta los nulls en lugar de interpolarlos. |
| `WeekStrip` | `values`, `todayIndex`, `caption`, `onClick` | La tira "tu semana" de Home. |
| `BottomNav` | `active`, `onChange` | Home / Tu camino / Ajustes. |
| `Button` | `variant`, `size`, `fullWidth`, `icon` | O usa las clases `n-btn` directamente. |
| `Icon` | `name`, `size`, `color` | Glifos de Lucide (ISC), incluido `dog`. |
| `Glyphs` | — | Lock, ChevronLeft, Play, Pause, Stop, Check, VoiceBars. |

## Interacciones y comportamiento

- **Mantener para hablar**: `pointerdown` inicia, `pointerup` / `pointerleave`
  termina. En teclado, Space/Enter. Pulsación < 250ms se ignora en Home.
- **Respiración del orbe**: escala + opacidad, ~3s, `--breathe-dur` configurable.
- **Estados del orbe**: `idle` respira lento · `listening` pulso más marcado ·
  `processing` pulso corto y contenido · `speaking` ondas.
- **Transiciones de pantalla**: `anim-fade-up` al entrar (~`--dur-3`).
- **prefers-reduced-motion**: todas las animaciones se desactivan en
  `tokens/motion.css`. Verificar al integrar.
- **Transcripción**: aparece palabra por palabra (150ms usuario / 120ms nadie) y
  se detiene si el usuario pausa.
- **Hit targets**: mínimo 44px (`--hit-min`). Todo botón de solo icono lleva
  `aria-label`.

## State management — `src/state/useNadie.js`

Todo el estado vive en un hook. Sin librería, sin context, sin persistencia.

| Estado | Qué es |
|---|---|
| `screen` | onboarding · home · convo · cierre · camino · ajustes |
| `obStep`, `under18` | onboarding |
| `voiceId`, `previewing` | voz elegida y muestra sonando |
| `convo` | idle · listening · processing · speaking |
| `paused`, `turns`, `live`, `exchange` | sesión activa |
| `month`, `today`, `rated` | registro de ánimo (27 días + hoy) |

Flujo: `startSession(ms)` → `startListening` → `stopListening` → `speakReply` →
`endSession` → `rateToday(valor)`.

### Lo que hay que construir de verdad

1. **Voz**: reconocimiento en el dispositivo → `turns`; TTS para la respuesta.
2. **Modelo**: reemplazar `DEMO_REPLIES`. Debe escuchar y dar consejos sensatos,
   **nunca** diagnosticar, ni prometer curar, ni presentarse como profesional.
3. **Persistencia**: guardar **solo el registro de ánimo** (número + fecha) en
   almacenamiento cifrado del dispositivo. Las transcripciones no se guardan ni se
   suben. El borrado de Ajustes tiene que borrar de verdad.
4. **Patrones**: calcularlos localmente, sobre el registro de ánimo.
5. **Líneas de crisis** por país.

## Design tokens — `src/styles/`

`styles.css` importa `tokens/` (colors, typography, spacing, motion, fonts) y
`foundations/` (base + clases de componentes). `theme.css` aplica la decisión de
blanco y negro encima.

**Color**
| Token | Valor | Uso |
|---|---|---|
| `--bg-0` | `#0e0d0c` | fondo, negro cálido |
| `--surface-1` | `#1b1a18` | tarjetas, superficies |
| `--surface-2` / `--border-1` | `#2a2825` | bordes sutiles |
| `--text-1` | `#ede9e3` | texto principal, blanco roto cálido |
| `--text-2` | `#8f8a84` | texto secundario |
| `--dot-inactive` | `#5f5b56` | puntos sin registro |
| `--accent` | `#ede9e3` | orbe y elementos vivos (blanco, ver abajo) |
| `--mood-up` | `#7FA4D4` | **el ánimo cuando sube** |
| `--mood-down` | `#D26A56` | **el ánimo cuando baja** |

El design system original define el acento en **ámbar `#e9a05c`**. Producto
decidió (sept 2026) dejar la interfaz en blanco y negro y reservar el color
exclusivamente para el ánimo. `theme.css` hace ese override; borrarlo devuelve
el ámbar.

**Tipografía**
- Serif: **Instrument Serif** — logotipo "nadie" y titulares emocionales.
- Sans: **Instrument Sans** — UI, botones, cuerpo. Dos pesos: 400 y 500.
- Escala: display 34px · title 24px · body 16px · small 14px · micro 11.5px.
- Siempre sentence case. Nunca MAYÚSCULAS ni Title Case.

**Espacio y radios**: escala de 4px (`--space-1` … `--space-9`),
`--radius-s` 8px · `--radius-m` 14px · `--radius-full`. `--screen-pad` 20px.

**Movimiento**: `--dur-1` 120ms · `--dur-2` 240ms · `--dur-3` 420ms ·
`--breathe-dur` 3s. Sin rebotes, sin parpadeos.

## Voz y tono del copy

Directo, cálido, sin rodeos — como el amigo que no repite lo que le contaste.
Español neutro con tuteo (nunca voseo: "cuenta", no "contá"). Frases cortas.

**Prohibido**: "terapia", "psicólogo", "diagnóstico", "trastorno", "sanar", "tu
viaje de bienestar". Nada de emojis. Nada de iconografía clínica ni estética de
app de meditación.

**Nunca prometer** que la app cura, diagnostica o reemplaza a un profesional.
Siempre encuadrarla como espacio para desahogarse y complemento — no sustituto —
de la ayuda profesional.

## Assets

- `public/logo-nadie.png` — perrito minimalista dentro del orbe, 1024×1024, para
  foto de perfil / favicon / icono de tienda.
- **No existe logotipo dibujado.** La marca se escribe como texto: "nadie" en
  minúscula, en Instrument Serif. No crear un isotipo alterno.
- Iconos: glifos de Lucide (licencia ISC), copiados en `Icon.jsx` y `Glyphs.jsx`.
- Fuentes: Instrument Serif + Instrument Sans desde Google Fonts (ver
  `index.html`). `styles/assets/fonts/` trae Hanken Grotesk como alternativa.

## Files

```
packages/frontend/
├── README.md                     este documento
├── index.html · package.json · vite.config.js
├── public/logo-nadie.png
├── design-reference/
│   └── Nadie App.dc.html         el prototipo original (referencia visual)
└── src/
    ├── main.jsx · App.jsx        shell y router de pantallas
    ├── state/useNadie.js         todo el estado
    ├── screens/                  Onboarding · Home · Conversation · Closing · Journey · Settings
    ├── components/               VoiceOrb · TalkButton · MoodCurve · WeekStrip · BottomNav · Button · Icon · Glyphs
    ├── lib/                      mood.js · journey.js · storage.js · moodLog.js (+ tests)
    ├── data/content.js           copy, voces y datos de demo
    └── styles/                   styles.css · theme.css · tokens/ · foundations/
```

`design-reference/Nadie App.dc.html` no corre en este proyecto de Vite — es el
prototipo original, útil como referencia visual lado a lado.
