// Named Testnet accounts and NEAR's 32-byte hexadecimal implicit account IDs.
export function isTestnetAccountId(value:unknown):value is string {
 return typeof value==='string' && (/^[0-9a-f]{64}$/.test(value) || (value.length<=64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(value)));
}
