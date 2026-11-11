export const SETTLEMENT = {
 contract: 'agentledger-treasury.testnet',
 request: 'phase11-69d630c1-b0df-4174-99c1-efe6668254e7',
 payment: 'phase11-pay-69d630c1-b0df-4174-99c1-efe6668254e7',
 owner: 'agentledger-owner.testnet', operator: 'agentledger-operator.testnet',
 vendor: 'agentledger-demo-user.testnet', amount: '10000000000000000000000',
 transactions: [
  ['Create escrow', '5LwtSBpKmJW3tXv39vVTCX3LseTA36XanfawjLzX18iH'],
  ['Authorize', '7i5EnWorx4xeXqU2m426NeWDykrHWC8A1WrQvQi53v8G'],
  ['Execute and callback', 'HUf9J9PwJmKYr3ckBUqAk44zyJwfNRVpEzKVTQgxnRnP'],
 ] as const,
} as const;

export function settlementMatches(value: unknown): boolean {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
 const r=value as Record<string,unknown>;
 return r.status==='Completed' && r.budget===SETTLEMENT.amount && r.remaining==='0' && r.amount===SETTLEMENT.amount && r.vendor===SETTLEMENT.vendor && r.payment_id===SETTLEMENT.payment;
}
