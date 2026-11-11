# Judge guide

This is a local demonstration. A testnet wallet connection control is implemented but has not been exercised with a real wallet. Treasury signing is disabled by default and has not been tested against a configured database or wallet; no blockchain result is implied by a simulated check. Start with the README setup, then open the app.

1. **Happy path:** Open Procurement, keep the sample request and run agent review. Three proposals are ranked, and the CFO shows the estimated margin. Open Payments, choose Happy path, check the demo-only authorization box and run the simulated check. All five policy checks pass; the audit trail records a simulation, not a payment.
2. **Rejected payment:** Choose Unapproved vendor on Payments. The allowlist check is blocked. Run the simulated policy check to record a rejection.
3. **Duplicate:** Choose Duplicate payment ID. The duplicate check blocks the scenario. Alternatively, pass a simulated happy-path check twice with the same ID during one browser session; the second check blocks it.
4. **Timeout / reconciliation:** Choose Unknown transaction result. The simulation cannot execute. Enter an actual deployed contract and original payment ID in the read-only reconciliation form to inspect finalized contract state. A missing record does not prove an in-flight transaction failed; also inspect the original transaction and receipts in the testnet explorer before deciding anything. No retry is automatic.

The demo's session history and duplicate list reset on refresh. For actual testnet evidence and missing integration, see TESTNET_EVIDENCE.md; do not interpret the demo as a completed onchain happy path.

Wallet connection (not yet verified end to end): after a contract exists, configure `NEXT_PUBLIC_NEAR_CONTRACT_ID` in `.env.local`, restart the app, and use Connect wallet. Treasury actions additionally require a configured database, verified wallet identity and the server signing flag. Do not deploy the current contract for this step; resolve the blockers in SECURITY.md first.

For a transaction that already exists, the read-only Transaction status panel accepts its original hash and sender and provides a testnet explorer link. A finalized transaction outcome is not by itself proof that the payment completed: check the contract state and receipts. This application has not created a testnet transaction.

The Payments page also contains a TESTNET action preparation and reconciliation form. It uses the contract ABI and exact decimal conversion, and includes a durable signing path that is disabled by default pending PostgreSQL and wallet verification. It is not an end-to-end payment. `CREATED`, `AWAITING_SIGNATURE`, `SUBMITTED`, `UNKNOWN`, `CONFIRMED`, `FAILED`, and `REFUNDED` are intent statuses, not proof unless supported by actual finalized chain evidence.

PostgreSQL integration setup and its current limitations are documented in DEPLOYMENT.md. No live payment has been demonstrated.
