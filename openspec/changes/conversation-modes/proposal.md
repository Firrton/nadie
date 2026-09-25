# Proposal: Conversation modes for the local model

## Intent

Make Qwen2.5-1.5B good at the one job Nadie gives it: listen first, help think only when asked, and hold the safety limits — through prompt engineering, before any fine-tuning.

**Why now (measured on `02fc7ca`, 2026-09-24):**

- The system prompt is not too long in tokens. With the Qwen2.5 tokenizer the current English prompt is **518 tokens** and the previous Spanish one was **535**; the first turn uses 802 of 4096. What grew is the **load**: from a 3-step procedure in 23 lines to 7 sections of abstract principles in 43 lines with ~15 negations.
- The same pattern was measured before: on 2026-09-12, replacing a list of prohibitions with a positive procedure moved off-role replies from 9/9 to 1/9 with the same model (`cf74102`). The model swap moved 1 case.
- The 2026-09-21 trial (WebLLM, q4f16_1) scored 0/6 acceptable: the model gave advice after "no quiero que me armes un plan". Its own next step proposes brief modes selected outside the model (`research/model-evaluation/2026-09-21-qwen2.5-few-shot-trial.md:222-232`).
- `88869ca` removed "Nunca nombras un medicamento, una dosis ni un remedio casero" and "Hablas español neutro"; `b94fbce` removed their tests.

## Scope

### In Scope

- A pure, local mode selector over the conversation: `escuchar` (default), `pensar` (explicit request for ideas or help deciding), `limite` (asks for diagnosis, medication or treatment), `crisis` (explicit or passive signals of self-harm or not wanting to live; sticky for the session).
- One short Spanish prompt per mode, procedural and positive, each with a single job; few-shot only for the mode it teaches.
- A short system prompt of its own for extraction (`checkin`, `memory`, `share-summary`).
- Restore the medication safeguard as code: a reply that names a dose, or a medication or remedy the person did not mention, is regenerated once and otherwise replaced by a fixed boundary line.
- Verify crisis replies the same way: a question about safety, human help, no phone numbers, no minimizing; otherwise regenerate once, then a fixed crisis line.
- Keep the conversation inside the 4096-token window by trimming the oldest turns (the mode is chosen on the full conversation first).
- On timeout, interrupt the generation so the engine is free for the next turn.
- An evaluation in the real runtime (WebLLM 0.2.85, q4f16_1, headless Chromium) with versioned scenarios and JSONL results; baseline vs modes; then a model A/B with the final prompts.

### Out of Scope

- Fine-tuning, LoRA, DPO or distillation.
- App-owned crisis help, `CRISIS_LINE` changes and UI: that is `openspec/changes/crisis-detector`, which runs before this selector when it lands. The `crisis` mode is a model-side backstop, not clinical screening.
- Memory injection (`contexto` stays `[]` in `useNadie`), UI for choosing a mode, voice.
- ~~Changing the model ladder~~ — **brought into scope by the measurement:** the A/B showed a clear winner (Qwen3-1.7B). It needs more VRAM (2037 MB vs 1630), so Qwen2.5-1.5B stays as an intermediate rung and no device that ran a model before loses it.

## Capabilities

### New Capabilities

- `conversation-modes`: choose how the local model answers each turn, keep its limits in code, and fit the context window.

### Modified Capabilities

- None; `openspec/specs/` has no existing behavior specs.

## Approach

`elegirModo(mensajes)` in `packages/frontend/src/lib/llm/modos.js`; `armarMensajes(mensajes, contexto, modo = elegirModo(mensajes))` in `prompt.js` keeps its signature, so `webllm.js`, `useNadie.js` and the research harness keep working. The medication check lives in `salvaguardas.js` and runs in the adapter (`webllm.js`), which already translates between what the model does and what the contract requires.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `packages/frontend/src/lib/llm/modos.js` | New | Mode selector and its signal lists. |
| `packages/frontend/src/lib/llm/salvaguardas.js` | New | Medication and dose check on replies. |
| `packages/frontend/src/lib/llm/prompt.js` | Modified | Prompts per mode, extraction prompt, trimming. |
| `packages/frontend/src/lib/llm/webllm.js` | Modified | Safeguards + retry in `chat`, interrupt on timeout, `top_p`, Qwen3 reasoning off and `<think>` stripped. |
| `packages/frontend/src/lib/llm/modelos.js` | Modified | Qwen3-1.7B as default rung; Qwen2.5-1.5B becomes `intermedio`. |
| `packages/frontend/src/data/content.js` | Modified | Mode tag on few-shot examples; boundary line. |
| `research/model-evaluation/` | New files | Scenarios, runner, results and report. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Selector misroutes a turn | Medium | Misroutes fall to `escuchar`, the safe default; fixtures for hyperbole ("me quiero morir de la vergüenza") and plain venting. |
| Crisis signals are not clinically reviewed | High | Documented as a backstop; same clinical review as `crisis-detector` before release; sensitivity over specificity. |
| Shorter prompts lose a behavior the long one had | Medium | Paired evaluation on the same scenarios, same seeds and params; one variable at a time. |
| Results do not transfer between runtimes | Medium | Decisions are made only on WebLLM q4f16_1, the artifact users get. |

## Rollback Plan

Revert `modos.js`, `salvaguardas.js`, `prompt.js`, `webllm.js` and `content.js` together. No persisted data or formats change.

## Dependencies

- Clinical review of the `crisis` and `limite` signal lists and of the fixed boundary line before a user-facing release.

## Success Criteria

- [ ] Zero replies with a medication, dose or remedy the person did not mention, across all runs.
- [ ] Zero advice after an explicit refusal (the trial's blocking failure).
- [ ] Every `crisis` scenario reply asks about safety and points to human help, with no invented phone numbers.
- [ ] Measured improvement over the baseline on the listening and help-to-think scenarios, reported with k repetitions per scenario.
