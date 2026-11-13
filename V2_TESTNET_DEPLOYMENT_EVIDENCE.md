# V2 Testnet deployment evidence

Observed on 2026-11-13. These are historical observations; refresh chain state before relying on it. This records deployment only, not approval to enable application payments or modify a database.

- Network: NEAR Testnet, protocol 88. Contract: `agentledger-v2.agentledger-owner.testnet`.
- Account creation: [7nnX4EDsUsEXSUeFzpGsuB6qmqAdVCrKwZjnpNxJoVaJ](https://testnet.nearblocks.io/txns/7nnX4EDsUsEXSUeFzpGsuB6qmqAdVCrKwZjnpNxJoVaJ), final. Signer `agentledger-owner.testnet`; receiver the V2 account; exactly 3.5 NEAR transferred. The new account received a separate full-access public key; its local credential was checked without displaying secret material.
- Contract deployment and initialization: [6sMSFxc5vqHK67wHCWJCR8X8KnjDWDzFU1vuePqiYiwY](https://testnet.nearblocks.io/txns/6sMSFxc5vqHK67wHCWJCR8X8KnjDWDzFU1vuePqiYiwY), final. Signer and receiver were the V2 account. Actions were deployment and `new({})`, with 100 Tgas and zero attached deposit; no receipt failures were returned.
- At finalized block 277514186 (`13SaM1VmeYjnaxn7yakLekfKKaHXFt8ZfQdEdZZPZAZy`), the downloaded 257,227-byte contract code had SHA-256 `7c38929d075d06e47a9af6472387939f5473d27e4e3ced7d88e2eaf0244c3d27`, matching the approved local artifact. The RPC transaction action contained the 32-byte code digest, not the complete WASM, so independent verification hashed the finalized `view_code` bytes.
- The initialized contract returned `get_liabilities = "0"`; `get_payments_by_owner` returned an empty list for both `agentledger-owner.testnet` and the V2 contract account. The contract has no global owner enumeration, so these individual checks alone do not prove every possible owner's history is empty.
- At the same finalized block, the V2 account balance was 3.4979593206436394 NEAR (257,490 bytes of storage usage), and the owner's balance was 1.4751467312973052 NEAR. These balances change with activity.

At the time of the deployment-only observations, no payment transaction, Neon migration, V1 action, or Vercel configuration change had been performed, and `db/migrations/202611130001_v2_namespace.sql` had not been applied. Current migration, role privileges, payment gate, and browser recovery status are not established by those deployment observations.

## Historical V2 payment evidence

Observed on 2026-11-13 using read-only Testnet RPC and the NearBlocks Testnet indexer. Both transactions were `FINAL`, targeted the V2 contract, and returned a successful contract callback. These records are separate from the earlier deployment-only observations above.

- **Execution:** [create](https://testnet.nearblocks.io/txns/69xhE4zxpwdaGEa4NpiH9SPafJcCK42Kt53owemM2SFc), [authorize](https://testnet.nearblocks.io/txns/EGFiost8ioVnfPZ359yxaMzprsiTGoxmGDJqDAr1nu8B), and [execute](https://testnet.nearblocks.io/txns/3oDTEwAahHyCR8AQrpHBAFGW6Dh7CoSfbksjCDWuMsAm) for request `v2-jr-7968a99c-afef-4359-bc9a-46b06190e9be`. The successful transfer receipt paid 0.01 NEAR to `heavyseal6539.testnet`; finalized contract state reported `Completed` and zero remaining.
- **Refund:** [create](https://testnet.nearblocks.io/txns/Hvu519Y1sX8shUbfnmBzJVk7oMNjVXuAMMmpZUupnQ6G) and [refund](https://testnet.nearblocks.io/txns/JjuoNc2BjwucyLCesSZLdfqpLcVTHJw8MC6YwGi4unW) for request `v2-jr-c6ec43b3-7006-4d93-927f-5c5df5156124`. The successful transfer receipt returned 0.01 NEAR to the owner; finalized contract state reported `Refunded` and zero remaining.

Each creation attached 0.04 NEAR: 0.01 NEAR budget plus 0.03 NEAR nonrefundable storage contribution. Network fees were additional. These historical results do not prove that the current production payment gate is enabled or that all wallet recovery scenarios have been exercised.
