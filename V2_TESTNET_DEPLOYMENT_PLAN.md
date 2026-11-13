# AgentLedger V2 Testnet deployment plan

> Historical preparation: the authorized account creation and deployment were subsequently completed. See [deployment evidence](V2_TESTNET_DEPLOYMENT_EVIDENCE.md); do not repeat these commands.

Prepared for review only; the commands below sign, broadcast and spend Testnet NEAR. Do not run without separate deployment authorization. No key, account, transaction, database, or hosting change was made while preparing this plan.

- Proposed new account: `agentledger-v2.agentledger-owner.testnet`, a child of `agentledger-owner.testnet`.
- Finalized RPC reported `UNKNOWN_ACCOUNT` for that exact ID at block 277491521. Recheck immediately before creation; availability can change.
- Funding signer: `agentledger-owner.testnet`. A locally available legacy-keychain credential has public key `ed25519:DWEF6bY6P7oDinJ917cov4dGNKiRUtxSA4huTJN2b1Cg`; finalized RPC at block 277491484 reported that key as `FullAccess`. Its private key was not displayed and no signing was tested.
- The owner held 4.9822617208348052 NEAR with 182 bytes storage usage and zero locked stake at that block. At the reported rate, its storage collateral was 0.00182 NEAR, leaving approximately 4.98044 NEAR before transaction fees.
- V2 WASM: `contract/target/wasm32-unknown-unknown/release/agentledger_v2_treasury.wasm`; 257,227 bytes; SHA-256 `7c38929d075d06e47a9af6472387939f5473d27e4e3ced7d88e2eaf0244c3d27`, matching the sandbox-tested artifact.
- Testnet protocol 88 reported storage collateral of 10^19 yoctoNEAR per byte (0.00001 NEAR/byte). WASM bytes alone therefore require 2.57227 NEAR; account, key and contract-state bytes add collateral. The proposed 3.5 NEAR transfer provides approximately 0.92773 NEAR above WASM bytes, before that overhead and gas. Storage collateral remains part of the new account balance, subject to protocol rules; the 3.5 NEAR is a transfer, not a fee.
- Budget at least 3.6 NEAR available to the owner for a 3.5 NEAR initial transfer plus a conservative 0.1 NEAR fee margin. This is a planning allowance, not a guaranteed fee cap. The observed gas price was 100,000,000 yoctoNEAR/gas, so 100 Tgas of initialization gas corresponds to at most 0.01 NEAR at that price; other transaction and deployment actions add gas, and prices can change. Refresh balance, account availability, protocol and fees before execution.

## Commands to execute only after authorization

Both commands below were checked against `near-cli-rs 0.31.1` help. They have not been executed. The first generates a separate V2 key and saves it in the local legacy keychain; protect and back up that key. Verify account creation is final and the V2 credential is available before the second command. Do not proceed if a command gives an unexpected account, key, fee, or result.

```bash
near account create-account fund-myself agentledger-v2.agentledger-owner.testnet '3.5 NEAR' autogenerate-new-keypair save-to-legacy-keychain sign-as agentledger-owner.testnet network-config testnet sign-with-legacy-keychain send
```

```bash
near contract deploy agentledger-v2.agentledger-owner.testnet use-file contract/target/wasm32-unknown-unknown/release/agentledger_v2_treasury.wasm with-init-call new json-args '{}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
```

Recalculate the local WASM SHA-256 before deployment. After deployment, verify the signer and receiver, final transaction and receipt outcomes, contract account, initialization, empty owner payment views, liabilities, and the SHA-256 of the actual finalized on-chain WASM bytes. Do not compare NEAR's base58 code hash to a hexadecimal SHA-256 string. Keep payments disabled until configuration and real wallet recovery have been separately verified.

The required database migration is `db/migrations/202611130001_v2_namespace.sql`. It creates the independent `agentledger_v2` schema and V2 wallet authentication and payment-intent objects; it does not delete V1 authentication tables or import V1 history. It has not been applied. Database application and Vercel configuration are outside this deployment plan and require separate authorization.

The V1 contract source files are unchanged in the working tree. The proposed account is distinct from `agentledger-treasury.testnet` and `judge.agentledger-owner.testnet`; no V1 account, on-chain contract, Neon data or production configuration was changed in this preparation.
