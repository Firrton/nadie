# Nadie — Technical Documentation

EAG Global Buildathon · Cochabamba, Bolivia · September 11–13, 2026

This document describes what is **built and running**. The pre-event design, which is broader, is in [ARQUITECTURA.MD](ARQUITECTURA.MD) (Spanish). Anything from that design that is not built is listed in the [roadmap](#6-roadmap), not described as done.

---

## 1. Selected track

**Track 02 — Local AI, Private AI & User-Owned Data.**

Nadie is an emotional companion for people who want to talk about what weighs on them without handing their words to a cloud provider. The track asks for AI that runs where the person is, and for data the person owns and controls. Nadie answers both:

| Track mechanism | How Nadie uses it | Status |
|---|---|---|
| Local-first software | The language model runs in the browser (WebLLM over WebGPU). Conversation, mood log and charts never leave the device | Built |
| Encrypted storage / E2E encryption | Shared packages are encrypted on the device to the psychologist's key (HPKE X25519 + AES-256-GCM); the server only holds ciphertext | Built |
| Ethereum as the authority on access | EIP-712 consent, professional credentials and first-opening records on HashKey Chain Testnet | Built |
| TEE with attestation | Fallback inference for devices without a capable GPU | Roadmap |
| ZK / zkTLS | Anonymous session vouchers; license verification against the health ministry | Roadmap |
| FHE, MPC | Deliberately not used: LLM inference over FHE is impractical today, and splitting a key among parties does not address this threat model | Discarded |

The contracts are deployed on **HashKey Chain Testnet (chain ID 133)**.

## 2. Principles

1. **Local first.** The model and the person's data live on the device.
2. **2-of-2.** The AI prepares; nothing leaves without the person reading it and signing.
3. **The chain is the notary, not the vault.** On-chain: consents, hashes of ciphertext, credentials, first openings. Never content, not even encrypted.
4. **The person is pseudonymous; the professional is identified.** The person has no email, phone or account; the psychologist has a public, verified credential.
5. **Accompany, don't treat.** No diagnoses, no clinical language.

## 3. Core architecture

```
┌──────────────── Person's browser (packages/frontend) ────────────────┐
│ Screens ─▶ useNadie (state) ─▶ ports                                  │
│   · LLMPort ─────────▶ WebLLM adapter (Qwen2.5-1.5B, WebGPU)          │
│   · mood log ────────▶ localStorage                                   │
│   · sharing ─────────▶ @nadie/core encryptPackage + viem EIP-712      │
└──────────┬──────────────────────────────────┬─────────────────────────┘
           │ PUT ciphertext                   │ POST signed Grant
           ▼                                  ▼
┌──────────────────────┐          ┌──────────────────────┐
│ gateway (Hono)       │          │ relayer (Hono)       │
│ file store, no keys  │          │ pays gas             │
└──────────▲───────────┘          └──────────┬───────────┘
           │ challenge + download            │ grantWithSig
           │                                 ▼
┌──────────┴───────────────────┐   ┌─────────────────────────────────────┐
│ Psychologist portal          │   │ HashKey Chain Testnet (133)         │
│ (packages/clinician)         │──▶│ ProfessionalRegistry                │
│ wallet + local reading key   │   │ ConsentRegistry ── Granted / Opened │
└──────────────────────────────┘   └─────────────────────────────────────┘
        gateway reads ConsentRegistry at a fixed block before releasing
```

### 3.1 Components

| Package | Responsibility | Sees plaintext? |
|---|---|---|
| `frontend` | Conversation with the local model, check-in, mood curve, drafting, encryption and signing of a share | Yes — it belongs to the person |
| `core` | Frozen encrypted package format v1, schemas shared by all packages | — (library) |
| `contracts` | `ProfessionalRegistry`, `ConsentRegistry`, deploy script | No: addresses and hashes only |
| `relayer` | Validates and submits signed consents; pays gas | No |
| `gateway` | Stores ciphertext; releases it only against a valid on-chain consent | No |
| `clinician` | Psychologist portal: key registration, inbox, opening, decryption, reading | Yes — only what the person signed |
| `e2e` | Backend flow on Anvil; read-only smoke test on HashKey | — |

### 3.2 Dependency rule

Screens never import WebLLM, viem or crypto. They talk to the app state, the state talks to ports, and a single composition root (`packages/frontend/src/main.jsx`) decides which implementation fills each port. This is what lets the unit tests swap the model for a fake without downloading weights, and why the WebLLM adapter lives in `frontend` and not in `core`: `gateway` and `relayer` run in Node and must not depend on a WebGPU library.

The portal follows the same shape: `application/` (use cases), `ports.ts`, `adapters/` (viem chain, HTTP gateway), `ui/`.

## 4. Key features and how they work

### 4.1 Local conversation

- **Runtime:** `@mlc-ai/web-llm` 0.2.85 in the browser, over WebGPU.
- **Model ladder:** `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (chosen after an A/B on bundled prompts: the only candidate that passed every structured-extraction case) and `Llama-3.2-1B-Instruct-q4f16_1-MLC` as a last resort for smaller devices.
- **Loading:** the app renders before the model is ready; mood logging works while the weights download. The app requests persistent storage so the browser does not evict them.
- **No fake path:** if WebGPU is missing or the device cannot fit any model, the app shows an unsupported screen. There is no scripted conversation.
- **Weights source:** Hugging Face by default, or any host set in `VITE_MODELOS_BASE`.
- **Prompt:** written in positive form (listen, reflect, ask one different question each turn). A list of prohibitions made the small model refuse ordinary venting, which was measured and corrected.

### 4.2 Check-in and "Tu camino"

- **Rating:** after a session the person rates the day on an integer 1–10 scale and may add a note.
- **Model suggestion:** requested only after the closing screen is shown, and at most highlights one value. The entry records whether the person picked the suggested value (`source`), and only a tap writes the score.
- **Storage:** the log is a map by **local** date (not UTC), kept in `localStorage`.
- **Charts:** the home screen shows a week strip; "Tu camino" draws the last 28 days.

### 4.3 Sharing: the 2-of-2 flow

1. **Draft.** The local model writes a short third-person summary of the session (`share-summary` task). The device appends the mood journal for the last 28 days.
2. **Review.** The person sees the exact plaintext document that will be encrypted. Nothing is sent before they tap send, and a re-entry guard prevents double submission.
3. **Check the recipient.** The app reads `ProfessionalRegistry.credentials` and refuses to send to an unverified professional or one without a registered key.
4. **Encrypt** (`@nadie/core`, format v1, frozen):
   - a fresh 32-byte AES-256-GCM content key and 12-byte nonce per package;
   - the content key is wrapped with HPKE Base (RFC 9180), `DHKEM(X25519, HKDF-SHA256)`, info `nadie/encrypted-package/v1/key-wrap`;
   - the same canonical AAD, including recipient key and metadata, binds both layers;
   - `packageHash = keccak256(canonical serialization)`, so the chain commits to ciphertext, never plaintext;
   - only Web Crypto, `@hpke/core` and `@noble/hashes`, with no custom cryptography.
5. **Upload.** `PUT /v1/packages/:packageHash` to the gateway, which validates structure, size (1 MiB default) and hash, and keeps the package for a retention window (7 days default).
6. **Sign.** A local signing account signs an EIP-712 `Grant`:
   - domain `NadieConsentRegistry`, version `1`, chain 133;
   - fields `consentId` (random 32 bytes), `user`, `professional`, `packageHash`, `scope = keccak256("graph-summary")`, `expiresAt = now + 7 days`, `nonce`, `deadline = now + 10 min`.
7. **Relay.** `POST /v1/transactions/grants` with an idempotency key. The relayer:
   - checks the request shape, signature recovery, nonce, and a gas estimate under its cap;
   - enforces a rate limit and an in-flight limit;
   - calls `grantWithSig`, which re-verifies the signature, the nonce, the deadline, and that the professional is verified.
8. **Confirm.** The app polls the relayer until the transaction is mined and shows a link to the HashKey explorer.

### 4.4 Psychologist portal

1. **Key setup.**
   - The psychologist connects a browser wallet and generates an X25519 reading key in the browser.
   - The portal shows the private key once, and it must be confirmed as saved before continuing.
   - Only the public key is sent on-chain, with `registerKey`.
2. **Credential.** An authorized verifier calls `issue(professional, displayName, expiresAt)`. `issue` requires the key to be registered first.
3. **Inbox.** The portal reads `Granted` events for the connected address, starting from the deployment block, and shows each consent as new, read, revoked or expired.
4. **Read.** One button runs the whole sequence and reports each step:
   1. `open(consentId)` on-chain. The first call sets `firstOpenedAt` and emits `Opened`; later calls change nothing.
   2. `POST /v1/access/challenges` returns a one-time message with a 60-second lifetime.
   3. The wallet signs it (EIP-191).
   4. `POST /v1/packages/:consentId/access`. The gateway:
      - consumes the challenge atomically and verifies the signature;
      - pins the latest block and reads the consent at that block;
      - requires the consent to be valid, not revoked, not expired, with the professional still verified, `firstOpenedAt > 0`, and the signer equal to the on-chain professional;
      - loads the package by the **on-chain** hash, re-hashes it, checks that `metadata.professional` matches, and only then returns it.
   5. The portal decrypts locally with the reading key and renders the title, summary, mood curve and daily journal.

### 4.5 Contracts

**`ProfessionalRegistry`**
- An immutable admin appoints verifiers.
- Professionals call `registerKey` / `rotateKey`.
- Verifiers call `issue` / `renew` / `suspend`.
- `isVerified` is true for a credential that is active (issued, not suspended), has not expired, and has a registered public key.
- An optional `IKycAdapter` hook is available for HashKey KYC. It is set to `address(0)` (disabled) on the testnet deployment.

**`ConsentRegistry`**
- `grantWithSig` and `revokeWithSig` accept EIP-712 signatures from any submitter, with a per-user monotonic nonce shared by both.
- `open` records the first opening.
- `reply` emits a response hash; it exists in the contract but is not used by the portal yet.
- `isValid` returns true only when the consent is not revoked, not expired, and the professional is verified **now**. Suspending a professional therefore invalidates their active consents without touching each one.

### 4.6 Privacy guarantees enforced by tests

| Guarantee | Test |
|---|---|
| The app and its production bundle reference no undeclared origin. The allowlist is the model hosts plus the sharing hosts from the build environment | `packages/frontend/test/no-external-requests.test.js` |
| A full private session in a real browser on the production build makes no request outside the local origin | `packages/frontend/test/e2e/private-session.e2e.test.js` |
| Encrypt → serialize → hash → decrypt round-trips; tampering fails with a fixed, data-free error | `packages/core/src/encrypted-package.test.ts` |
| Gateway never releases without valid challenge, signature, on-chain consent, first opening and matching hash | `packages/gateway/src/gateway.test.ts` |
| Consent, revocation, expiry, nonce, suspension cascade, signature rules | `packages/contracts/test/*.t.sol` |
| Whole backend on a local chain: encrypt, upload, grant through relayer, open, access, decrypt, reply, revoke, suspend | `packages/e2e/src/backend.e2e.test.ts` |
| Deployed contracts on HashKey are wired as documented | `pnpm smoke:backend:hashkey` |

## 5. Known limitations

These are true of the current build and should be read before any real use:

- **The mood log and the local signing account are in `localStorage`, in plain text.** An AES-GCM vault with HMAC-opaque keys exists and is tested (`packages/frontend/src/lib/vault/`), but it is not wired into the app yet.
- **One device, one identity.** History and the signing account do not sync between browsers.
- **Hardware.** The 1.5B model needs a WebGPU device with roughly 1.6 GB available to it; most phones today report the WebGPU minimum buffer size and cannot load it.
- **Recipient.** The receiving psychologist is configured at build time (`VITE_PSICOLOGA_ADDRESS`). There is no directory yet.
- **Verification.** Nadie's own verifier issues credentials. It is a trusted party in the MVP.
- **Relayer state** (idempotency, rate limit) is in memory and resets on restart.
- **Single origin.** The gateway and relayer each accept one browser origin.
- **Summary quality.** The share summary is drafted by a small model. The person reviews it, but cannot edit it in the app yet.
- **Revocation** is implemented in the contract and relayer, but there is no button for it in the app.
- **Crisis support** is a fixed helpline in Settings; there is no automatic detection.

## 6. Roadmap

### Next iteration — close the gaps of the MVP

1. **Encrypted local storage.** Wire the existing vault to IndexedDB for the mood log, the notes and the signing key; delete by key destruction.
2. **Revoke and audit in the app.** Show, for each share, when it was first opened (the `Opened` event) and a revoke button (`revokeWithSig` through the relayer).
3. **Editable share draft** before signing.
4. **Local crisis detection.** Keyword rules plus a model signal, surfacing human help immediately, never cutting the conversation on the model's own judgment.
5. **Psychologist directory** read from `ProfessionalRegistry`, instead of a build-time address.
6. **Installable PWA** with offline caching of the app shell.
7. **Memory the person can see and edit**: "what Nadie remembers about you", extracted locally in structured form.

### After the MVP

- **Fallback inference in a TEE with attestation** for devices without a capable GPU, with the attested measurement verifiable by the app.
- **Opt-in voice** with a zero-retention provider, clearly labelled as leaving the device.
- **License verification without Nadie as the verifier.** Via the professional association, or a zkTLS proof from the psychologist's own account on the health ministry portal; `ProfessionalRegistry` already accepts pluggable verifiers.
- **Anonymous session vouchers (ZK)** so a university can fund sessions without learning who used them.
- **`@nadie/consent` SDK.** Encrypt, sign, relay, verify and release, for any app handling sensitive AI data.
- **Native app** to use on-device system models and reach lower-end phones.
- **Pilot** with a university wellbeing centre: 20 people, 3 verified psychologists.
- **External security audit** before any real user.
