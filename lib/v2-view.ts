import {isTestnetAccountId} from './near-account';

export async function viewContract(contract:string,method:string,args:object,fetcher:typeof fetch=fetch):Promise<unknown>{
 if(!isTestnetAccountId(contract))throw Error('Invalid Testnet contract');
 const response=await fetcher('https://test.rpc.fastnear.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'agentledger-v2',method:'query',params:{request_type:'call_function',finality:'final',account_id:contract,method_name:method,args_base64:btoa(JSON.stringify(args))}}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('RPC unavailable');const json=await response.json();if(json.error||!Array.isArray(json.result?.result))throw Error('RPC query failed');return JSON.parse(new TextDecoder().decode(new Uint8Array(json.result.result)));
}
export function formatNear(value:string):string{
 if(!/^(0|[1-9][0-9]*)$/.test(value))throw Error('Invalid yoctoNEAR amount');
 const padded=value.padStart(25,'0');const whole=padded.slice(0,-24).replace(/\B(?=(\d{3})+(?!\d))/g,',');const fraction=padded.slice(-24).replace(/0+$/,'');return fraction?`${whole}.${fraction}`:whole;
}

// Display-only rounding; calculations and wallet actions retain exact yoctoNEAR.
export function formatNearDisplay(value:string):string{
 if(!/^(0|[1-9][0-9]*)$/.test(value))throw Error('Invalid yoctoNEAR amount');
 const unit=10n**20n,amount=BigInt(value),rounded=(amount+unit/2n)/unit;
 const digits=rounded.toString().padStart(5,'0');
 const whole=digits.slice(0,-4).replace(/\B(?=(\d{3})+(?!\d))/g,',');
 return `${amount%unit===0n?'':'≈'}${whole}.${digits.slice(-4)}`;
}
