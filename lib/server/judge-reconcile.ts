import {prepareJudgeAction} from '../judge-payment';
import {viewContract} from '../v2-view';
import {validTxHash} from '../transaction';
import {judgeConfig,validateDeployment,type JudgeRow} from './judge-intents';
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export async function reconcileJudge(row:JudgeRow,fetcher:typeof fetch=fetch):Promise<'CONFIRMED'|'FAILED'|'REFUNDED'|'UNKNOWN'>{
 try{
  const hash=row.transaction_hash;
  // A finalized uniquely keyed V2 creation proves that repeating this same
  // create cannot take a second deposit. Never infer failure from absence.
  if(!hash){
   const i=row.action_input;if(i.operation!=='create_request')return 'UNKNOWN';
   const {contract,hash:codeHash}=judgeConfig();if(i.contract!==contract)return 'UNKNOWN';
   await validateDeployment(contract,codeHash,fetcher);
   const r=await viewContract(contract,'get_payment',{payment_id:i.paymentId},fetcher) as {request_id:string;owner:string;budget:string;expiry_ns:string;vendor:string;payment_id:string;status:string}|null;
   return r&&r.request_id===i.requestId&&r.owner===row.owner_account&&r.budget===i.amount&&r.expiry_ns===i.expiryNs&&r.vendor===i.vendor&&r.payment_id===i.paymentId&&r.status==='Funded'?'CONFIRMED':'UNKNOWN';
  }
  if(!validTxHash(hash))return 'UNKNOWN';
  const input=row.action_input,expected=prepareJudgeAction(input),action=expected.actions[0].functionCall;
  const response=await fetcher('https://test.rpc.fastnear.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'judge-reconcile',method:'tx',params:{tx_hash:hash,sender_account_id:row.owner_account,wait_until:'FINAL'}}),signal:AbortSignal.timeout(12000)});
  if(!response.ok||!action)return 'UNKNOWN';const body=await response.json(),result=body.result,tx=result?.transaction;
  if(body.error||result?.final_execution_status!=='FINAL'||tx?.hash!==hash||tx.signer_id!==row.owner_account||tx.receiver_id!==input.contract||!Array.isArray(tx.actions)||tx.actions.length!==1)return 'UNKNOWN';
  const actual=tx.actions[0]?.FunctionCall;
  if(!actual||actual.method_name!==action.methodName||String(actual.gas)!==action.gas.toString()||String(actual.deposit)!==action.deposit.toString()||stable(JSON.parse(Buffer.from(actual.args,'base64').toString()))!==stable(JSON.parse(Buffer.from(action.args).toString())))return 'UNKNOWN';
  // A failed candidate does not rule out another pending submission for this intent.
  if(result.status?.Failure)return 'UNKNOWN';
  if(!result.status||typeof result.status.SuccessValue!=='string'||!Array.isArray(result.receipts_outcome))return 'UNKNOWN';
  const r=await viewContract(input.contract,'get_request',{request_id:input.requestId},fetcher) as {owner:string;budget:string;expiry_ns:string;vendor:string;payment_id:string|null;amount:string;remaining:string;status:string}|null;
  if(!r||r.owner!==row.owner_account||r.budget!==input.amount||r.expiry_ns!==input.expiryNs||r.vendor!==input.vendor)return 'UNKNOWN';
  if(input.operation==='create_request'&&r.payment_id!==input.paymentId)return 'UNKNOWN';
  if(input.operation==='create_request')return result.receipts_outcome.some((x:{outcome?:{executor_id?:string;status?:{SuccessValue?:unknown}}})=>x.outcome?.executor_id===input.contract&&x.outcome.status?.SuccessValue===result.status.SuccessValue)?'CONFIRMED':'UNKNOWN';
  if(input.operation==='authorize'||input.operation==='execute'){
   const link=await viewContract(input.contract,'get_payment_request',{payment_id:input.paymentId},fetcher);
   if(link!==input.requestId||r.payment_id!==input.paymentId||r.amount!==input.amount)return 'UNKNOWN';
   if(input.operation==='authorize')return 'CONFIRMED';
  }
  const success=result.status.SuccessValue==='dHJ1ZQ==',failed=result.status.SuccessValue==='ZmFsc2U=';
  const receipts=result.receipts_outcome as {outcome?:{executor_id?:string;status?:Record<string,unknown>}}[];
  const callback=receipts.some(x=>x.outcome?.executor_id===input.contract&&x.outcome.status?.SuccessValue===result.status.SuccessValue);
  if(!callback)return 'UNKNOWN';
  if(input.operation==='execute'&&success&&r.status==='Completed'&&receipts.some(x=>x.outcome?.executor_id===input.vendor&&x.outcome.status&&'SuccessValue' in x.outcome.status))return 'CONFIRMED';
  if(input.operation==='refund'&&success&&r.status==='Refunded'&&receipts.some(x=>x.outcome?.executor_id===row.owner_account&&x.outcome.status&&'SuccessValue' in x.outcome.status))return 'REFUNDED';
  if(failed&&r.status==='Failed'&&receipts.some(x=>x.outcome?.status&&'Failure' in x.outcome.status))return 'FAILED';
  return 'UNKNOWN';
 }catch{return 'UNKNOWN';}
}
