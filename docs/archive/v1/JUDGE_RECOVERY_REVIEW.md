> **Historical V1 record:** Preserved for reference only. This document does not describe the current V2 application or authorize operational actions.

# Judge Treasury recovery review

A claimed intent locks new operations for its owner and contract. The app identifies the current browser attempt as `PRE_WALLET_HANDOFF` until the wallet call starts, and `POSSIBLY_BROADCAST` once it starts. These labels are guidance for the current session, not durable proof. An existing `AWAITING_SIGNATURE`, `UNKNOWN`, or `SUBMITTED` row must be treated as possibly broadcast, including after a blocked popup or a lost/late response. No absence of a history entry or contract record establishes non-broadcast.

Before attempting a new wallet operation, allow popups for the site, verify the wallet and review the transaction. Funding is initiated only by the explicit button. Wallet implementations control their own popup; browser activation can expire while the app performs required server checks. If a popup fails, preserve the existing intent, look for its original hash in the wallet and do not submit again.

An operator with separately authorized read-only database access can inspect an exact intent and optionally test an original hash without modifying any row:

```sh
node --import tsx scripts/review-judge-recovery.ts --id INTENT_UUID --owner OWNER.testnet --contract CONTRACT.testnet --request REQUEST_ID [--hash ORIGINAL_HASH]
```

Supply `DATABASE_URL` privately through the environment; never put it in the command or logs. The script uses a read-only transaction, scopes the lookup to the exact ID, owner, contract, operation and request, checks the stored signer and input, rejects hash conflicts and tests any supplied hash with the existing finalized transaction verifier. It reports `POSSIBLY_BROADCAST` and `RETAIN` even if the candidate transaction failed: another submission or late result may exist. No history lookup or outcome from this script unlocks an intent. No operator identity or approval workflow is implemented by this script; access to the database and independent operator review are required.

If the original hash is recovered, independently review its signer, contract, method, arguments, deposit and finalized outcome. A separately approved, owner-authenticated hash recording and reconciliation may update the row under the existing compare-and-swap rules. Before releasing any lock, independently rule out other possible broadcasts and pending outcomes; a failed candidate alone is not sufficient. There is no safe automatic unlock for the affected hashless intent, and the current app has no operator-authorized unlock mechanism for it. Do not directly edit the production row.
