# V2 migration validation

> **Historical validation snapshot — not the current deployment status.**
>
> This document records an earlier V2 migration validation checkpoint.
> Statements about unapplied Neon migrations, deployment readiness, or
> NO-GO decisions describe the environment at the time of that checkpoint.
>
> Subsequent application tests and real NEAR Testnet Execute/Refund
> transactions have been documented separately. Those results do not,
> by themselves, prove that every database migration or production
> configuration has been independently revalidated.
>
> For current project documentation, see [README](README.md),
> [Deployment](DEPLOYMENT.md), and
> [V2 Testnet Evidence](V2_TESTNET_DEPLOYMENT_EVIDENCE.md).
>

The repository migration `db/migrations/202611130001_v2_namespace.sql` creates the independent `agentledger_v2` schema, V2 wallet challenges, wallet sessions and payment intents. Static review found the expected challenge nonce and intent business-key uniqueness, authorization reference index, recovery fields, versioned transitions, and per-owner/contract unresolved-intent lock. Active V2 APIs query this schema; retired V1 payment-intent endpoints return 410. UNKNOWN outcomes remain locked except for the narrowly verified V2 on-chain creation recovery path.

No Neon credentials or verified nonproduction Neon branch were found in the current environment. The migration has not been applied or exercised against Neon. Static inspection and mocked application tests do not establish database isolation, concurrency behavior, migration repeatability, or application-role privileges. The migration is intentionally not idempotent: its unguarded `CREATE SCHEMA` and object creation will reject a repeat; run any future approved migration transactionally and do not blindly rerun it. Existing V1 authentication and payment objects are not modified by the V2 migration.

After identifying and authorizing a nonproduction branch, independently verify its provider project and branch against the connection endpoint, confirm backup and role boundaries, then use `db/preflight/v2_readonly.sql` as the migration and application roles. A database name or a catalog query alone is not proof of a Neon branch. Review separate role grants: schema USAGE, table operations, and execution of both the judge claim function and the lower-level claim function it invokes, along with transition and challenge functions. Test challenge uniqueness, session ownership, claim and authorization uniqueness, concurrent claims, UNKNOWN lock and recovery, role permissions and safe repeated-migration behavior. Do not run the V1 migration helper or cleanup proposal as a V2 migration.

The application default and `.env.example` identify `agentledger-v2.agentledger-owner.testnet`; the configured WASM SHA-256 remains required and is verified before signing. Both payment flags remain disabled in the example. A read-only finalized Testnet check on 2026-11-13 verified the deployed WASM SHA-256 `7c38929d075d06e47a9af6472387939f5473d27e4e3ced7d88e2eaf0244c3d27` and zero liabilities. No Neon migration, production change or blockchain transaction was executed during this validation.
