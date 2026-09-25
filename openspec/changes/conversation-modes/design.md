# Design: conversation-modes

## Decisions

### 1. The code chooses the mode; the model only answers

`elegirModo(mensajes)` (`src/lib/llm/modos.js`) is a pure function over the conversation, called by `armarMensajes` by default. Signal lists are matched on text normalized without accents or case, because people type "que hago" and "quitarme la vida".

| Mode | When | Scope of the check |
|---|---|---|
| `crisis` | explicit or passive self-harm / not-wanting-to-live signals | **every** user message (sticky: after a signal, the talk is no longer ordinary venting) |
| `limite` | asks for a diagnosis, medication, dose, remedy or treatment change | last user message |
| `escuchar` (refusal) | refuses advice ("no quiero consejos", "solo quiero desahogarme") | last user message |
| `pensar` | explicit request ("¿qué hago?", "¿me ayudas a pensarlo?", "dame ideas") | last user message |
| `escuchar` | everything else | — |

Hyperboles ("me quiero morir de la vergüenza") are removed before looking for crisis signals, so they never hide a real signal in the same message. For crisis, sensitivity wins over specificity: a false positive asks whether the person is safe; a false negative suggested "enfocarte en algo positivo" in the smoke runs.

**Rejected:** letting the model classify the turn first (two inferences per turn, and the classifier would be the same 1.5B that failed); a mode toggle in the UI (no requirement, needs design work).

### 2. One short procedure per mode

Each prompt is a numbered procedure in neutral Spanish with tuteo, in positive form, 110–150 tokens (Qwen2.5 tokenizer), versus 518 for the current prompt. The identity line is "una inteligencia artificial que acompaña…": naming the model "Nadie" made small models call the *person* Nadie (`nadie-ab-modelos-resultado`), and "Nadie" is also a common pronoun in the person's own words.

Few-shot examples carry a `modo` tag in `content.js`; only the example of the chosen mode is sent. `limite` and `crisis` get no example: writing crisis copy as a demo would need clinical review.

The crisis prompt forbids phone numbers: the model does not know the country and an invented number is worse than none. Real resources are the job of `crisis-detector`.

### 3. Extraction gets its own system prompt

`armarMensajesDeExtraccion` sends a 46-token extraction system prompt instead of the conversation persona. The JSON shape is already enforced by the schema-constrained decoder; the persona prompt only cost context (518 tokens) that a long transcript needs.

### 4. The medication rule lives in code

`nombraMedicamento(respuesta, dichoPorLaPersona)` (`src/lib/llm/salvaguardas.js`): a dose never passes; a medication or remedy name passes only if the person already said it (reflecting is listening; proposing is prescribing). In `chat`, a failing reply is regenerated once; a second failure returns `LINEA_DE_LIMITE` from `content.js`. The list is lexical and incomplete by nature: it is a backstop, not a guarantee, and it is measured in every run.

### 5. Trimming by characters, measured

WebLLM does not expose the tokenizer before generating, so the history budget is in characters. Measured on Qwen2.5: Spanish averages ~3.4 characters per token. Budget: 4096 context − 220 reply − ≤ 400 system and few-shot → ~3400 tokens; at a conservative 3.0 chars/token → **9000 characters** of history. The oldest turns go first, the history always starts with a user turn, and the last user message is always kept. The mode is chosen before trimming, so a crisis signal that scrolled out still holds.

### 6. Timeout interrupts

`conTimeout` receives an `alVencer` callback; the adapter passes `motor.interruptGenerate()` so a stuck generation does not hold WebLLM's lock and time out the next turn too.

### 7. What the measurements changed (2026-09-24)

