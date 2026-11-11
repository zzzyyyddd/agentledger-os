# Judge guide: 3–5 minutes

AgentLedger OS separates real wallet identity, a browser-local simulation, read-only Testnet treasury data, and imported historical evidence. Payment signing is disabled. No funds or owner/operator credentials are needed for this walkthrough.

1. In the wallet menu, connect your own compatible NEAR Testnet wallet. Select **Verify identity** and explicitly sign the NEP-413 message. Connection alone is not authentication; a wallet that cannot sign this message cannot use the verified flow. No transaction is submitted by authentication.
2. On Overview, select **Start Judge Demo**. Sandbox state lives in the current browser tab, not the treasury or a shared database, and resets on reload, disconnect, account switch, or session expiry.
3. Open Procurement and run the agent review. Inspect the proposal ranking and CFO margin. Values are simulated.
4. Open Payments, select Happy path, check demo authorization and run the Guardian check. Simulate funding, authorization and settlement. Try the unapproved vendor and duplicate scenarios. These steps do not create transactions or move funds.
5. Open Audit trail. Session events are app-generated simulations. The separate **Verified Onchain Settlement** is historical evidence imported from a CLI lifecycle, not initiated by this application. Follow each transaction link and inspect the transfer and callback receipts; compare the live request status with the historical record.

The contract owner can fund and authorize escrow; the owner or operator can execute. A verified judge wallet does not receive either role. Read-only treasury data is separate from simulated policy values. Unknown transaction outcomes must never be retried automatically.

Wallet connection and signature support vary by provider. This guide does not claim a live judge-wallet end-to-end test; if verification is unavailable or rejected, reconnect and try a compatible Testnet wallet.

## Live Judge Treasury — not enabled yet

The live integration is separate from the demo and historical CLI evidence. It requires deployment and explicit enablement after review; the current production flow must not be represented as a tested live payment. Once approved, obtain Testnet NEAR through your wallet's supported Testnet faucet or funding guidance. For 0.01 NEAR escrow, the current contract also collects a **nonrefundable 0.03 NEAR storage contribution**, plus wallet transaction fees. Confirm these figures in the live preview before signing.

1. Connect and verify your own compatible Testnet wallet in the wallet menu. Complete the Procurement/CFO review. This review is advisory; it does not approve or execute an on-chain payment.
2. In Payments, locate Live Judge Treasury. Enter the live purchase description, expected revenue, recipient and amount. Review the deterministic CFO estimate and Guardian checks, read the self-payment warning where applicable, and explicitly confirm the preview. The server saves its recomputed advisory assessment with the intent. Choose the funding action and approve its real transaction in your wallet. Your wallet's NEP-413 login signature is separate from transaction signing.
3. Refresh and verify the original transaction and its receipts. After the create intent is confirmed, use the same request's authorize and execute actions, approving each transaction in your wallet. Final success requires the finalized transfer and callback receipts and matching contract state. Refund is available for remaining escrow when the contract permits it.
4. Use Refresh and recover after reconnecting or returning on another device. Intent records are owner-scoped and the contract can be read independently. If an outcome is UNKNOWN, recover and record the original hash from your wallet or explorer; do not submit another transaction while it is unresolved. A missing hash or contract record does not prove failure.

The judge contract, cloud storage and wallet workflow still require deployed-browser testing, migration verification and an independent review. No public transaction was performed as part of this implementation.
