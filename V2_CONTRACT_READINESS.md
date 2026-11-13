# AgentLedger V2 contract readiness

The independent source is `v2-contract`; neither historical contract is changed. This is deployment preparation, not a deployment authorization. Before live use, browser/wallet flows, database migration and production configuration must be independently verified. Review the contract and storage economics before entrusting funds to it.

## Interface

- `new()` initializes a fresh contract and requires the predecessor to be the contract account.
- `create_request(request_id, payment_id, expiry_ns, vendor, budget)` reserves both globally unique IDs and creates a funded payment. The deposit must equal the budget plus a nonrefundable 0.03 NEAR storage contribution; the budget cap is 0.1 NEAR and expiry is within 24 hours.
- `authorize(request_id, payment_id, vendor, amount)` is the owner approval. It binds the existing payment ID and recipient and checks expiry and available budget.
- `execute(request_id)` sends the authorized amount once; `refund(request_id)` returns remaining funds where allowed. Private callbacks finalize success or restore liabilities after a failed transfer. Pending transfers cannot be executed or refunded again.
- `get_payment(payment_id)` returns the on-chain record from creation. `get_payments_by_owner(owner, from, limit)` returns at most 50 `(payment_id, record)` pairs; the record includes its request ID. `get_request`, `get_owner_requests`, `get_payment_request` and `get_liabilities` are supporting views.

The five-step UI reads owner history from final on-chain state. A hashless interrupted creation can be recovered only when the configured contract code hash verifies and the final state contains the exact owner, identifiers, vendor, amount, expiry and Funded status. The contract's permanent uniqueness prevents the same creation from taking another deposit. Unknown authorization, execution and refund attempts remain locked until the original hash and receipts are reconciled. A pending or missing callback can remain locked indefinitely; there is no unsafe administrative retry. The on-chain contract does not preserve transaction hashes. Payment data on chain is public.

## Separate account and configuration

Use a new, empty Testnet account controlled by a secure signer, distinct from every V1 account. It needs sufficient account balance for deployed WASM storage, ongoing storage reserve, deployment/initialization gas and operating costs. Deploy and initialize as that account only after a separate approval. Verify the finalized deployment transaction and hash the fetched on-chain code bytes against the locally built WASM. Set `V2_TREASURY_CONTRACT_ID` and `V2_TREASURY_WASM_SHA256` only after verification. Keep signing disabled until the dedicated V2 PostgreSQL schema migration has been reviewed and applied in the intended environment and multi-wallet recovery and callback scenarios pass. `PAYMENTS_ENABLED=false` and `V2_PAYMENTS_ENABLED=true` are both required to enable V2 signing.

`db/migrations/202611130001_v2_namespace.sql` creates separate V2 authentication and intent objects; it contains no deletion of wallet authentication tables or V1 data. Never run `db/cleanup/v1_inventory_and_cleanup.sql` as a migration. No database or deployment changes were executed during preparation.

## Local verification on 2026-11-13

The V2 sandbox integration suite passed using near-sandbox 2.14.0 (protocol 88), including successful final settlement, refunds, duplicate rejection, failed transfer and liability restoration, and recovery using a new simulated session and finalized contract state. This is not a real browser or wallet interruption test. NEAR sandbox 2.6.2 (protocol 77) failed to deserialize this artifact; a read-only Testnet RPC status reported protocol 88 at block 277491319. Recheck network compatibility at deployment time.

The 16 contract unit tests, application tests, typecheck, lint and production build passed. The tested release WASM SHA-256 is `7c38929d075d06e47a9af6472387939f5473d27e4e3ced7d88e2eaf0244c3d27`; recalculate it before deployment. The V2 contract was subsequently deployed and verified; see [deployment evidence](V2_TESTNET_DEPLOYMENT_EVIDENCE.md). V2 schema application, real wallet/browser recovery, and production configuration remain unverified. No deployment is authorized by these results.
