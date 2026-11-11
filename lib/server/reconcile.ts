import {prepareAction,viewContract} from '../payment';
import {validTxHash} from '../transaction';
import type {Row} from './intents';
const stable=(v:unknown):string=>JSON.stringify(v,(_k,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
export async function verifyTransaction(row:Row,fetcher:typeof fetch=fetch):Promise<'CONFIRMED'|'FAILED'|'REFUNDED'|'UNKNOWN'>{
 try{
  if(!row.transaction_hash||!validTxHash(row.transaction_hash))return 'UNKNOWN';
  const i=row.action_input; const expected=prepareAction(i);const response=await fetcher('https://test.rpc.fastnear.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'intent',method:'tx',params:{tx_hash:row.transaction_hash,sender_account_id:row.owner_account,wait_until:'FINAL'}}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)return 'UNKNOWN';const data=await response.json();const result=data.result,tx=result?.transaction;
  if(data.error||result?.final_execution_status!=='FINAL'||tx?.hash!==row.transaction_hash||tx.signer_id!==row.owner_account||tx.receiver_id!==i.contract||!Array.isArray(tx.actions)||tx.actions.length!==1||expected.actions.length!==1)return 'UNKNOWN';
  const actual=tx.actions[0]?.FunctionCall, action=expected.actions[0].functionCall;
  if(!actual||!action||actual.method_name!==action.methodName||String(actual.deposit)!==action.deposit.toString()||String(actual.gas)!==action.gas.toString())return 'UNKNOWN';
  const args=JSON.parse(Buffer.from(actual.args,'base64').toString('utf8'));const expectedArgs=JSON.parse(Buffer.from(action.args).toString('utf8'));if(stable(args)!==stable(expectedArgs))return 'UNKNOWN';
  if(result.status?.Failure)return ['execute','refund'].includes(i.operation)?'UNKNOWN':'FAILED';if(!result.status||!('SuccessValue' in result.status))return 'UNKNOWN';
  const request=await viewContract(i.contract,'get_request',{request_id:i.requestId},fetcher) as {status:string;budget:string;expiry_ns:string;payment_id:string;vendor:string;amount:string}|null;
  if(!request)return 'UNKNOWN';
  if(i.operation==='create_request')return request.budget===i.amount&&request.expiry_ns===i.expiryNs?'CONFIRMED':'UNKNOWN';
  if(i.operation==='refund')return request.status==='Refunded'?'REFUNDED':'UNKNOWN';
  if(i.operation==='authorize'||i.operation==='execute'){
   const link=await viewContract(i.contract,'get_payment_request',{payment_id:i.paymentId},fetcher);
   if(link!==i.requestId||request.payment_id!==i.paymentId||request.vendor!==i.vendor||request.amount!==i.amount)return 'UNKNOWN';
   if(i.operation==='authorize')return 'CONFIRMED';
   if(request.status==='Completed')return 'CONFIRMED';if(request.status==='Failed')return 'FAILED';
  }
  return 'UNKNOWN';
 }catch{return 'UNKNOWN';}
}
