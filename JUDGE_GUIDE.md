# Judge guide: 3–5 minutes

AgentLedger OS separates real wallet identity, a browser-local simulation, read-only Testnet treasury data, and imported historical evidence. Payment signing is disabled. No funds or owner/operator credentials are needed for this walkthrough.

1. In the wallet menu, connect your own compatible NEAR Testnet wallet. Select **Verify identity** and explicitly sign the NEP-413 message. Connection alone is not authentication; a wallet that cannot sign this message cannot use the verified flow. No transaction is submitted by authentication.
2. On Overview, select **Start Judge Demo**. Sandbox state lives in the current browser tab, not the treasury or a shared database, and resets on reload, disconnect, account switch, or session expiry.
3. Open Procurement and run the agent review. Inspect the proposal ranking and CFO margin. Values are simulated.
4. Open Payments, select Happy path, check demo authorization and run the Guardian check. Simulate funding, authorization and settlement. Try the unapproved vendor and duplicate scenarios. These steps do not create transactions or move funds.
5. Open Audit trail. Session events are app-generated simulations. The separate **Verified Onchain Settlement** is historical evidence imported from a CLI lifecycle, not initiated by this application. Follow each transaction link and inspect the transfer and callback receipts; compare the live request status with the historical record.

The contract owner can fund and authorize escrow; the owner or operator can execute. A verified judge wallet does not receive either role. Read-only treasury data is separate from simulated policy values. Unknown transaction outcomes must never be retried automatically.

Wallet connection and signature support vary by provider. This guide does not claim a live judge-wallet end-to-end test; if verification is unavailable or rejected, reconnect and try a compatible Testnet wallet.