- **The listening prompt went through three versions.** The numbered procedure (v1) made the 1.5B skip the reflection and ask two questions (36/66 replies). Prose with sentence starters ("Suena a que…", "Te dolió que…") and "sin dudar de lo que siente" fixed most of it. Qwen3-1.7B then repeated the person's words in first person as if it were the person (12/66); "hablándole de tú y sin copiar sus frases" took that to 0/66.
- **The crisis backstop line left the listening prompt.** It leaked into ordinary venting ("¿estás a salvo de los comentarios…?") and worked in 1 of 12 indirect cases.
- **Crisis replies are verified in code**, like medications: `cumpleCrisis` requires a *question* about safety (the 1.5B *asserted* "Estás a salvo"), human help, no phone numbers and no minimizing. A failing reply is regenerated once, then `LINEA_DE_CRISIS` is returned.
- **Textbook warning signs joined the crisis lexicon** (feeling like a burden, goodbye letters, giving belongings away, "más fácil no estar"). On six new phrasings written afterwards, the lexicon caught **none** — and "¿cuántas pastillas hacen falta?" routes to `limite`. A lexicon does not generalize; that is the job of `crisis-detector`, with a clinician and a real classifier.
- **The default model changed to Qwen3-1.7B.** Same prompts, same 138 cases, WebLLM real: crisis on the first attempt 78% (Qwen2.5-1.5B: 11%), boundary mode 78% (11%), no medication on any first attempt, same median latency (~1.0 s). It costs 2037 MB of VRAM against 1630; Qwen2.5-1.5B stays as the `intermedio` rung, so no device that ran a model before loses it. Qwen3.5-2B came second (crisis 56%, pensar 33%, 2245 MB).
- **The few-shot examples stay, one per mode.** They leak content ("jefe", "mamá") into unrelated conversations, but removing them was worse: Qwen3-1.7B went back to speaking as the person in first person in 33/66 listening replies (0/66 with the example) and `pensar` fell from 38% to 21%.
- **The crisis prompt is written as the reply itself** ("Le respondes… parecidas a estas: «Lo que me cuentas es importante…»"). Described in third person, Qwen3 copied the description ("Lo que te contó es importante", "Pide que hable ya…"). As direct speech, 15 of 18 first attempts pass `cumpleCrisis`.
- **Qwen3 needs two adapter changes:** `extra_body.enable_thinking: false` (declared per rung as `apagarRazonamiento`) and stripping the `<think>` block it still emits — without it, 0/9 extractions parsed. `top_p` is passed as 0.8 (Qwen's recommendation and what the bench measured); otherwise each model used its own config (Qwen3.5: 1.0).

### 8. What three adversarial review rounds changed (2026-09-24/25)

Each round: fresh-context reviewers with distinct lenses, one skeptic per finding trying to refute it, fixes with RED/GREEN, then a re-check of every finding.

- **A fifth mode, `seguimiento`.** After a crisis signal the conversation stays sticky, but when the person says they are safe or accompanied (and does not deny it), the mode becomes `seguimiento`: a short prompt that acknowledges it, asks how they feel and reminds them to seek help if it comes back. With the crisis prompt in that state, Qwen3 answered "Te acompañaré siempre", "Te cuidaré".
- **Crisis stays strict until the person says they are safe.** "No, no estoy a salvo" or "ya tengo las pastillas en la mano" after the crisis line must still ask about safety and point to human help; an intermediate version that relaxed the check after the first turn let an ordinary reply through.
- **No promises, in every mode** (`prometeDeMas`): "siempre voy a estar", "te cuidaré", "todo va a estar bien".
- **Fixed lines per mode**: `LINEA_DE_CRISIS`, `LINEA_DE_SEGUIMIENTO`, `LINEA_DE_LIMITE` (valid for diagnosis and medication questions) and a neutral `LINEA_DE_ESCUCHA`. Nobody who did not ask about medication is told "de medicamentos no te puedo hablar".
- **In crisis and seguimiento, a model error returns the fixed line** instead of an error or silence.
- **Doses:** echoing the dose the person said is allowed only in crisis ("si tomaste 20 pastillas, llama a emergencias"); elsewhere it is an instruction and never passes.
- **Boundary mode checks the reply for diagnosis and doctor role-play** (`haceDeMedico`), with the model's own refusals ("no puedo recomendarte…", up to a "pero") removed first, and only affirmative diagnostic forms counted.
- **Text is normalized like people type on a phone:** double spaces, stretched letters, "kiero"/"qiero".
- **The lexicon grew** (past-tense and in-progress overdose, methods, conjugated hyperboles, first-person medication changes, imperative and voseo health requests) with anchors against the false positives the reviewers found ("2 pastillas para la migraña", "tirarme al piso a llorar", "cuando no esté tan cansada").
- **Messages longer than half the budget keep their tail**, so a pasted wall of text cannot overflow the window or push the person's last words out of an extraction.

## Evaluation

- **Runtime:** the real one. `banco/escenarios.mjs` drives Chrome headless with WebGPU (Metal) through Playwright, loads the local q4f16_1 weights and calls the production `puerto.chat` / `puerto.extract`; a Proxy on the engine records every raw request (system prompt hash, raw text, usage, latency).
- **Scenarios:** `research/model-evaluation/modes/scenarios.jsonl`, 46 synthetic conversations in 7 groups (escuchar 12, negativa 6, pensar 8, limite 6, crisis 6, hipérbole 4, indirecta 4), none copied from the few-shot examples. Plus 3 transcripts × 3 schemas for extraction.
- **k = 3** per scenario at production temperature (0.7). Baseline = `02fc7ca` (current prompt), same scenarios, same runner.
- **Scoring:** `banco/puntuar.mjs`, lexical rules per group plus a hard gate (medication, advice after refusal, crisis without human help, invented phone numbers, diagnosis claims). A blind reading of the responses (variant labels removed) judges quality.
- **One variable at a time:** prompt first; then temperature; then model (Qwen3-1.7B and Qwen3.5-2B, `enable_thinking: false`) with the frozen prompts.
