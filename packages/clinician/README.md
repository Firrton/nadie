# Nadie professional portal (MVP)

Minimal React/Vite portal for the professional side of the Nadie consent flow.
It discovers `Granted` events directly from `ConsentRegistry`; there is no
indexer or backend session.

## Prerequisites

- Node.js 20.19+, pnpm 10 and an injected EVM wallet.
- A chain ID 133 RPC. For the demo, use the local Anvil deployment.
- The wallet's selected chain 133 network must point to that same RPC. Chain ID
  equality alone is not enough; the portal compares the genesis block and fails
  closed instead of accidentally sending a local-demo action to HashKey.
- Gateway running against the same `ConsentRegistry`.
- Deployed `ProfessionalRegistry` and `ConsentRegistry` addresses.
- The connected professional must have registered an X25519 public key and
  have an active credential issued by a configured verifier.
- The professional wallet needs local test funds for `open` and `reply`.

Admin/verifier setup is deliberately outside this portal. It never asks for an
admin, verifier, relayer or raw EVM private key.

## Local setup

```bash
cp packages/clinician/.env.example packages/clinician/.env.local
# Fill the two deployment addresses, then:
pnpm --filter @nadie/core build
pnpm --filter @nadie/clinician dev
```

Open `http://localhost:5174`. The default `/api/gateway` URL is proxied by Vite
to `VITE_GATEWAY_PROXY_TARGET`. This avoids changing the gateway's single CORS
origin while the user frontend is also running. A production deployment must
provide the equivalent same-origin reverse proxy or explicitly configure CORS.

`VITE_GRANTED_FROM_BLOCK` controls where event discovery starts. Use the local
deployment block (or `0` for a short-lived Anvil chain).

## Demo flow

1. Connect the professional EVM wallet on chain 133.
2. Load the already-registered X25519 private key into memory. Alternatively,
   generate a pair and register its public key, then have a configured verifier
   issue the credential while the tab remains open.
3. Refresh the on-chain inbox.
4. Select **Open & decrypt**. The wallet sends `open(consentId)` if needed.
5. The portal requests a gateway challenge, signs the exact EIP-191 message,
   downloads the encrypted package, verifies its on-chain hash and recipient,
   and decrypts it in the browser.
6. Write a response. Only its Keccak-256 hash is submitted through
   `reply(consentId, responseHash)`.
7. Clear the decrypted content and forget the local key after the demo.

## Key and data handling

- EVM identity and X25519 decryption identity are separate.
- The X25519 private key is kept in component memory only. It is never sent,
  logged, placed in URL/config, or written to browser storage.
- Imported key input is masked and cleared after loading.
- Downloaded ciphertext is not displayed or logged.
- Decrypted content remains in memory only and can be explicitly cleared.
  Clearing is best-effort because JavaScript runtimes may retain internal copies.
- Refreshing or closing the tab forgets the local key and decrypted content.

Because the MVP intentionally has no encrypted local vault, key backup and
long-term key lifecycle remain an operational precondition. Do not generate a
production key in this portal.

## Checks

```bash
pnpm --filter @nadie/clinician test
pnpm --filter @nadie/clinician typecheck
pnpm --filter @nadie/clinician build
```
