# NEAR Testnet deployment plan

**Status: NO-GO for deployment and live settlement.** This is a preflight, not authorization to deploy, sign, send, fund an account, or enable payments. No Testnet contract or settlement is confirmed. Keep `PAYMENTS_ENABLED=false`. Do not rerun the initial database migration.

## Local preflight (no onchain action)

```sh
cargo test --locked --offline --manifest-path contract/Cargo.toml
CARGO_NET_OFFLINE=true cargo near build non-reproducible-wasm --locked --no-abi --manifest-path contract/Cargo.toml
sha256sum contract/target/near/agentledger_treasury.wasm
near --version
npm test
npm run lint
npm run build
npm run typecheck
```

Verified here: Rust 1.99.0, near-sdk 5.30.1 (Cargo.lock), `near-cli-rs 0.31.1`; the NEAR-optimized WASM is 164,899 bytes, SHA-256 `5f8ede8533f97ed166e3342556b090999e7d0d5db8afe4c6fe8af547c041b958`. Recheck the hash after any rebuild; compiler versions and flags can change it. The build alone does not establish Testnet runtime acceptance. The NEAR CLI Rust syntax below was checked against installed CLI help, not executed. Never use old JavaScript `near deploy` syntax with this plan.

## Isolated sandbox evidence (2026-11-11)

The original raw release WASM and the NEAR-optimized WASM both failed on the bundled near-sandbox 2.6.2 (protocol 77) with `PrepareError: Deserialization`. The current toolchain reports that near-sdk targets protocol 85. The optimized artifact above **passed** the original and expanded integration scenarios on near-sandbox 2.14.0 (protocol 88). This is local runtime evidence only; it does not establish compatibility with any particular public-network protocol version. Verify the target network before deployment.

The expanded sandbox scenario verified initializer and owner/operator restrictions, vendor allowlisting, expired/zero-deposit requests, over-budget authorization, duplicate payment IDs, successful execution and refund callback results, a failed transfer receipt followed by a successful failure callback and refund, final request states, liabilities, vendor balance, and duplicate-execution/refund rejection. A focused sandbox test also forced a real refund transfer failure: a sandbox-only owner contract deleted its disposable account before the treasury refund receipt. The receipt to the missing account failed, and the treasury callback returned false; status became Failed, the full 1 NEAR remaining and liability were restored, and the treasury balance did not fall. Recreating that local-only account allowed one successful refund, after which a duplicate was rejected. Recreating a named account is a test fixture and is not a public-network recovery guarantee. A Rust unit test also rejects a second refund while RefundPending. Authorization/execute after expiry and insufficient storage reserve remain unit-test-only. Sandbox tests cannot prove real-wallet authentication or public-network settlement.

To reproduce on Linux x86-64 with local bind permission and an existing Node installation, retrieve the official binary into temporary storage and run the sandbox only:

```sh
mkdir -p /tmp/agentledger-near-sandbox-2.14.0
curl -fL https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/Linux-x86_64/2.14.0/near-sandbox.tar.gz -o /tmp/agentledger-near-sandbox-2.14.0.tar.gz
tar -xzf /tmp/agentledger-near-sandbox-2.14.0.tar.gz --strip-components=1 -C /tmp/agentledger-near-sandbox-2.14.0
/tmp/agentledger-near-sandbox-2.14.0/near-sandbox --version
CARGO_NET_OFFLINE=true cargo near build non-reproducible-wasm --locked --no-abi --manifest-path contract/Cargo.toml
CARGO_NET_OFFLINE=true cargo near build non-reproducible-wasm --locked --no-abi --manifest-path tests/sandbox/refund-owner/Cargo.toml
NEAR_SANDBOX_BIN_PATH=1 NEAR_SANDBOX_BINARY_PATH=/tmp/agentledger-near-sandbox-2.14.0 npm run test:sandbox
```

