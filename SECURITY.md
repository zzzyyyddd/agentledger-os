# Security and deployment status

**Do not deploy or fund this prototype yet.** The contract compiles and its local unit tests pass, but it has not received an independent audit or testnet integration testing. It is not a production financial system.

## Boundaries

- AI text is untrusted and never authorizes a transfer. Structured input validation limits proposal shape; the optional model sees numerical fields only, has no tools, and its output is length checked. A hostile model response is displayed as text, not HTML.
- The deterministic Guardian and demo checkbox are illustrative only; contract owner calls must enforce real authorization. Browser state is mutable and is not proof.
- The intended contract independently checks owner/operator identity, allowlist, expiry, amount versus escrow, request status, and permanent payment ID uniqueness. It marks pending before asynchronous transfer and prevents duplicate release/refund while pending.
- Unknown outcomes are not failures. Preserve the original ID and transaction hash, inspect transaction receipts and finalized contract state, and do not retry while uncertainty remains. A missing ID in a finalized view does not by itself prove that an in-flight transaction cannot land.
- The API is unauthenticated and has no rate limits; adding paid AI credentials to a public deployment creates abuse and cost risk. Add authentication, rate limits, request size limits, provider allowlisting and operational monitoring first.

## Contract review items before funding

The contract tracks outstanding escrow liabilities and checks account balance against those liabilities plus current storage usage and a 2,048-byte cushion before storage growth and transfer initiation. Storage costs are funded separately from request deposits by the contract account. This accounting is new and has only unit tests: verify account-balance and promise timing, storage growth, pending receipts, and reserve sizing in a NEAR sandbox before funding or deployment. State grows permanently with request and payment IDs. There is no recovery mechanism if a callback fails or runs out of gas: `Pending` or `RefundPending` may remain stuck and manual investigation is necessary. Adding a recovery path requires careful proof that no outstanding receipt can later succeed. Test storage staking, asynchronous failures, callback gas, race conditions, and malicious account behavior in sandbox and testnet before use. Verify the current SDK, build reproducibly with a lockfile, and obtain an independent review. Owner/operator rotation and durable event indexing are also absent.

There are no private keys in this repository. Never put seed phrases or keys in frontend code, environment examples, logs, or documentation.

## Dependency status

On 2026-11-11 a fresh `npm audit` was blocked by DNS (`EAI_AGAIN`) in this execution environment. The npm install reported 26 findings: 14 low, 7 moderate, 4 high and 1 critical; advisory details could not be verified by the later audit. The wallet-selector install reported 19 vulnerabilities (10 low, 7 moderate, 2 high), but its full audit response was not retained. Cached advisory metadata indicates additional potential issues; it is not a substitute for a fresh audit. Relevant installed paths include `next@15.5.29 > postcss@8.4.31`, `eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces@3.0.3`, and `@near-wallet-selector/core > @near-js/crypto > secp256k1 > elliptic@6.6.1`; the direct `zod@3.25.76` also appears in cached oversized-collection advisories. Re-run `npm audit` on a connected host for current exact findings and safe fixes. The evaluate API now caps input at 16 KiB and checks the number of proposals before schema validation, which limits one attack surface but does not make dependencies vulnerability-free.

The contract callback uses `promise_result_checked` with a zero-byte read bound. `TooLong` denotes a successful promise and is treated as success; only `Failed` restores funds. Callback execution failure can still leave a request pending indefinitely. No owner override is provided because a late receipt could otherwise permit duplicate payment.

Initialization now requires the predecessor to be the contract account, with a unit test for unauthorized callers. Deploy and initialize atomically under control of that account and independently verify owner and operator. This protects only as long as the contract account keys are controlled securely; verify the deployment procedure in a sandbox before using funds.

## Intent integration boundary

The server uses a private PostgreSQL connection, NEP-413 full-access wallet signature verification, one-use database challenges, HttpOnly sessions, owner-scoped access, atomic unique claims and optimistic transitions. Database objects revoke PUBLIC access; keep the database role and credentials private and restrict network access. The integration is unverified against live PostgreSQL and wallets; keep signing disabled until end-to-end testing and security review. Secure the origin, add abuse controls and rate limits, monitor sessions, and establish reviewed recovery and backup procedures before deployment.

A transaction is not confirmed from its hash alone. Matching transaction details and final contract state are required; pending callbacks, RPC errors and uncertain outcomes remain locked. Terminal transaction failures for asynchronous settlement are not sufficient to prove that a transfer did not occur.

The near-workspaces installation previously reported 26 npm audit findings (14 low, 7 moderate, 4 high, 1 critical); this is an install-time snapshot. Review the dependency tree before relying on it.
