# AgentLedger OS

AgentLedger OS is a **local prototype**, not yet a deployable financial MVP. It explores AI-assisted procurement with owner-controlled treasury rules on NEAR Testnet. Businesses need to compare suppliers quickly without allowing an AI recommendation to become a payment instruction. The interface demonstrates the separation between recommendations, a deterministic Guardian, and contract-enforced settlement.

## What works and what does not

- The Next.js app has a responsive demo dashboard, three-proposal ranking, CFO margin calculation, local Guardian scenarios, an in-session audit trail, and a read-only testnet contract and transaction-hash lookup. Sample NEAR amounts and vendors are illustrative; no hashes or verified balances are invented.
- With no provider configuration, decisions use a deterministic algorithm labeled **DEMO**. An optional server-side OpenAI-compatible API provides an explanation only; it cannot choose a vendor or authorize payment. Provider failure falls back to DEMO.
- The Rust contract builds and passes local unit tests, but has not been independently audited or deployed. My NEAR Wallet connection/disconnection is implemented for a configured testnet contract, but has not been exercised against a real wallet in this environment. Contract actions, wallet authentication, and a PostgreSQL-backed intent adapter are implemented. Signing is disabled by default and the integration has not been verified against a live PostgreSQL database or wallet. It does not display live balances. The demo checkbox authorizes only a local simulation. The local trace and used-ID list are lost on reload and are not a production audit log.
- No contract, transaction, account, or funds were created. See [TESTNET_EVIDENCE.md](TESTNET_EVIDENCE.md).

## Why NEAR

The intended treasury uses NEAR accounts, owner-signed contract calls, native NEAR escrow, and public contract state to enforce and independently inspect payment rules. Contract calls and transfer receipts are asynchronous, so state and receipt reconciliation are essential. See [NEAR cross-contract calls](https://docs.near.org/smart-contracts/anatomy/crosscontract).

## Local setup

Requires Node 22 and Rust, and network access to npm and crates.io.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Optional AI variables use an OpenAI-compatible chat-completions URL; keep credentials server-side. Do not expose this unauthenticated API with a paid key until authentication, abuse controls, request limits, and rate limiting are implemented.

```sh
npm test
npm run lint
npm run typecheck
npm run build
cargo test --manifest-path contract/Cargo.toml
(cd contract && cargo near build non-reproducible-wasm)
```

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_NEAR_CONTRACT_ID` to a deployed testnet contract to enable the wallet connection control. This is a public account ID, not a secret. The wallet integration has only been checked at build and unit-test level; real wallet interaction remains unverified. Lockfiles are included. Never fund or deploy the current contract until the issues in SECURITY.md are resolved.

See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and [JUDGE_GUIDE.md](JUDGE_GUIDE.md). Deployment, wallet creation, signing, and spending require separate explicit owner approval.

The contract keeps escrow liabilities separate from a storage cushion and requires initialization by the contract account. These changes need sandbox receipt and storage-staking tests before any deployment. Transaction status lookup requires the original hash and sender; an unknown result never proves a transaction failed. Action preparation, server-side wallet authentication and a PostgreSQL-backed intent boundary exist; real signing is disabled by default pending configuration and end-to-end verification.

## Durable testnet workflow

The Payments page supports wallet authentication and durable intent claims for escrow creation, authorization, execution and refund. Signing is disabled by default. Configure PostgreSQL and follow [DEPLOYMENT.md](DEPLOYMENT.md); the implementation has not been tested against a live project or wallet. Initialization, storage reserve funding and vendor allowlisting remain action preparation only. Unknown or interrupted outcomes remain locked; there is no automatic retry.

Final reconciliation binds the saved intent to the transaction signer, receiver, action and arguments, then checks finalized contract state. A hash by itself is not evidence of settlement. The local demo remains separate from testnet state.

## GitHub repository description

AI-assisted procurement demo with owner-controlled NEAR Testnet treasury workflows and durable PostgreSQL payment intents.

For GitHub and Vercel setup, including Neon provisioning and the guarded initial migration, see [DEPLOYMENT.md](DEPLOYMENT.md). The app builds without database credentials in DEMO mode.
