# AgentLedger OS V2

AgentLedger V2 provides a read-only NEAR Testnet payment history and transaction verification experience at `/`. Nightly and Sender support NEP-413 wallet authentication. Payment signing and creation are disabled in application code. UNKNOWN transactions remain unresolved until backed by authoritative chain evidence.

The deployed contract is `agentledger-v2.agentledger-owner.testnet`. The application uses the `agentledger_v2` schema and requires `V2_DATABASE_URL` to identify the verified isolated test-branch endpoint with `sslmode=verify-full`. It never falls back to `DATABASE_URL`. Do not commit credentials or alter V1 data. See [judge guide](JUDGE_GUIDE.md) and [V2 deployment evidence](V2_TESTNET_DEPLOYMENT_EVIDENCE.md).

For local development, copy `.env.example` to an untracked `.env.local`, configure the verified V2 database credential locally and set `APP_ORIGIN`. Do not run a migration or send blockchain transactions.

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```
