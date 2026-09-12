# @nadie/relayer

Gas-paying relay for signed `ConsentRegistry.grantWithSig` and `revokeWithSig` calls on HashKey Chain Testnet (chain ID 133). It never signs for users and never accepts arbitrary targets, ABI, functions, or calldata.

## Flow and API

The user signs the exact EIP-712 `Grant` or `Revoke` message defined by `ConsentRegistry`. A client sends the domain, message, and signature with an `Idempotency-Key` header to:

- `POST /v1/transactions/grants`
- `POST /v1/transactions/revocations`

The service validates the strict payload, fixed domain and contract allowlist, deadline, canonical 65-byte low-s EOA signature, recovered user, HashKey chain ID, shared on-chain user nonce, simulation, gas cap, and relayer balance before submitting. Success is `202 {"transactionHash":"0x..."}`. The relayer only pays gas; the user's EIP-712 signature remains the authorization.

`GET /v1/transactions/:transactionHash` reports only transactions submitted by this process as `pending`, `confirmed`, or `reverted`; confirmed/reverted responses include a decimal `blockNumber`. `GET /healthz` returns only `{"status":"ok"}`.

## Run locally

Copy the root `.env.example` to `.env`, set a **testnet-only** `RELAYER_PRIVATE_KEY`, and never commit or print it. Do not reuse this wallet on mainnet.

```sh
pnpm --filter @nadie/relayer regenerate:abi
pnpm --filter @nadie/relayer test
pnpm --filter @nadie/relayer dev
```

Startup fails before listening unless the RPC reports chain 133, bytecode exists at `CONSENT_REGISTRY_ADDRESS`, and the hot wallet has the configured minimum balance. Configuration is fail-fast; see `.env.example` for all limits.

The minimal runtime ABI is generated from `packages/contracts/abi/ConsentRegistry.json`. No user-supplied ABI or destination is used.

## Idempotency and operations

Idempotency keys, `(user, nonce)` reservations, rate limits, in-flight limits, and known transaction hashes are bounded in-memory state. Only a SHA-256 digest of the idempotency key, a normalized request fingerprint, transaction hash, state, and expiry are retained—never the header, signature, or full body. Concurrent identical requests coalesce; grant and revoke share the same nonce reservation. Submissions are serialized to protect the hot-wallet nonce.

Failures before submission release reservations and may be retried. Once submission starts, an ambiguous RPC failure is not retried automatically because the transaction may already be in the mempool. Restarting loses idempotency and receipt allowlisting, so production requires a durable coordination adapter.

## Security limits

- The relayer wallet is a hot key that can lose testnet funds; isolate and fund it minimally.
- RPC failure is fail-closed. A malicious or stale RPC can delay service or misreport pending state.
- Receipts and chain checks observe a non-final head and can be affected by reorgs.
- The global in-memory rate limit is per process, not distributed and not identity-aware.
- Simulation reduces but cannot eliminate state races between simulation and mining.
- Responses deliberately omit upstream errors, revert data, signatures, request bodies, and secrets.
