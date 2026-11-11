# Unknown or pending treasury outcomes

Keep `PAYMENTS_ENABLED=false` during investigation. This procedure is read-only: never retry, reset an intent, replace contract code, or infer failure from a timeout. Use only the intended Testnet account and endpoint. Escalate unresolved cases to the treasury operator and reviewer.

1. Record the owner, contract, request ID, payment ID, operation, intent ID and status, original transaction hash, and time. Obtain the hash from the original wallet activity or explorer if the app lacks it; do not request wallet credentials. If there is no trustworthy hash, keep the intent locked and escalate. An `AWAITING_SIGNATURE` intent can also mean the browser was interrupted after submission; it is not proof that nothing was sent.
2. With a hash, inspect the final transaction and **all receipts**, including transfer and treasury callback. Compare signer, receiver, method, arguments, attached deposit and gas against the original intent. Inspect a Testnet explorer or use the read-only CLI command below; if the CLI output omits receipt detail, use a Testnet RPC/explorer that supplies it. These variables are public identifiers, not keys:

   ```sh
   near transaction view-status "$TX_HASH" network-config testnet
   ```

   A successful top-level transaction alone does not establish settlement. For `execute` and `refund`, the treasury callback returns JSON `true` or `false` (base64 `dHJ1ZQ==` or `ZmFsc2U=` in RPC `SuccessValue`); a failed transfer can still be followed by a successful callback returning `false`. Missing, unfinalized, inconsistent or unrecognized results remain unknown.
3. Query final contract state. Set/export public `CONTRACT_ID`, `REQUEST_ID`, and, when applicable, `PAYMENT_ID`; the Node commands only encode the IDs as JSON:

   ```sh
   near contract call-function as-read-only "$CONTRACT_ID" get_request json-args "$(node -e 'process.stdout.write(JSON.stringify({request_id:process.env.REQUEST_ID}))')" network-config testnet now
   near contract call-function as-read-only "$CONTRACT_ID" get_payment_request json-args "$(node -e 'process.stdout.write(JSON.stringify({payment_id:process.env.PAYMENT_ID}))')" network-config testnet now
   near contract call-function as-read-only "$CONTRACT_ID" get_liabilities json-args '{}' network-config testnet now
   ```

   Confirm payment linkage, vendor, amount, remaining balance and status. `Pending` and `RefundPending` mean the outcome is unresolved; preserve evidence and escalate. `Failed` alone is ambiguous: a failed payout and a later failed refund both use it. `Completed` and `Refunded` need the matching original callback and action, not merely a state lookup. Total liabilities cover all requests, so they cannot by themselves prove one payment's outcome.
4. If the app has an owner-authenticated session, record only the verified original hash on the existing `AWAITING_SIGNATURE`/`UNKNOWN` intent and use its Reconcile action. Server reconciliation requires a matching final transaction and contract state; it may deliberately remain UNKNOWN even after manual investigation. If state or receipt evidence conflicts, or a callback is stuck, leave it locked and escalate for a separately reviewed recovery plan. Do not edit database rows or make a new payment to clear the status.

After authentication interruption or an expired challenge, initiate a fresh wallet identity challenge in the original browser; never reuse the old signature. Wallet popup/page interruption recovery has not been verified with a real wallet. Do not attempt transaction resubmission as an authentication workaround.
