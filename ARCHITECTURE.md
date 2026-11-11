# Architecture

1. The client sends a validated request with exactly three structured offers to `/api/evaluate`. The deterministic procurement algorithm scores quality 50%, price 35%, and delivery 15%; the CFO calculates projected margin. Optional model text explains numerical results only; neither model output nor vendor text is a tool instruction.
2. The Guardian is a deterministic local demonstration checking allowlist, owner checkbox, budget, expiry, and payment ID. It is not a security boundary for the real contract.
3. The intended owner wallet directly calls the NEAR contract. Owner creates a funded request, allowlists vendors, and authorizes a specific vendor, amount and globally unique payment ID. The owner or designated operator can execute it. The UI does not implement these calls yet.
4. The prototype contract records `Pending` before issuing a native transfer. The private callback records `Completed` or restores the balance and marks `Failed`. The owner may request a refund of remaining funds only from non-pending states; the refund has its own pending callback.
5. The read-only reconciliation form queries finalized contract views by the original payment ID. An absent record is not conclusive if a submitted transaction could still land; investigate the original transaction hash and receipts. Never automatically retry an unknown outcome.

The contract supports one payment authorization per request; payment IDs remain permanently consumed, including after failure or refund. This is intentionally conservative. The owner can create a new request after a confirmed failure, but must not do so while the old outcome is unknown. No atomic cross-chain guarantees are asserted.

## Outstanding integration

Test the My NEAR Wallet connector with a real testnet wallet and add explicit signed owner workflows, durable server-side request/audit storage, transaction hash and receipt tracking, live balances, and end-to-end tests on a deployed testnet contract. Reconcile transaction status and contract state together, including callbacks that remain pending. Integer yoctoNEAR amounts must be used throughout actual settlement; demo numbers are floating-point display values only.
