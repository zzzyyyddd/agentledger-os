import { actionCreators, type Action } from '@near-js/transactions';
import { transactionStatus, validTxHash } from './transaction';

export type IntentStatus = 'CREATED'|'AWAITING_SIGNATURE'|'SUBMITTED'|'UNKNOWN'|'CONFIRMED'|'FAILED'|'REFUNDED';
export type Operation = 'initialize'|'storage_funding'|'allow_vendor'|'create_request'|'authorize'|'execute'|'refund';
export type PaymentInput = { operation:Operation; contract:string; signer:string; owner?:string; operator?:string; vendor?:string; requestId?:string; paymentId?:string; amount?:string; expiryNs?:string };
export type Intent = { id:string; input:PaymentInput; status:IntentStatus; hash?:string };
const account = (v?:string) => { if (!v || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(v) || v.length>64) throw Error('A valid testnet account is required.'); return v; };
const identifier = (v?:string) => { if (!v || new TextEncoder().encode(v).length>64) throw Error('An ID of 1–64 bytes is required.'); return v; };
const uint = (v?:string, max=(1n<<128n)-1n) => { if (!v || !/^[0-9]+$/.test(v) || BigInt(v)===0n || BigInt(v)>max) throw Error('Enter a valid positive integer.'); return BigInt(v).toString(); };
export function nearToYocto(value:string):string { if(!/^(?:0|[1-9]\d*)(?:\.\d{1,24})?$/.test(value)) throw Error('Enter a NEAR amount with at most 24 decimals.'); const [whole, fraction='']=value.split('.'); return uint((BigInt(whole)*10n**24n+BigInt(fraction.padEnd(24,'0'))).toString()); }
export function prepareAction(input:PaymentInput): {receiverId:string; signerId:string; actions:Action[]} {
 const receiverId=account(input.contract), signerId=account(input.signer); let actions:Action[]; const call=(method:string,args:object,deposit='0')=>actionCreators.functionCall(method,args,100_000_000_000_000n,BigInt(deposit));
 switch(input.operation){
 case 'initialize': if(signerId!==receiverId) throw Error('Initialization must be signed by the contract account.'); actions=[call('new',{owner:account(input.owner),operator:account(input.operator)})]; break;
 case 'storage_funding': actions=[actionCreators.transfer(BigInt(uint(input.amount)))]; break;
 case 'allow_vendor': actions=[call('set_vendor',{vendor:account(input.vendor),allowed:true})]; break;
 case 'create_request': actions=[call('create_request',{request_id:identifier(input.requestId),expiry_ns:uint(input.expiryNs,(1n<<64n)-1n)},uint(input.amount))]; break;
 case 'authorize': actions=[call('authorize',{request_id:identifier(input.requestId),payment_id:identifier(input.paymentId),vendor:account(input.vendor),amount:uint(input.amount)})]; break;
 case 'execute': actions=[call('execute',{request_id:identifier(input.requestId)})]; break;
 case 'refund': actions=[call('refund',{request_id:identifier(input.requestId)})]; break;
 default: throw Error('Unsupported operation.');
 } return {receiverId,signerId,actions};
}
// Implementations must persist atomically, authenticate users, enforce unique operation keys,
// and never release a claimed intent merely because a client or lease times out.
export interface IntentStore { claim(input:PaymentInput):Promise<Intent>; setStatus(id:string,status:IntentStatus,hash?:string):Promise<void>; }
export class UnconfiguredIntentStore implements IntentStore {
 async claim():Promise<Intent>{throw Error('Durable transaction intent store is not configured; signing is blocked.');}
 async setStatus():Promise<void>{throw Error('Durable transaction intent store is not configured.');}
}
export type SigningWallet = {signAndSendTransaction(params:ReturnType<typeof prepareAction>):Promise<unknown>};
export async function submitIntent(input:PaymentInput,store:IntentStore,wallet:SigningWallet):Promise<void>{
 const action=prepareAction(input); const intent=await store.claim(input);
 // Persist before invoking wallet. An interruption or redirect remains locked indefinitely.
 await store.setStatus(intent.id,'AWAITING_SIGNATURE');
 try { const outcome=await wallet.signAndSendTransaction(action); const hash=(outcome as {transaction?:{hash?:unknown}}|undefined)?.transaction?.hash;
  if(typeof hash==='string' && validTxHash(hash)) await store.setStatus(intent.id,'SUBMITTED',hash); else await store.setStatus(intent.id,'UNKNOWN');
 } catch { await store.setStatus(intent.id,'UNKNOWN'); throw Error('Wallet outcome is unknown. Reconcile before taking further action.'); }
}
export type ChainRequest={status:string; payment_id:string|null; vendor:string|null; amount:string; remaining:string};
export async function viewContract(contract:string,method:string,args:object,fetcher:typeof fetch=fetch):Promise<unknown>{
 account(contract); const response=await fetcher('https://test.rpc.fastnear.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'agentledger',method:'query',params:{request_type:'call_function',finality:'final',account_id:contract,method_name:method,args_base64: btoa(JSON.stringify(args))}}),signal:AbortSignal.timeout(12000)}); if(!response.ok)throw Error('RPC unavailable'); const json=await response.json(); if(json.error || !Array.isArray(json.result?.result))throw Error('RPC query failed'); return JSON.parse(new TextDecoder().decode(new Uint8Array(json.result.result)));
}
export async function reconcile(intent:Intent,fetcher:typeof fetch=fetch):Promise<{status:IntentStatus; chain:ChainRequest|null; transaction:string}>{
 const {input,hash}=intent; let tx='UNKNOWN'; try {if(hash)tx=await transactionStatus(hash,input.signer,fetcher); let chain:ChainRequest|null=null;
 if(input.requestId) chain=await viewContract(input.contract,'get_request',{request_id:input.requestId},fetcher) as ChainRequest|null;
 if(input.paymentId){const linked=await viewContract(input.contract,'get_payment_request',{payment_id:input.paymentId},fetcher); if(linked!==input.requestId)return {status:'UNKNOWN',chain,transaction:tx};}
 if(chain?.status==='Refunded' && input.operation==='refund')return {status:'REFUNDED',chain,transaction:tx};
 if(chain?.status==='Completed' && input.operation==='execute' && chain.payment_id===input.paymentId && chain.vendor===input.vendor && chain.amount===input.amount)return {status:'CONFIRMED',chain,transaction:tx};
 // Final transaction success alone does not prove asynchronous transfer success.
 // A supplied hash is not yet bound to the prepared action; never infer its outcome from status alone.
 if(chain?.status==='Failed' && input.operation==='execute' && chain.payment_id===input.paymentId && chain.vendor===input.vendor && chain.amount===input.amount)return {status:'FAILED',chain,transaction:tx};
 return {status:tx==='PENDING'?'SUBMITTED':'UNKNOWN',chain,transaction:tx};
 } catch{return {status:'UNKNOWN',chain:null,transaction:tx};}
}
