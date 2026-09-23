# Proposal: Local crisis support in conversation

## Intent

Show human help for approved explicit danger signals in written turns. Today this depends on Qwen; exploratory smoke tests do not establish production WebLLM behavior. This is **app-level support, not clinical screening or risk assessment**.

## Scope

### In Scope

- Check each submitted text turn locally before inference against reviewed explicit signals.
- For a match, show persistent app-owned help instead of a generated reply; keep conversation usable. Settings help remains reachable without WebLLM.
- Test reviewed positive/negative examples, reply races, accessibility, and privacy using synthetic text.

### Out of Scope

- Clinical levels, R0–R4, diagnosis, indirect-language classification, or sensitivity claims.
- Memory extraction, `riskLevel`, model changes, location inference, automatic contact, sharing, or telemetry.

## Capabilities

### New Capabilities

- `crisis-support`: Deterministic, local help for reviewed explicit signals in a conversation turn.

### Modified Capabilities

- None; `openspec/specs/` has no existing behavior specs.

## Approach

Place a pure matcher in `packages/frontend/src/lib/` and call it at `useNadie` text entry. On match, invalidate in-flight replies and render stable help in `Conversation`; later model output cannot replace it. Change `CRISIS_LINE` only after geographic verification and approval. No new service, dependency, persistence, or network request.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `packages/frontend/src/lib/` | New | Matcher and colocated unit tests. |
| `packages/frontend/src/state/useNadie.js` | Modified | Pre-inference check and reply invalidation. |
| `packages/frontend/src/screens/Conversation.jsx` | Modified | Accessible, persistent support view. |
| `packages/frontend/src/data/content.js` | Modified | Approved guidance and resources only. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missed or mistaken matches | High | Reviewed fixtures; no match never implies safety. |
| Unsafe or wrong regional guidance | Medium | Qualified Spanish-speaking clinician approves signals, copy, and verified geographic resources before user-facing release; no country assumed. |
| Late model response hides help | Medium | Invalidate in-flight generations and test the race. |

## Rollback Plan

Revert matcher, state, and view together; retain Settings help. No data migration. Never release unapproved rules or resources.

## Dependencies

- Qualified Spanish-speaking clinical review and approval of signal definitions, response copy, and geographic resources before user-facing release.

## Success Criteria

- [ ] Every approved positive fixture displays help before any LLM call; every approved negative fixture avoids the alert.
- [ ] Help survives LLM failure or stale replies; conversation remains usable.
- [ ] Trigger text is not persisted, logged, transmitted, or shared; Settings help works without WebLLM.
- [ ] Clinical sign-off is recorded before release; engineering tests make no clinical-safety claim.
