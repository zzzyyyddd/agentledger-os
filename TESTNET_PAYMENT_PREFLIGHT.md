# Phase 11: Testnet payment preflight

**NO-GO for a public payment.** This document plans a future, separately authorized test. This phase sends no public transactions; `PAYMENTS_ENABLED` remains false. Do not change roles or an allowlist, fund escrow, or sign a transaction during preflight. No Testnet payment is claimed to have succeeded.

## Verified read-only snapshot

At finalized Testnet block 277182946 (2026-11-11T07:14:08Z), the deployed `agentledger-treasury.testnet` code bytes hashed to `5f8ede8533f97ed166e3342556b090999e7d0d5db8afe4c6fe8af547c041b958`. `get_roles` returned owner `agentledger-owner.testnet` and operator `agentledger-operator.testnet`; `get_liabilities` returned `0`. Treasury account balance was 9.9986273196250362 NEAR, storage backing 1.65233 NEAR, and the contract's additional 2,048-byte storage guard brought the storage requirement to 1.67281 NEAR. The balance covered the guard plus reported liabilities at that block; this is not a spendable-balance claim, particularly while transfers are pending. The owner balance was 10 NEAR and demo-user balance was 5 NEAR at that block, before any storage and gas requirements. Account balance does not prove key control.

The user has not identified a vendor. As an explicit **candidate only**, `is_vendor_allowed({"vendor":"agentledger-demo-user.testnet"})` returned `false`. This does not enumerate the allowlist or authorize adding that account. Select an existing approved vendor and check its status immediately before any future action.

A read-only check found request `phase11-2829f77b-a4be-4673-8035-8e074cf6d645` and payment `phase11-pay-2829f77b-a4be-4673-8035-8e074cf6d645` absent at that block. They are example identifiers, not reserved; rerun the check immediately before use. All observations can change.

## Signers and prerequisites

| Operation | Contract permission | Current application restriction |
| --- | --- | --- |
| `create_request(request_id, expiry_ns)` | Owner only, attaches escrow deposit | Authenticated owner only |
| `authorize(request_id, payment_id, vendor, amount)` | Owner only | Authenticated owner only |
| `execute(request_id)` | Owner or operator | Authenticated owner only |
| `refund(request_id)` | Owner only | Authenticated owner only |

The demo user is neither owner nor operator: it cannot fund escrow through `create_request`, authorize, execute, or refund. Sending a plain transfer to the contract does not create an escrow request. It may receive a payment only if the owner has separately allowlisted it; that is not currently true. Wallet identity authentication does not grant owner permissions.

Before a future pilot, independently verify: operator controls the existing owner's full-access key in a compatible wallet; the exact owner identity can complete the existing NEP-413 flow; the selected vendor exists, is currently allowlisted, and is intended to receive funds; deployed code hash and roles still match; the owner's available funds cover 0.01 NEAR plus gas and its account's storage; treasury balance covers liabilities plus its storage guard; no unresolved payment or pending callback exists for the IDs. Reported balances include storage backing and are not a guarantee of spendable funds. Confirm a reviewed audit/recovery process and explicit user approval for each public operation. This preflight does not verify real wallet signing or change the server gate.

## Repeatable read-only preflight

From the repository root, this command reads public Testnet data, chooses fresh UUID-based request and payment IDs, checks their absence at a finalized snapshot, and checks the demo user only as a candidate vendor:

```sh
node --import tsx scripts/preflight-testnet.ts
```

Record its finalized block, IDs and output. A failed or partial RPC check is a stop condition. Check any separately chosen vendor with an explicit read-only call, replacing the public account ID and confirming the returned value is `true`:

```sh
near contract call-function as-read-only agentledger-treasury.testnet is_vendor_allowed json-args '{"vendor":"YOUR-APPROVED-VENDOR.testnet"}' network-config testnet now
```

Re-run the reader and verify the selected IDs remain absent before proceeding. The contract only exposes membership by vendor; the preflight does not claim to list all allowed vendors. The local NEON database is not queried or modified by this script.

## Future first transaction and lifecycle — do not execute during Phase 11

