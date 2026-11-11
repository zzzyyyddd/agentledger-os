# Deployment and database operations

**Phase 12 is not ready for public payments.** Keep `PAYMENTS_ENABLED=false` and `JUDGE_PAYMENTS_ENABLED=false`. Do not deploy a Judge Treasury, enable payment controls, or send a Testnet transaction without explicit approval. The separately deployed historical treasury and its evidence are preserved.

Vercel server-only configuration requires `DATABASE_URL` (Neon pooled PostgreSQL with TLS), `APP_ORIGIN` (the exact HTTPS origin, with no trailing slash), `PAYMENTS_ENABLED=false`, `JUDGE_PAYMENTS_ENABLED=false`, `JUDGE_TREASURY_CONTRACT_ID`, and `JUDGE_TREASURY_WASM_SHA256`. The last two must reference only a separately approved Judge Treasury after code-hash verification; leave them unset until then. `NEXT_PUBLIC_NEAR_CONTRACT_ID` is the existing historical treasury configuration. Never expose credentials through public variables or logs.

The existing Neon database already has its initial migration. **Do not run the empty-database migration again.** The new [judge lock migration](db/migrations/202611110002_judge_intent_lock.sql) adds a function and does not reset tables. Review its locking, privileges, rollback and target database before separately approving any migration. It has not been tested against live Neon in this environment. The [always-on preflight](PHASE12_ALWAYS_ON_PREFLIGHT.md) gives the prepared migration, isolated live test, build and future deployment commands.

Rollback preparation: first disable the judge gate and confirm no in-flight operations require reconciliation. Do not delete intent records or drop tables. The new function can be removed only after confirming no deployed serverless instance calls it and reviewing privileges; existing intents remain needed for recovery. Restore the previous application deployment if necessary. Do not drop or roll back contract state or erase transaction evidence.

Before enabling anything, complete independent contract and application security review, exact-WASM sandbox testing, concurrent Neon testing, wallet transaction and callback testing on an approved Testnet deployment, refresh/reconnect/device recovery, RPC/database outage tests, and a laptop-off test from the deployed website. All public spending and deployment remain separate approval gates.

## Phase 12 production migration preflight

Do not run the following until the target and change have been reviewed and separately authorized. Confirm the target through the provider dashboard and a read-only connection; obtain a recoverable Neon backup or branch, confirm the application role and migration role, and keep both payment flags false. No connection string should be printed or placed in shell history.

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

Confirm the judge function is absent before the first application, and confirm the app role has the required table and function permissions separately. Do not overwrite an existing function or continue if the target, dependencies or privileges differ from expectations. After approval, run the prepared `psql -v ON_ERROR_STOP=1 -1 -f ...` command in [the preflight](PHASE12_ALWAYS_ON_PREFLIGHT.md). Its single transaction rolls back the new function and privilege change if the script errors. It does not rerun the initial migration, delete rows, or truncate tables.

After commit, repeat the read-only function query and check `has_function_privilege` for the actual app role; then run the opt-in uniquely scoped two-connection test against an **authorized target**. The test creates and cleans only its own fixtures. Verify cleanup and ensure normal application authentication still works before considering enablement. The reported development migration and concurrency checks passed; production has not been migrated or tested in this phase.

If application rollback is required, disable the judge flag first and retain the Judge Treasury account ID, expected hash, database configuration, all intent rows and transaction hashes for recovery; changing or removing those settings can make existing intent recovery unavailable. Restore the prior application deployment. Remove the added function only after confirming no active serverless instance uses it, a reviewed rollback is approved, and the schema owner executes the exact signature `public.claim_judge_intent(text,text,text,text,text,text,text,jsonb)`. Never remove payment tables or use migration rollback as a way to release an UNKNOWN operation.

## PostgreSQL TLS

The installed `pg-connection-string` warns that `sslmode=require`, `prefer`, and `verify-ca` currently behave like `verify-full`, but may adopt weaker libpq-compatible meanings in a future major release. For a Neon endpoint whose certificate chain is trusted by Node, configure the existing secret URL with **`sslmode=verify-full`** and preserve any provider-required parameters. Do not print the URL or set `rejectUnauthorized=false`. Confirm hostname and certificate-chain validation with a controlled connection before changing production; a private CA may require an explicitly trusted root. For `psql`, confirm the installed libpq version and trusted-root configuration independently.

When using node-postgres, connection-string SSL parameters can replace a separately supplied `ssl` object, so do not assume `{rejectUnauthorized:true}` overrides `sslmode` embedded in the URL. See the [node-postgres SSL documentation](https://node-postgres.com/features/ssl) and [Neon's discussion of certificate verification](https://neon.com/blog/avoid-mitm-attacks-with-psql-postgres-16). No production environment variable was changed here.
