# AgentLedger V2 judge guide

AgentLedger V2 is a read-only NEAR Testnet experience. Payment transactions and wallet transaction signing are disabled.

1. Open `/` and connect a Nightly or Sender Testnet wallet.
2. Select **Verify identity** and sign the NEP-413 authentication message. This is not a blockchain transaction.
3. Review the payment lifecycle and the authenticated wallet's finalized V2 payment history.
4. For a saved intent, select **Verify on Testnet**. UNKNOWN means unresolved: do not submit a replacement transaction. A transaction explorer link appears only after verification of its original hash.

The contract is `agentledger-v2.agentledger-owner.testnet`. If identity or history is unavailable, check the server's isolated V2 database configuration. A live payment has not been demonstrated in this release.