Use the following **UI actions only after separate authorization and all blockers are resolved**. The present server gate blocks the claim; it must not be bypassed with a direct CLI transaction, because the app would lack the corresponding durable intent. Any future gate change requires its own approval and validation.

1. Connect `agentledger-owner.testnet`, open the wallet menu, explicitly verify identity, and confirm the session remains that account. In Payments choose **Create and fund escrow**; contract `agentledger-treasury.testnet`, signer `agentledger-owner.testnet`, request ID from the new preflight output, amount `0.01` NEAR. Set expiry at least 24 hours in the future in the local date/time control and review the intended UTC time. The app converts this to a positive future `expiry_ns` in nanoseconds; the contract rejects an expired request. `0.01 NEAR = 10000000000000000000000` yoctoNEAR, attached to `create_request`. App call gas is 100 Tgas. **Prepare action** only previews it; it creates no intent and sends nothing. After a distinct approval and an appropriately enabled, verified gate, **Claim, sign and submit** creates the durable claim and opens the owner wallet. Confirm account, contract, method, deposit and request ID in the wallet before any signature. Record the intent ID and original hash.
2. Inspect the final transaction and all receipts in the Testnet explorer. Query `get_request` for the same ID: expect `Funded`, `budget` and `remaining` of `10000000000000000000000`, with matching future expiry. The treasury's aggregate liabilities should reflect the deposit relative to the immediately preceding baseline, subject to unrelated activity. Use the saved intent's **Reconcile**; require `CONFIRMED` before continuing. Never treat a preview, wallet redirect, or transaction hash by itself as confirmation.
3. In Payments choose **Authorize payment**, same request ID, fresh payment ID, the independently approved allowlisted vendor, amount `0.01` NEAR, same owner signer. Before submitting, check `get_payment_request` is null and the vendor is still allowed. Contract validates expiry, positive amount, available remaining budget and unique payment ID. After separate approval, use the existing durable claim/sign/reconcile flow. Require `Authorized` and matching payment link, vendor and amount.
4. Choose **Execute authorized payment**, same request ID, payment ID, vendor and amount, owner signer. The contract also permits the operator, but the current app preflight rejects the operator, so use the owner in this UI. After separate approval use the same durable flow. App attaches 100 Tgas; the contract allocates 15 Tgas to the callback. Verify the actual vendor transfer receipt, the callback receipt and final `get_request`: successful callback returns JSON `true`, request becomes `Completed`, remaining becomes zero and liabilities decrease by 0.01 NEAR. The server only confirms when the original final transaction, callback result and matching state agree. Do not assert settlement from a final transaction status alone.
5. Record the contract and network, request and payment IDs, signer, method/arguments, intent ID, transaction hash, final transaction and receipt statuses, callback return, explorer URL, final state, and pre/post liabilities in an independently maintained test record. The in-app Audit trail is a **local demo trace**, not a durable on-chain audit log; the durable payment-intent records and explorer evidence must be retained separately. Independent verification is still required.

For a `Funded` or `Authorized` request that should not be paid, the owner can later request a separately approved `refund`; the contract moves `RefundPending → Refunded` on success or restores remaining funds and liabilities and marks `Failed` on a failed callback. A full 0.01 payment leaves nothing to refund. If a transfer or refund is `Pending`, `RefundPending`, `UNKNOWN`, times out, or a wallet returns no hash, stop. Preserve the original IDs and hash, inspect final receipts and state, and follow [the pending outcome runbook](PENDING_TRANSACTION_RUNBOOK.md). Do not create a replacement intent, retry automatically, change database state, or assume the transfer failed. There is no administrative pending-state override.

## Local evidence and limits

The isolated sandbox suite covers owner/operator enforcement, successful execution and refund, failed transfer callback and restoration, failed refund callback and restoration, and duplicate payment/retry rejection. Node tests cover UNKNOWN locking and reconciliation with mocked RPC/DB; Rust unit tests cover state and accounting invariants. These are not public Testnet settlement evidence. Real wallet signing, delivery and reconciliation through the deployed UI, persistent audit evidence, vendor selection, key control, and independent review remain open.
