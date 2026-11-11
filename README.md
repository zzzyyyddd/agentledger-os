# AgentLedger OS

AgentLedger OS combines procurement analysis, a deterministic Guardian, and NEAR Testnet treasury workflows. The deployed historical treasury and its imported settlement evidence are separate from the browser-only Judge Sandbox and the **disabled, undeployed Phase 12 Judge Treasury**. Phase 12 is not approved or verified for real payments.

The sandbox uses sample values and never submits a transaction. The proposed live workflow uses an owner's browser wallet for each transaction; a NEP-413 identity signature is only for server authentication. A deterministic procurement/CFO assessment and Guardian preview are saved with each intent. They are advisory; the contract independently enforces ownership, amount caps, recipient binding, expiry and replay rules. No AI model has authority to move funds.

Phase 12 uses Vercel serverless routes, Neon PostgreSQL and public NEAR Testnet RPC; it is designed not to need a developer laptop. The new database migration, live-wallet flow, device recovery, and laptop-off operation have **not** been verified. Unknown submissions remain locked and may require recovering the original transaction hash. See [the always-on preflight](PHASE12_ALWAYS_ON_PREFLIGHT.md), [security architecture](SECURITY.md), and [judge guide](JUDGE_GUIDE.md).

## Local development

Node 22 and Rust are required. Copy `.env.example` to an untracked `.env.local`; leave both payment gates false. Never put keys, seed phrases or a database URL in source control.

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
cargo test --manifest-path contract/Cargo.toml
CARGO_TARGET_DIR=contract/target cargo test --manifest-path judge-contract/Cargo.toml
```

Local NEAR Sandbox tests require the compatible sandbox runtime and built contract artifacts; see the preflight document. Sandbox transactions are local only. The initial database migration is for a new empty database and must not be rerun on the existing Neon instance. The separate judge lock migration must be reviewed and applied only to an authorized target; it has not been applied here.

Public deployment of the separate Judge Treasury and any public transaction require explicit approval. The historical treasury must not be upgraded or replaced as part of Phase 12.
