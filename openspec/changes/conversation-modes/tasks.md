# Tasks: conversation-modes

Review budget: ~400 changed lines of product code (`src/lib/llm`, `src/data`); the bench tooling and research files are dev-only.

## 1. Mode selection

- [x] 1.1 RED: `modos.test.js` — venting, requests, refusal wins, last-message-only requests, health requests, sticky crisis, hyperbole, accents and case.
- [x] 1.2 GREEN: `modos.js` — `MODOS`, `elegirModo`, signal lists on normalized text.
- [x] 1.3 Check the 46 evaluation scenarios route to their expected mode.

## 2. Medication safeguard

- [x] 2.1 RED: `salvaguardas.test.js` — doses always fail, names fail unless the person said them, "te" vs "té".
- [x] 2.2 GREEN: `salvaguardas.js` — `normalizar`, `mencionaSustancia`, `nombraMedicamento`.

## 3. Prompts, trimming and extraction prompt

- [x] 3.1 RED: `webllm.test.js` — prompt per mode, only the mode's example, short Spanish prompts, crisis without phone numbers, trimming, mode chosen before trimming, extraction system prompt.
- [x] 3.2 GREEN: `prompt.js` — `PROMPTS`, `SISTEMA`, `SISTEMA_EXTRACCION`, `PRESUPUESTO_HISTORIAL`, `armarMensajes(mensajes, contexto, modo)`.
- [x] 3.3 GREEN: `content.js` — `modo` on each example, `LINEA_DE_LIMITE`.

## 4. Adapter

- [x] 4.1 RED: regenerate once on a medication, boundary line on the second, echo accepted; timeout calls `interruptGenerate`.
- [x] 4.2 GREEN: `webllm.js` — safeguard loop in `chat`, `conTimeout(…, alVencer)`.

## 4b. Measured additions

- [x] 4b.1 RED/GREEN: `cumpleCrisis` + `LINEA_DE_CRISIS`, regenerate once in crisis mode.
- [x] 4b.2 RED/GREEN: warning signs in the crisis lexicon (burden, goodbye letters, giving things away).
- [x] 4b.3 RED/GREEN: `<think>` stripped in chat and extraction, `apagarRazonamiento` per rung, `top_p` 0.8.
- [x] 4b.4 RED/GREEN: Qwen3-1.7B as default rung, Qwen2.5-1.5B as `intermedio`.
- [x] 4b.5 Research harness counts the few-shot actually sent (one pair per mode).

## 5. Evaluation in the real runtime

- [x] 5.1 `banco/main.js` scenario API, `banco/escenarios.mjs` headless runner, `banco/puntuar.mjs` scorer.
- [x] 5.2 Scenarios and extraction transcripts in `research/model-evaluation/modes/`.
- [x] 5.3 Baseline run on `02fc7ca` (k=3).
- [x] 5.4 Modes run (k=3); iterate on wording one change at a time; blind reading.
- [~] 5.5 Temperature check — not run: the few-shot and crisis-prompt experiments took priority; left as follow-up.
- [x] 5.6 Model A/B with the frozen prompts: Qwen2.5-1.5B vs Qwen3-1.7B vs Qwen3.5-2B (`enable_thinking: false`).
- [x] 5.7 Report in `research/model-evaluation/modes/README.md` with numbers, failures and limits.

## 5b. Adversarial review rounds

- [x] 5b.1 Round 1 (fresh context, 2 lenses + verifier per finding): 14 confirmed, all fixed with RED/GREEN; re-check: 11 fixed, 3 partial.
- [x] 5b.2 Round 2: 14 more confirmed (past-tense overdose, methods, sustained crisis, texting spellings, "un te quiero", refusals read as doctor role, oversized messages); all fixed with RED/GREEN.
- [x] 5b.3 Round 3: sustained crisis strict until the person says they are safe, `seguimiento` mode, no-promise check, per-mode fixed lines, dose echo only in crisis.
- [x] 5b.4 Round 4: stricter "safe" detection, follow-up sticks until a new signal, false alarms anchored, two diagnosis bypasses closed.
- [x] 5b.5 Blind judging of base vs finals (three rounds; two with 2 judges per item, kappa 0.81–0.85).

## 6. Close

- [x] 6.1 Frontend tests (391) and research harness (5) green; frontend build and dist network audit green.
- [x] 6.2 Fresh-context review of the diff (two rounds, see 5b).
