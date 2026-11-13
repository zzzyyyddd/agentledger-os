# V2 Testnet deployment evidence

Observed on 2026-11-13. These are historical observations; refresh chain state before relying on it. This records deployment only, not approval to enable application payments or modify a database.

- Network: NEAR Testnet, protocol 88. Contract: `agentledger-v2.agentledger-owner.testnet`.
- Account creation: [7nnX4EDsUsEXSUeFzpGsuB6qmqAdVCrKwZjnpNxJoVaJ](https://testnet.nearblocks.io/txns/7nnX4EDsUsEXSUeFzpGsuB6qmqAdVCrKwZjnpNxJoVaJ), final. Signer `agentledger-owner.testnet`; receiver the V2 account; exactly 3.5 NEAR transferred. The new account received a separate full-access public key; its local credential was checked without displaying secret material.
- Contract deployment and initialization: [6sMSFxc5vqHK67wHCWJCR8X8KnjDWDzFU1vuePqiYiwY](https://testnet.nearblocks.io/txns/6sMSFxc5vqHK67wHCWJCR8X8KnjDWDzFU1vuePqiYiwY), final. Signer and receiver were the V2 account. Actions were deployment and `new({})`, with 100 Tgas and zero attached deposit; no receipt failures were returned.
- At finalized block 277514186 (`13SaM1VmeYjnaxn7yakLekfKKaHXFt8ZfQdEdZZPZAZy`), the downloaded 257,227-byte contract code had SHA-256 `7c38929d075d06e47a9af6472387939f5473d27e4e3ced7d88e2eaf0244c3d27`, matching the approved local artifact. The RPC transaction action contained the 32-byte code digest, not the complete WASM, so independent verification hashed the finalized `view_code` bytes.
- The initialized contract returned `get_liabilities = "0"`; `get_payments_by_owner` returned an empty list for both `agentledger-owner.testnet` and the V2 contract account. The contract has no global owner enumeration, so these individual checks alone do not prove every possible owner's history is empty.
- At the same finalized block, the V2 account balance was 3.4979593206436394 NEAR (257,490 bytes of storage usage), and the owner's balance was 1.4751467312973052 NEAR. These balances change with activity.

No payment transaction, Neon migration, V1 action, or Vercel configuration change was performed. `db/migrations/202611130001_v2_namespace.sql` remains unapplied; verify application-role privileges and test concurrency and recovery against an authorized nonproduction database before database integration. Real wallet/browser payment recovery remains unverified. Keep both payment gates disabled until separately approved.
