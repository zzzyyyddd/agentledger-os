# AgentLedger OS V2

AgentLedger OS V2 combines a guided NEAR Testnet payment workflow with rule-based procurement, CFO and Guardian checks. Each live step requires the owner's wallet; NEP-413 signatures authenticate the server session. The checks are advisory and the independent V2 contract enforces payment ownership, recipient binding, expiry and replay protection.

V2 uses its own contract configuration and PostgreSQL schema. It does not import V1 payment history or use V1 intent locks. V2 payments are disabled until a separate contract is deployed and verified, the V2 migration is reviewed and applied to an authorized target, and real wallet recovery has been tested. Unknown outcomes remain locked; do not submit them again blindly. See [V2 reset](V2_RESET.md), [contract readiness](V2_CONTRACT_READINESS.md) and the [deployment plan](V2_TESTNET_DEPLOYMENT_PLAN.md).

## Local development

Use Node 22 and Rust. Copy `.env.example` to an untracked `.env.local` and leave `PAYMENTS_ENABLED=false` and `V2_PAYMENTS_ENABLED=false`. Never commit keys, seed phrases or database connection strings. A verified separate V2 contract ID and WASM SHA-256 are required before wallet configuration is available.

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
CARGO_TARGET_DIR=contract/target cargo test --offline --locked --manifest-path v2-contract/Cargo.toml
CARGO_TARGET_DIR=contract/target cargo build --offline --locked --manifest-path v2-contract/Cargo.toml --target wasm32-unknown-unknown --release
NEAR_SANDBOX_BIN_PATH=1 NEAR_SANDBOX_BINARY_PATH=/path/to/near-sandbox-directory node --test tests/sandbox/v2-treasury.test.mjs
```

The V2 sandbox test needs a compatible near-sandbox runtime, such as 2.14.0; sandbox transactions are local. The release migration is [202611130001_v2_namespace.sql](db/migrations/202611130001_v2_namespace.sql). It has not been applied. The legacy `npm run db:migrate` script applies only the old empty-database V1 schema and must not be used to install V2. Do not execute a database migration, contract deployment, Testnet transaction or production change without the relevant authorization.
