# Nadie
![Nadie](docs/imagenes/nadie-imagen.png)
**Private AI for the things you can't say out loud yet.**

*Nadie* is Spanish for *nobody*. Who reads what you tell your AI? Nobody.

An emotional companion that runs on your device, remembers what you tell it, and shares with a verified psychologist only what you sign off on. Built at the EAG Global Buildathon, Cochabamba, Bolivia, September 11–13, 2026. Track 02: Local AI, Private AI & User-Owned Data.

| | |
|---|---|
| Demo video | `TODO_SUNDAY_VIDEO_URL` |
| Live app | `TODO_SUNDAY_APP_URL` |
| Architecture | [docs/ARQUITECTURA.MD](docs/ARQUITECTURA.MD) |
| Development rules | [docs/REGLAS.md](docs/REGLAS.md) |
| Backend plan | [docs/PLAN_BACKEND.md](docs/PLAN_BACKEND.md) |

---

## The problem

Millions of people now tell an AI things they have never told a human. Every one of those messages sits on someone else's server, readable by the company that runs it.

The people who most need to be heard are the ones who can least afford to be identified: teenagers, people in small towns where the therapist knows your family, anyone afraid of what happens when a secret leaves their hands.

Existing mental health apps ask for your email, your phone number, and your trust. Nadie asks for none of the three.

## What Nadie does

- **Listens on your device.** The model runs in your browser. After the model and application assets are cached, a complete private session makes zero outbound network requests, and two tests prove it:
  - [`no-external-requests.test.js`](packages/frontend/test/no-external-requests.test.js) — fails if any source file or bundled asset points at a third-party origin. Runs on every `pnpm -r run test`.
  - [`private-session.e2e.test.js`](packages/frontend/test/e2e/private-session.e2e.test.js) — drives a real browser through a full session on the production build and asserts that **every** request stays on the local origin. Run with `pnpm --filter @nadie/frontend test:e2e` (needs `playwright install chromium` once).
- **Remembers, and shows you what it remembers.** Mood check-ins, session summaries, and the things that matter to you build a picture over time. You can read, edit, or delete any of it.
- **Walks you to a human.** When you choose to, Nadie packages a summary, you sign it, and a verified psychologist can open it for a limited time. You see the first opening. You can revoke.

Nadie does not diagnose, does not treat, and does not replace professional care.

## Why Ethereum

Consent is the whole product, so consent cannot be a row in our database.

- **The grant is a signature the user made.** Not a record we wrote about them. We cannot forge it.
- **The first-opening log only grows, and the user reads it.** We cannot quietly delete the recorded opening.
- **The gateway does not decide.** It asks a public contract whether a package may be released. Compromise our server and the attacker still cannot mint a valid consent.

We call this the **2-of-2**: the AI prepares, the human signs, and nothing leaves without both.

## Privacy mechanisms

| Mechanism | How Nadie uses it |
|---|---|
| **Local-first software** | Conversation, memory, and charts live on the device and work offline |
| **Encrypted storage** | Client-side AES-GCM vault; shared packages are end-to-end encrypted; deletion by key destruction |
| **TEE with attestation** | Post-core fallback inference in a confidential enclave for devices without a capable GPU |
| **ZK** (stretch) | Anonymous session vouchers, so a student can prove enrollment without their university learning they sought help |

## What is on-chain, and what never is

| Data | On-chain |
|---|---|
| Conversations, memory, mood history, summaries | **Never.** Not even encrypted |
| Consent grant | Pseudonym, professional address, package hash, scope, expiry |
| Professional credential | Address, encryption public key, validity |
| First opening and revocation | Events with timestamps |

The chain is the notary. It is not the vault.

## Verifiable privacy claims

We do not ask you to believe the privacy claims. Each one is a test.

```bash
pnpm test:privacy
```

| # | Claim | Test |
|---|---|---|
| 1 | A private session makes no outbound network calls after assets and model are cached | `no-network.test.ts` |
| 2 | Nothing readable is persisted to disk | `vault-opaque.test.ts` |
| 3 | Encrypt, wrap, unwrap, decrypt returns the original | `envelope-roundtrip.test.ts` |
| 4 | The on-chain hash is of the ciphertext, never the plaintext | `hash-is-ciphertext.test.ts` |
| 5 | Revocation blocks release immediately | `revoke-blocks.test.ts` |
| 6 | A suspended credential invalidates that professional's active grants | `credential-cascade.test.ts` |
| 7 | No event argument can carry personal data | `no-pii-onchain.test.ts` |

## State of the build

- **Working:** the mobile app (mood log, journaling, "your path"), core's frozen contracts and runtime schemas, and local inference through WebLLM behind a flag. 162 unit tests plus one end-to-end test that drives a real browser.
- **Mocked:** speech in and out. The text path is real and works without a microphone.
- **Roadmap:** installable PWA, the encrypted vault, the sharing flow, gateway and relayer, and the professional's portal.

