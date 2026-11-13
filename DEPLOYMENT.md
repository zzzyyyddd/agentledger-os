# AgentLedger OS V2 — Deployment

The active application is AgentLedger OS V2 on NEAR Testnet.

- Production application: https://agentledger-os.vercel.app
- Active contract: `agentledger-v2.agentledger-owner.testnet`
- Contract source: [`v2-contract/`](v2-contract/)
- Deployment evidence: [V2 Testnet evidence](V2_TESTNET_DEPLOYMENT_EVIDENCE.md)
- Environment configuration: [`.env.example`](.env.example)

The V2 application uses `V2_DATABASE_URL` and the isolated `agentledger_v2` PostgreSQL schema.

The V2 payment gate requires `V2_PAYMENTS_ENABLED=true` with both legacy payment flags disabled. Each blockchain operation requires explicit wallet approval.

Historical V1 deployment instructions are preserved in [the V1 archive](docs/archive/v1/DEPLOYMENT.md).