The two environment variables work around the installed `near-sandbox` package's binary lookup. The test explicitly selects `network: sandbox`; its server requires local socket binding. The binary was downloaded from the NEAR project's distribution endpoint, but no independent binary checksum was verified in this run.

## Readiness gate (2026-11-11)

A read-only `EXPERIMENTAL_protocol_config` request to the application's Testnet RPC reported chain ID `testnet`, protocol 88 and storage price `10000000000000000000` yoctoNEAR per byte. This is a point-in-time response, not proof of the target account, balance, deployed code, or future protocol. The artifact was exercised locally against protocol 88; public-network runtime acceptance is unverified.

The server NEP-413 digest matches the installed wallet-selector serializer in a local test. Challenges expire in five minutes, are bound to an HttpOnly browser cookie, and are atomically consumed once; sessions are one-hour bearer cookies, not cryptographically device-bound. Server verification requires a currently valid Testnet full-access key. MyNearWallet uses a popup and returns the fields expected by the app, but real-wallet signing, popup interruption and redirect recovery are unverified. After interruption, begin a new authentication challenge; an interrupted payment stays locked and must not be resubmitted.

Server reconciliation now requires the original transaction's own boolean callback and matching final contract state for execute/refund outcomes. A `Failed` request by itself is ambiguous because a failed refund can follow a successful execution. The read-only preview never declares a terminal intent outcome from an unbound hash. See [the pending transaction runbook](PENDING_TRANSACTION_RUNBOOK.md). These changes are local and require deployment and review before use.

## Required inputs and configuration

- An existing, explicitly selected Testnet contract account, with authority to deploy and initialize; an existing Testnet owner and operator account; an existing Testnet vendor for later controlled testing. Do not create or fund them under this preflight.
- Public, non-secret shell variables `CONTRACT_ID`, `OWNER_ID`, and `OPERATOR_ID` for the future commands. Set them only after independently confirming the accounts and that deployment will not overwrite a contract or state. Contract account must sign initialization. No shell variable for private keys or seed phrases.
- App environment: server-only `DATABASE_URL` (existing configured Neon connection; never print it), exact `APP_ORIGIN` (HTTPS in production, no trailing slash), public `NEXT_PUBLIC_NEAR_CONTRACT_ID` after a verified deployment, and `PAYMENTS_ENABLED=false`. Wallet selector and RPC are configured for Testnet; RPC reads use `https://test.rpc.fastnear.com`.
- Confirm the contract account has sufficient available balance for the code, state, 2,048-byte additional reserve enforced by the contract, deployment/call gas, and liabilities. Each `create_request` attaches its escrow deposit; `set_vendor`, `create_request`, and `authorize` require account balance at least `liabilities + (storage_usage + 2048) * storage_byte_cost`. Do not treat escrow liabilities as spendable storage reserve.

