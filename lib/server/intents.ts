import {createHash} from 'node:crypto';
import {prepareAction,viewContract,type PaymentInput,type IntentStatus} from '../payment';
import {validTxHash} from '../transaction';
import {db} from './database';
export type Row={id:string;owner_account:string;business_key:string;status:IntentStatus;version:number;transaction_hash:string|null;action_input:PaymentInput};
export function normalize(input:PaymentInput,owner:string):PaymentInput{
 if(!input||typeof input!=='object'||input.signer!==owner)throw Error('Signer must match authenticated wallet');
 if(!['create_request','authorize','execute','refund'].includes(input.operation))throw Error('Only escrow workflow operations are enabled');
 const clean:PaymentInput={operation:input.operation,contract:input.contract,signer:owner,requestId:input.requestId};
 if(input.operation==='create_request'){clean.amount=input.amount;clean.expiryNs=input.expiryNs;}
 if(input.operation==='authorize'||input.operation==='execute'){clean.paymentId=input.paymentId;clean.vendor=input.vendor;clean.amount=input.amount;}
 prepareAction(clean);
 // Execution metadata is required to bind settlement to the authorized payment.
 if(input.operation==='execute'){if(!clean.paymentId||!clean.vendor||!clean.amount)throw Error('Payment reference, vendor and amount required');prepareAction({...clean,operation:'authorize'});}
 return clean;
}
export function businessKey(input:PaymentInput){return createHash('sha256').update(JSON.stringify(['testnet',input.contract,input.operation,input.requestId])).digest('hex');}
export async function preflight(owner:string,i:PaymentInput){
 const roles=await viewContract(i.contract,'get_roles',{});if(!Array.isArray(roles)||roles[0]!==owner)throw Error('Authenticated wallet is not the contract owner');
 const request=await viewContract(i.contract,'get_request',{request_id:i.requestId}) as {status:string;remaining:string;payment_id:string|null;vendor:string|null;amount:string}|null;
 if(i.operation==='create_request'){if(request)throw Error('Request already exists onchain');return;}
 if(!request)throw Error('Escrow request not found onchain');
 if(i.operation==='authorize'){
  if(request.status!=='Funded'||BigInt(i.amount!)>BigInt(request.remaining))throw Error('Escrow is not available for this authorization');
  if(await viewContract(i.contract,'get_payment_request',{payment_id:i.paymentId}))throw Error('Payment reference already exists onchain');
  if(await viewContract(i.contract,'is_vendor_allowed',{vendor:i.vendor})!==true)throw Error('Vendor is not allowed onchain');
 }
 if(i.operation==='execute'&&(request.status!=='Authorized'||request.payment_id!==i.paymentId||request.vendor!==i.vendor||request.amount!==i.amount||await viewContract(i.contract,'get_payment_request',{payment_id:i.paymentId})!==i.requestId||await viewContract(i.contract,'is_vendor_allowed',{vendor:i.vendor})!==true))throw Error('Onchain authorization does not match this payment');
 if(i.operation==='refund'&&(!['Funded','Authorized','Failed','Completed'].includes(request.status)||BigInt(request.remaining)===0n))throw Error('Request is not refundable');
}
export async function claim(owner:string,input:PaymentInput){const i=normalize(input,owner);await preflight(owner,i);const rows=await db('SELECT * FROM public.claim_payment_intent($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[owner,businessKey(i),i.contract,i.paymentId||i.requestId,i.vendor||null,i.amount||null,i.operation,JSON.stringify(i)]) as Row[];if(rows.length!==1)throw Error('Intent already claimed or conflicts with an existing operation; reconcile it before taking action');return rows[0];}
export async function getIntent(owner:string,id:string){if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid intent');const rows=await db('SELECT * FROM public.payment_intents WHERE id = $1 AND owner_account = $2',[id,owner]) as Row[];if(rows.length!==1)throw Error('Intent not found');return rows[0];}
export async function transition(row:Row,to:IntentStatus,hash?:string){if(hash&&!validTxHash(hash))throw Error('Invalid transaction hash');const rows=await db('SELECT * FROM public.transition_payment_intent($1,$2,$3,$4,$5,$6)',[row.id,row.owner_account,row.version,row.status,to,hash||null]) as Row[];if(rows.length!==1)throw Error('Intent changed concurrently');return rows[0];}