Update this section as each implementation branch is reviewed and merged.

## Repo map

```
packages/
  contracts/   ProfessionalRegistry, ConsentRegistry (Solidity, Foundry)
  core/        Types, runtime schemas and ports. No implementations, no React.
  frontend/    The React app, and the WebLLM adapter behind core's LLMPort.
  gateway/     Encrypted blob store, releases only on a valid on-chain grant
  relayer/     Submits signed meta-transactions, pays gas
docs/
  ARQUITECTURA.MD   Full design
  REGLAS.md         Development rules and invariants
  PLAN_BACKEND.md   Sequential backend work units and acceptance criteria
```

**Dependency rule:** the app depends on core's PORTS; the implementations are injected at the composition root. `core` is contracts only — types, runtime schemas and port interfaces, with no implementations — so an adapter lives next to whoever uses it, not inside core. Putting the WebLLM adapter in `core` would make a WebGPU library a dependency of `gateway` and `relayer`, which run in Node.

What this buys, concretely: no screen imports WebLLM, viem, or any crypto. Screens talk to the app's state, the state talks to a port, and `src/main.jsx` is the single file that decides which implementation fills that port. A test can swap in a fake with one argument, which is why the adapter is covered without downloading a model.

## Architecture in one paragraph

A PWA holds the user's keys and an encrypted IndexedDB vault. The core MVP sends inference to WebLLM in the browser. After that path and the sharing flow are stable, an attested TEE may be added as a fallback and ElevenLabs may be enabled only when the user opts into voice. Sharing is a 2-of-2: the local model drafts a summary, the user approves and signs an EIP-712 consent, a relayer posts it, and a gateway releases the encrypted package to a professional whose credential the chain says is valid. Full detail in [docs/ARQUITECTURA.MD](docs/ARQUITECTURA.MD).

## Stack

TypeScript across the repo. React and Vite for the app. WebLLM over WebGPU for local inference. IndexedDB with Web Crypto for the vault. viem for chain access and EIP-712 signing. Solidity with Foundry for contracts. Hono for gateway and relayer. Recharts for the mood chart.

## Run it locally

```bash
# Requires Node 20+, pnpm, and a WebGPU-capable browser
pnpm install
pnpm --filter @nadie/frontend dev     # the app, on :5173
pnpm --filter @nadie/frontend test    # unit tests
pnpm --filter @nadie/frontend test:e2e  # drives a real browser; needs Chromium
```

Local inference is the **only** path: there is no scripted stand-in. The first run downloads the weights into the browser cache; if the device has no WebGPU or not enough memory, the app shows a "no support" screen instead of faking a conversation.

The first run with the real model downloads the weights into the browser cache. How long that takes depends entirely on the connection: we measured the same CDN at 37 KB/s and at 3.4 MB/s on the same day, so the app shows a percentage and only offers a time estimate once the measurement holds steady.

`VITE_MODELOS_BASE` serves the weights from your own origin instead of the public CDN. For an app that presents itself as private, being able to drop a third party from the largest file it downloads is worth the configuration.

`pnpm --filter @nadie/contracts test` needs Foundry (`forge`) on PATH.

The core MVP targets a WebGPU-capable demo device. Enclave fallback remains behind a feature flag and is implemented only after the local path and sharing flow are stable.

## Deployed contracts

| Contract | Network | Address |
|---|---|---|
| ProfessionalRegistry | HashKey Chain Testnet (133) | [`0xD615074c2603336fa0Da8AF44B5CCB9D9C0B2F9c`](https://testnet-explorer.hsk.xyz/address/0xD615074c2603336fa0Da8AF44B5CCB9D9C0B2F9c) |
| ConsentRegistry | HashKey Chain Testnet (133) | [`0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1`](https://testnet-explorer.hsk.xyz/address/0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1) |

HashKey Chain Testnet is the reference deployment so the project can qualify for the HashKey track. Additional EVM deployments are roadmap work.

## Original work

No code, components, design tokens, or application assets are inherited from another repository. The Nadie implementation is built from scratch in this repository during the buildathon.

## Beyond the hackathon

- Pilot with a university wellbeing centre: 20 users, 3 verified psychologists.
- Move professional verification off ourselves, to a professional association or a zkTLS web proof against the health ministry's registry.
- Anonymous session vouchers so institutions can fund care without learning who received it.
- Publish `@nadie/consent` as a standalone SDK: any app handling sensitive AI data can adopt the 2-of-2 pattern.
- Native app to use on-device system models and reach low-end phones.
- External security audit before onboarding real users.

## Safety

Nadie is a companion, not a clinician. It never diagnoses and never shares anything automatically. A local risk detector runs in every mode; when it triggers, the app surfaces human help immediately. The MVP is for adults only and all demo data is synthetic.

![Nadie](docs/imagenes/nadie-imagen-2.png)
## License

MIT. See [LICENSE](LICENSE).
