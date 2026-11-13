# AgentLedger OS V2 — Security

AgentLedger OS V2 is a NEAR Testnet project, not an independently audited production financial system.

- Wallet owners explicitly approve blockchain transactions.
- Browser identity verification uses signed wallet messages.
- Payment intents and wallet sessions are owner-scoped.
- Uncertain transaction outcomes remain locked against automatic retries.
- Final payment states require verification of blockchain evidence.
- The configured contract ID and expected code hash are checked before payment preparation.

Successful Execute and Refund transactions demonstrate two real Testnet flows, not complete security assurance.

Do not commit private keys, seed phrases, credentials, or database connection strings.

See [README](README.md), [Judge Guide](JUDGE_GUIDE.md), and [historical V1 security review](docs/archive/v1/SECURITY.md).
