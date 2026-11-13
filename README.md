# AgentLedger OS V2

AgentLedger OS V2 is a NEAR Testnet treasury workspace for reviewing, authorizing, executing, refunding, and reconciling owner-scoped payments. Nightly and Sender wallets support NEP-413 identity verification. Live transaction signing requires an enabled V2 payment gate and explicit wallet approval for each action; availability depends on the deployed configuration. Uncertain transactions remain locked for verification and must not be automatically retried.

The V2 contract is `agentledger-v2.agentledger-owner.testnet`. The initial application payment cap is 0.01 NEAR; creating a request also requires a 0.03 NEAR nonrefundable storage contribution, plus network fees. The application uses the isolated `agentledger_v2` schema through `V2_DATABASE_URL` and does not fall back to `DATABASE_URL`.

See the [judge guide](JUDGE_GUIDE.md) for execution and refund walkthroughs with historical Testnet evidence, and [deployment evidence](V2_TESTNET_DEPLOYMENT_EVIDENCE.md) for transaction details. The Judge Demo also links directly to both completed scenarios; its separate simulated walkthrough is labeled as such.

For local development, copy `.env.example` to an untracked `.env.local` and configure the appropriate verified V2 database credential and `APP_ORIGIN`. Never commit credentials or alter V1 data.

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```
