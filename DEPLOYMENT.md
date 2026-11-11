# GitHub, Vercel and PostgreSQL setup

The production build can run in **DEMO mode** without `DATABASE_URL`. Durable wallet authentication and payment signing are disabled without a valid database configuration. Keep `PAYMENTS_ENABLED=false`: neither live Neon nor wallet signing has been verified. No deployment or migration has been performed.

1. Review the files and initialize Git, then create and push a GitHub repository only with owner approval. Import that repository in Vercel only with separate approval.
2. In the Vercel project, provision a new Neon database through the Vercel Marketplace integration and connect it to the project. Use a dedicated, empty database and protect its connection string. A pooled PostgreSQL URL with TLS is suitable for serverless connections; use the URL provided by Neon. Review the database and environment target before applying anything.
3. Set these Vercel environment variables for the intended environment:
   - `DATABASE_URL`: server-only Neon PostgreSQL connection string, including TLS settings.
   - `APP_ORIGIN`: exact HTTPS origin of the deployment, without a trailing slash. Set the appropriate origin for each environment; preview URLs must match exactly.
   - `NEXT_PUBLIC_NEAR_CONTRACT_ID`: public testnet contract account ID, when available; it is not a secret.
   - `PAYMENTS_ENABLED=false`.

   Optional server-only `AI_API_URL`, `AI_API_KEY`, and `AI_MODEL` enable AI explanations. Do not put secrets in `NEXT_PUBLIC_` variables. The unauthenticated AI endpoint needs abuse controls before use with a paid key.
4. After independently confirming that `DATABASE_URL` identifies the **new dedicated empty database**, set it in your shell (without printing or committing it), then run from the repository root:

   ```sh
   npm run db:migrate -- --confirm-empty-database
   ```

   The initial migration runs in one transaction and refuses a nonempty public schema; the flag is your explicit confirmation of the target. It is not an upgrade command and must not be run against an unknown or existing production database. Use the same database role to run the app, or explicitly grant the application role the required table and function privileges. Restrict database access to trusted server roles. Backups, recovery and reviewed subsequent migrations are required before real use.
5. Test database connectivity, challenge replay, concurrent claims, authorization and reconciliation with a controlled database and wallet. Keep signing disabled until those checks and an independent security review are complete. Contract deployment, wallet creation and blockchain writes require separate authorization.

Authentication checks a NEP-413 signature against a current finalized full-access key, consumes a browser-bound challenge once, and uses an owner-scoped session. Claims and transitions use database uniqueness and version checks. `UNKNOWN` remains locked with no automatic retry. Reconciliation checks the final transaction and relevant contract state; a hash alone is not proof of settlement. Rate limits, session revocation, operational recovery, sandbox coverage and external review remain outstanding.
