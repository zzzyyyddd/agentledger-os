# Security architecture and current status

**NO-GO for Phase 12 public payments.** The separate Judge Treasury and integration have local unit and sandbox coverage but no independent audit, deployed-browser wallet test, or live Neon migration/concurrency verification. Keep `PAYMENTS_ENABLED=false` and `JUDGE_PAYMENTS_ENABLED=false`.

## Trust boundaries

- Wallet connection is not authentication. The server verifies a browser-bound, expiring, single-use NEP-413 challenge against a finalized Testnet access key. This login signature cannot authorize a blockchain transfer.
- Judges sign each transaction in their own wallet. The server holds no privileged signing key. Named and implicit account formats are accepted, but real wallet compatibility remains to be tested.
- The Judge Treasury binds each request to its creator and chosen recipient, limits amounts and expiry, prevents duplicate payment IDs, marks transfers pending before callbacks, and restores liabilities after a failed transfer or refund. Anyone can inspect public chain state; another wallet cannot control the request. These controls do not prove the recipient is trustworthy.
- Procurement/CFO calculations and Guardian preview are deterministic advisory assessments saved with intent parameters. They are not an AI authorization and are not a substitute for contract checks or the wallet owner's transaction approval. The demo policy and historical settlement are separate from live requests.
- Server-side deployment hash checks, owner-scoped database access, unique claims and optimistic transitions protect the live workflow. The proposed PostgreSQL advisory lock serializes unresolved operations per owner and contract; its migration and actual concurrent behavior remain unverified against Neon. A missing hash or RPC result is never proof of failure.
- Reconciliation compares the finalized signer, receiver, method, arguments and deposit, then contract state and callback/transfer receipt outcomes. On uncertainty the intent stays locked. A rejected or interrupted wallet may still leave an unknown outcome that requires the original hash; there is no unsafe automatic retry.
- A callback that never executes can leave `Pending` or `RefundPending` indefinitely. No administrative override exists because a late receipt could otherwise pay twice. Resolve this operationally only after independent analysis; do not infer failure from a timeout.

## Deployment and operational risks

The 0.03 NEAR nonrefundable storage contribution, 0.1 NEAR cap, permanent request indexes, 2,048-byte reserve and callback gas need independent economic and adversarial review. Confirm the exact deployed code hash and secure the contract account's upgrade keys. A code-hash preflight cannot prevent an upgrade between a check and a later wallet signature. RPC failures, database outages, wallet redirects, account switches and serverless restarts must be exercised against the actual deployment. Paid AI endpoints require separate abuse controls and rate limiting. Review current dependency advisories on a connected host; older install-time audit counts are not current verification.

Never commit or expose private keys, wallet credentials, seed phrases or database URLs. See [deployment operations](DEPLOYMENT.md) and [always-on preflight](PHASE12_ALWAYS_ON_PREFLIGHT.md).
