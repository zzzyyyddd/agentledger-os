export const TREASURY_ACCOUNT='agentledger-treasury.testnet';
export const EXPECTED_OWNER='agentledger-owner.testnet';
export const EXPECTED_OPERATOR='agentledger-operator.testnet';
export const EXPECTED_WASM_SHA256='5f8ede8533f97ed166e3342556b090999e7d0d5db8afe4c6fe8af547c041b958';
export type TreasurySnapshot={account:string;network:'testnet';blockHeight:number;blockTime:string;observedAt:string;balanceYocto:string;storageYocto:string|null;roles:{owner:string;operator:string}|null;liabilitiesYocto:string|null;code:{status:'match'|'mismatch'|'unverified'|'missing';sha256:string|null}};
export type TreasuryErrorCode='ACCOUNT_MISSING'|'WRONG_NETWORK'|'RPC_UNAVAILABLE'|'MALFORMED_RESPONSE';
export function isTreasuryStale(snapshot:TreasurySnapshot,now:number,hasError:boolean):boolean{return hasError||(now>0&&(now-Date.parse(snapshot.observedAt)>120000||now-Date.parse(snapshot.blockTime)>120000));}

// Keep all arithmetic in integers; show up to 24 fractional digits without rounding.
export function formatNear(value:string):string{
 if(!/^(0|[1-9][0-9]*)$/.test(value))throw Error('Invalid yoctoNEAR amount');
 const padded=value.padStart(25,'0');const whole=padded.slice(0,-24).replace(/\B(?=(\d{3})+(?!\d))/g,',');const fraction=padded.slice(-24).replace(/0+$/,'');
 return fraction?`${whole}.${fraction}`:whole;
}
