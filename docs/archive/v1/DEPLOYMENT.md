# Deployment and database operations

> **V2 release:** The Phase 12 instructions below are historical and do not configure the current V2 application. Use [V2 contract readiness](../../../V2_CONTRACT_READINESS.md), [V2 reset](../../../V2_RESET.md), [the V2 deployment plan](../../../V2_TESTNET_DEPLOYMENT_PLAN.md), and `.env.example`. `npm run db:migrate` installs the legacy V1 schema; it does not apply the V2 migration. The statements below are historical phase observations, not the current V2 deployment status.

**Phase 12 is not ready for public payments.** Keep `PAYMENTS_ENABLED=false` and `JUDGE_PAYMENTS_ENABLED=false`. The Judge Treasury is already deployed and initialized. Do not redeploy it, enable payment controls, or send a Testnet transaction without explicit approval. The separately deployed historical treasury and its evidence are preserved.

Vercel server-only configuration requires `DATABASE_URL` (Neon pooled PostgreSQL with TLS), `APP_ORIGIN` (the exact HTTPS origin, with no trailing slash), `PAYMENTS_ENABLED=false`, `JUDGE_PAYMENTS_ENABLED=false`, `JUDGE_TREASURY_CONTRACT_ID`, and `JUDGE_TREASURY_WASM_SHA256`. The latter two are optional public-value overrides; when unset, source defaults identify the deployed Judge Treasury and reviewed WASM hash. Verify any override against finalized Testnet code before use. Both payment flags remain false pending approval. `NEXT_PUBLIC_NEAR_CONTRACT_ID` is the existing historical treasury configuration. Never expose credentials through public variables or logs.

The existing Neon database already has its initial migration. **Do not run the empty-database migration again.** The new [judge lock migration](../../../db/migrations/202611110002_judge_intent_lock.sql) adds a function and does not reset tables. Review its locking, privileges, rollback and target database before separately approving any migration. It has not been tested against live Neon in this environment. The [always-on preflight](PHASE12_ALWAYS_ON_PREFLIGHT.md) gives the prepared migration, isolated live test, build and future deployment commands.

Rollback preparation: first disable the judge gate and confirm no in-flight operations require reconciliation. Do not delete intent records or drop tables. The new function can be removed only after confirming no deployed serverless instance calls it and reviewing privileges; existing intents remain needed for recovery. Restore the previous application deployment if necessary. Do not drop or roll back contract state or erase transaction evidence.

Before enabling anything, complete independent contract and application security review, exact-WASM sandbox testing, concurrent Neon testing, wallet transaction and callback testing on an approved Testnet deployment, refresh/reconnect/device recovery, RPC/database outage tests, and a laptop-off test from the deployed website. All public spending and deployment remain separate approval gates.

## Phase 12 production migration preflight

Do not run the following until the target and change have been reviewed and separately authorized. Confirm the target through the provider dashboard and a read-only connection; obtain a recoverable Neon backup or branch, confirm the application role and migration role, and keep both payment flags false. No connection string should be printed or placed in shell history.

The prepared read-only catalog checks can be run for the migration role and separately for the actual application role:

```sh
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/preflight/judge_production_readonly.sql
```

The output identifies the connected database and role and lists functions, privileges, indexes and constraints. **Those SQL values alone do not prove a Neon project or branch.** Independently match the connection's compute endpoint to the intended project and branch in the Neon console without printing the URL. A pooled server address can be a proxy. Confirm the migration role's CREATE privilege and the app role's individual table and EXECUTE privileges separately.

Read-only prerequisites (run with the intended migration role):

```sql
SELECT current_database(), current_user;
SELECT to_regclass('public.payment_intents') AS intents,
       to_regclass('public.wallet_challenges') AS challenges,
       to_regclass('public.wallet_sessions') AS sessions;
SELECT to_regprocedure('public.claim_payment_intent(text,text,text,text,text,text,text,jsonb)') AS claim,
       to_regprocedure('public.transition_payment_intent(uuid,text,integer,text,text,text)') AS transition,
       to_regprocedure('public.claim_judge_intent(text,text,text,text,text,text,text,jsonb)') AS judge_claim;
SELECT has_schema_privilege(current_user,'public','CREATE') AS schema_create,
       has_table_privilege(current_user,'public.payment_intents','SELECT,INSERT,UPDATE') AS intent_access,
       has_function_privilege(current_user,'public.claim_payment_intent(text,text,text,text,text,text,text,jsonb)','EXECUTE') AS claim_access;
```

Confirm the judge function is absent before the first application, and confirm the app role has the required table and function permissions separately. **The migration is not idempotent**: `CREATE FUNCTION` fails if that signature exists. Do not blindly rerun it or replace an existing function; inspect the catalog definition and migration history first. After approval, run the prepared `psql -v ON_ERROR_STOP=1 -1 -f ...` command in [the preflight](PHASE12_ALWAYS_ON_PREFLIGHT.md). Its single transaction rolls back the new function and privilege change if the script errors. It does not rerun the initial migration, delete rows, or truncate tables. PUBLIC execute is revoked; if the app uses a separate role, verify and separately grant that trusted role EXECUTE after approval.

After commit, repeat the read-only function query and check `has_function_privilege` for the actual app role; then run the opt-in uniquely scoped two-connection test against an **authorized target**. The test creates and cleans only its own fixtures. Verify cleanup and ensure normal application authentication still works before considering enablement. The reported development migration and concurrency checks passed; production has not been migrated or tested in this phase.

If application rollback is required, disable the judge flag first and retain the Judge Treasury account ID, expected hash, database configuration, all intent rows and transaction hashes for recovery; changing or removing those settings can make existing intent recovery unavailable. Restore the prior application deployment. Remove the added function only after confirming no active serverless instance uses it, a reviewed rollback is approved, and the schema owner executes the exact signature `public.claim_judge_intent(text,text,text,text,text,text,text,jsonb)`. Never remove payment tables or use migration rollback as a way to release an UNKNOWN operation.

Only after that separate rollback approval, the schema owner may use this transactional function-only rollback; it does not delete intent rows:

```sql
BEGIN;
DROP FUNCTION public.claim_judge_intent(text,text,text,text,text,text,text,jsonb);
COMMIT;
```

## PostgreSQL TLS

The installed `pg-connection-string` warns that `sslmode=require`, `prefer`, and `verify-ca` currently behave like `verify-full`, but may adopt weaker libpq-compatible meanings in a future major release. For a Neon endpoint whose certificate chain is trusted by Node, configure the existing secret URL with **`sslmode=verify-full`** and preserve any provider-required parameters. Do not print the URL or set `rejectUnauthorized=false`. Confirm hostname and certificate-chain validation with a controlled connection before changing production; a private CA may require an explicitly trusted root. For `psql`, confirm the installed libpq version and trusted-root configuration independently.

When using node-postgres, connection-string SSL parameters can replace a separately supplied `ssl` object, so do not assume `{rejectUnauthorized:true}` overrides `sslmode` embedded in the URL. See the [node-postgres SSL documentation](https://node-postgres.com/features/ssl) and [Neon's discussion of certificate verification](https://neon.com/blog/avoid-mitm-attacks-with-psql-postgres-16). No production environment variable was changed here.
