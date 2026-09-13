# @nadie/e2e

Local backend integration tests and a separate read-only HashKey Testnet
smoke check. Neither command uses real user data.

## Prerequisites

- Node.js 20.19 or newer and pnpm 10.29.3.
- Foundry with `forge` and `anvil` available on `PATH`.
- Installed workspace dependencies (`pnpm install`).

## Local backend E2E

Run from the repository root:

```sh
pnpm test:backend-e2e
```

The command compiles the real Solidity contracts, starts Anvil on a free
dynamic port with chain ID 133, generates and funds ephemeral wallets, deploys
both registries, and serves the production gateway and relayer adapters on
localhost. It proves the complete encrypted-package flow: upload and tamper
rejection, signed grant, first open, challenge authentication, download and
byte-for-byte decryption, hash-only reply, signed revoke, professional
suspension, and fail-closed behavior when an RPC endpoint is unavailable.

The gateway uses a real `FilePackageStore` in a temporary directory. The test
also verifies that its files do not contain the synthetic plaintext. All HTTP
servers, Anvil, and temporary files are cleaned in `finally`, including after a
failure. Wallets, encryption keys, consent data, and plaintext are synthetic
and generated only at runtime; private keys are never printed.

This heavier suite is intentionally not part of `pnpm test`.

## HashKey read-only smoke

Run separately, only when network access to HashKey Testnet is intended:

```sh
pnpm smoke:backend:hashkey
```

The smoke check sends no transactions and asks for no key. It verifies chain
ID 133, bytecode at the documented `ProfessionalRegistry` and
`ConsentRegistry` addresses, contract wiring, the documented admin
`0x8A387ef9acC800eea39E3E6A2d92694dB6c813Ac`, and the documented enabled
verifier `0xbC0A1cE90FBD78A8d731127E66B0c16361EA7816`.

The local E2E and the live-network smoke are deliberately separate. CI and
default tests require neither HashKey access nor private keys, wallets,
faucets, hosted services, or any other real service.
