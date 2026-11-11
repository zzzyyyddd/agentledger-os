# Testnet evidence

| Status | Evidence |
| --- | --- |
| Planned | Compile and test the contract, deploy to an owner-controlled testnet account after explicit approval, then verify funding, authorization, payment receipt, final state, duplicate rejection and refund. |
| Attempted | Local Rust tests passed (15 tests), and the contract WASM built using cached dependencies. The frontend build and local tests passed. No onchain transaction was attempted. |
| Confirmed | None. No contract deployment or transaction hash exists. |
| Independently verified | None. |

Do not present simulated UI activity as NEAR evidence. Once explicitly authorized, record contract account, network, method, transaction hash, receipt outcome, explorer link, final state and independent verification for each operation. Never include credentials.

The wallet connection control is implemented but has not been validated with a real wallet or a deployed contract. A PostgreSQL-backed intent adapter and wallet authentication flow are implemented but unverified against a live database or wallet; signing is disabled by default. No treasury call has been signed or sent.

Sandbox scenarios are implemented in `tests/sandbox/treasury.test.mjs`. On 2026-11-11, `npm run test:sandbox` failed: the Node test process exhausted its approximately 2 GiB heap before completing. No sandbox scenario is claimed as passed. No testnet transaction was attempted.
