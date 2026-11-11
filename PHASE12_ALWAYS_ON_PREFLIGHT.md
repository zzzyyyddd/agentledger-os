# Phase 12: always-on Testnet readiness

**NO-GO.** This repository contains an undeployed Judge Treasury prototype. The existing public treasury and its historical evidence are separate. There is no approved public Judge Treasury deployment or enabled live judge payment UI.

## Contract prototype

Each request binds its creating account and a recipient chosen by that account. The creator alone may authorize, execute and refund. The recipient is an explicit per-request approval, not a claim that the account exists or is trustworthy. Amounts are limited to 0.1 NEAR; expiry is at most 24 hours; each request requires a nonrefundable 0.03 NEAR storage contribution in addition to the escrow amount. These values require economic and storage review before deployment. Account validity does not establish that a recipient is safe; self-payment needs a warning. A failed transfer or refund callback restores the recorded liability. Pending and unknown outcomes must not be retried blindly. A failed callback that never runs leaves the request locked; there is no administrative override. `get_owner_requests` provides paginated public on-chain recovery by account, but does not retain transaction hashes or receipt evidence.

## Required gates before public use

- [ ] Independently review the prototype contract and its storage contribution, lifetime growth, cap, callback gas, pending recovery and initialization; complete sandbox success, failure, refund and adversarial tests using the exact release WASM. Lock and record its SHA-256.
- [ ] Implement a cloud-backed, owner-authenticated, atomic durable claim before wallet signing; persist request IDs, operation, owner, contract, immutable parameters, state and any original transaction hash. Lock unknown outcomes across tabs, refreshes, restarts and devices. Never trust a submitted hash without verifying transaction signer, receiver, action arguments, receipts and final contract state.
- [ ] Implement wallet-native transaction signing and clear user-confirmed create, authorize, execute and refund actions in the public website. Bind Guardian checks to immutable on-chain values; display deposit, nonrefundable fee, gas, recipient and self-payment warning. Do not use NEP-413 as a transaction signature.
- [ ] Handle wallet redirect/cancellation and account switching without discarding or reissuing an in-flight transaction. Confirm supported wallet formats and Testnet support, including implicit account IDs; do not claim compatibility before real wallet testing.
- [ ] Add Vercel-hosted APIs and on-demand reconciliation with bounded timeouts and secure Neon access. Fail closed if the database or RPC is unavailable; do not infer failure from a missing hash, interrupted request, or absent record. Exercise cold starts, concurrent tabs, disconnect/reconnect, browser refresh, serverless restart and a second device.
- [ ] Confirm Neon schema, migrations and least-privilege settings through a separately authorized deployment procedure. Do not place database credentials or wallet secrets in browser code.
- [ ] Deploy the exact reviewed WASM to a separate public Testnet account only after explicit approval. Verify code hash, initialization, account funding and storage reserve by read-only RPC. Do not upgrade or alter the historical treasury.
- [ ] Configure the public contract ID, exact application origin, database connection and a separate live-judge feature gate in Vercel. Keep `PAYMENTS_ENABLED=false` and `JUDGE_PAYMENTS_ENABLED=false` until separately approved; after approval the judge gate is independent of the disabled legacy payment gate; do not assume a build-time flag is a sufficient authorization boundary.
- [ ] Verify public Testnet RPC, explorer links and wallet connections from the deployed website with the developer laptop, WSL, local server and sandbox stopped. Complete and independently inspect a real wallet-signed lifecycle only after explicit transaction approval.
- [ ] Document how judges acquire Testnet funds, all deposits and fees, recovery steps, receipt inspection and operational support. Publish no secrets. No local RPC, SSH tunnel, developer wallet or laptop process may be required.

## Current limitations

The repository now includes a disabled live judge UI, wallet-signed action preparation, an owner-scoped Neon intent path, finalized transaction/receipt reconciliation, and named/implicit account validation. The additional atomic-lock migration has not been applied or tested against live Neon. End-to-end refresh and device-change recovery, wallet redirects, public deployment, Testnet wallet transactions and laptop-off operation remain unverified. The live procurement/CFO assessment and Guardian snapshot are persisted with the intent but are deterministic and advisory, not an on-chain AI policy proof. Do not present the integration as an available or secure public payment service.

## Prepared commands (do not run without appropriate approval)

Build the separate contract locally:

```sh
CARGO_TARGET_DIR=contract/target cargo build --offline --manifest-path judge-contract/Cargo.toml --target wasm32-unknown-unknown --release
sha256sum contract/target/wasm32-unknown-unknown/release/agentledger_judge_treasury.wasm
```

The additional migration must be reviewed and separately authorized before applying to the existing database. It uses a transaction-scoped advisory lock to serialize per-owner operations. Its SQL and privileges have not been verified against live Neon:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f db/migrations/202611110002_judge_intent_lock.sql
```

No deploy command can be finalized until an approved, separate Testnet contract account and its secure signer are selected. A deployment signs, spends funds and is outside this phase. Required server configuration is `DATABASE_URL`, `APP_ORIGIN`, `PAYMENTS_ENABLED=false`, `JUDGE_PAYMENTS_ENABLED=false`, `JUDGE_TREASURY_CONTRACT_ID`, and `JUDGE_TREASURY_WASM_SHA256`. The last two refer only to the separately deployed and verified judge contract, never the historical treasury.

After all gates pass and **only with separate explicit deployment approval**, set `JUDGE_CONTRACT_ID` to the approved separate Testnet account. This command signs and broadcasts deployment and `new()` initialization; it must not be run during preflight. The syntax was checked against the installed near-cli-rs help, but the deployment has not been performed:

```sh
near contract deploy "$JUDGE_CONTRACT_ID" use-file contract/target/wasm32-unknown-unknown/release/agentledger_judge_treasury.wasm with-init-call new json-args '{}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

After the migration is separately approved and applied, the WSL host can test the atomic lock against the configured Neon database using isolated, per-run fixtures and two distinct connections:

```sh
node scripts/test-live-judge-intents.mjs --run
```

The test intentionally writes and then removes only its uniquely named fixtures. It has not run in this environment because `DATABASE_URL` is unavailable.

A rejected or interrupted wallet request without a transaction hash remains locked; resolving it without independently establishing the outcome is unsafe. A callback that never completes may leave a request pending indefinitely. These are launch blockers for a completely self-service flow.