The [NEAR account documentation](https://near.github.io/nearcore/DataStructures/Account.html) describes 1 NEAR per 100,000 bytes. At that stated rate, 164,899 bytes of WASM alone imply about **1.64899 NEAR** of storage backing and the 2,048-byte reserve another **0.02048 NEAR**. These are conditional estimates, not a verified current Testnet quote or total: account/state overhead, escrow liabilities and gas are additional. [Deployment gas scales with code size](https://near.github.io/nearcore/architecture/gas/index.html); no reliable fee quote was obtained. Verify current protocol parameters and available balance before any later deployment.

## Future deployment — separately authorized only

After resolving the blockers below, review the artifact hash and IDs. Set `CONTRACT_ID`, `OWNER_ID`, and `OPERATOR_ID` to the approved public Testnet account IDs. With a previously configured secure system keychain for the contract account, the following **signs and broadcasts** a deployment and initialization in one transaction; do not run during preflight:

```sh
near contract deploy "$CONTRACT_ID" use-file contract/target/near/agentledger_treasury.wasm \
  with-init-call new json-args "$(node -e 'process.stdout.write(JSON.stringify({owner:process.env.OWNER_ID,operator:process.env.OPERATOR_ID}))')" \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-keychain send
```

The three variables must be exported for the Node JSON encoder. Confirm the installed keychain method works on the operator's machine without exposing credentials. Do not substitute plaintext secrets. The `new` call requires predecessor = contract account and initializes owner and operator; deployment and initialization should be combined to avoid an uninitialized interval. Record the transaction and receipt outcome; a sent transaction is not proof of successful initialization.

After confirmed deployment, this is a read-only check (requires only the public `CONTRACT_ID`):

```sh
near contract call-function as-read-only "$CONTRACT_ID" get_roles json-args '{}' network-config testnet now
```

Compare returned roles with the approved IDs and independently verify the deployed code and final receipts. Only after a separate authorization and an end-to-end test plan should storage funding, allowlisting, escrow, authorization, execution, or refund transactions be considered. Keep the app's payment gate false until wallet authentication, controlled settlement and failure recovery have been validated and reviewed.

## Compatibility and state

`new(owner, operator)` is contract-account-only. Owner-only methods are `set_vendor(vendor, allowed)`, payable `create_request(request_id, expiry_ns)`, `authorize(request_id, payment_id, vendor, amount)`, and `refund(request_id)`. `execute(request_id)` accepts owner or operator; private `on_transfer(request_id)` and `on_refund(request_id, amount)` accept contract callbacks. Views: `get_request`, `get_payment_request`, `is_vendor_allowed`, `get_liabilities`, `get_roles`.

The onchain lifecycle is `Funded → Authorized → Pending → Completed/Failed`; refund from Funded, Authorized, Failed or Completed with remaining funds goes through `RefundPending → Refunded/Failed`. A pending or unresolved callback must not be retried blindly. `authorize` enforces future expiry, allowlisted vendor, positive amount within remaining budget, and globally unique payment ID; execute rechecks expiry and allowlist. Callback failure restores liabilities and remaining balance. A callback that cannot complete can leave funds/state pending and requires investigation; there is no administrative pending-state recovery method. The minimum safe improvement is an operational, read-only recovery runbook and monitoring that preserves the original transaction hash and all receipt outcomes, checks final chain state, and escalates unresolved Pending/RefundPending cases without retrying. A future recovery mechanism needs independent review and proof of the original transfer outcome; no administrative override is added here.

Frontend action arguments match contract names and JSON integer strings. Durable intent claims currently accept only `create_request`, `authorize`, `execute`, and `refund`; bootstrap `initialize`, `storage_funding`, and `allow_vendor` are previews, not available through that claim API. The API preflight requires the authenticated signer to be the contract **owner**, although the contract also permits its operator to execute. The testnet wallet signs a NEP-413 message; the server validates the signature against a current finalized full-access key and a single-use browser-bound challenge. Real wallet compatibility and redirect recovery are unverified. Durable states are CREATED → AWAITING_SIGNATURE → SUBMITTED/UNKNOWN → final states, with UNKNOWN locked against another claim.

## Stop and recovery conditions

- Stop if account identity, network, existing code/state, artifact hash, available storage reserve, ownership, or final receipts cannot be verified. Do not overwrite an existing account's contract accidentally.
- Stop on unknown transaction or callback outcome; preserve hash and original IDs, inspect final transaction and receipts and query final contract state before any decision. Never automatically resubmit or assume a timeout failed.
- Keep signing disabled on failed wallet authentication, mismatch between owner and signer, insufficient storage, unresolved intent, or mismatch between app and onchain state.
- Deployment cannot be undone as a transaction. Do not replace code or delete accounts as a rollback while liabilities or pending callbacks exist. Any recovery or upgrade requires a separately reviewed and authorized procedure and preservation of state and funds.
- Before GO: verify actual wallet NEP-413 and redirect handling, independently review treasury and recovery design, and confirm intended accounts, reserves and exact network configuration. The local sandbox test creates accounts and signs transactions only in an isolated sandbox; it does not interact with Testnet.
