import {createHash} from 'node:crypto';
import {db} from './database';
import {viewContract} from '../payment';
import {isTestnetAccountId} from '../near-account';
import {judgeAssessment,prepareJudgeAction,type JudgeInput} from '../judge-payment';
import {validTxHash} from '../transaction';

export type JudgeRow={id:string;owner_account:string;status:string;version:number;transaction_hash:string|null;action_input:JudgeInput};
export const DEPLOYED_V2_TREASURY_CONTRACT_ID='agentledger-v2.agentledger-owner.testnet';
export function judgeConfig(requireEnabled=false){
 const contract=process.env.V2_TREASURY_CONTRACT_ID||DEPLOYED_V2_TREASURY_CONTRACT_ID,hash=process.env.V2_TREASURY_WASM_SHA256;
 if(requireEnabled&&(process.env.V2_PAYMENTS_ENABLED!=='true'||process.env.PAYMENTS_ENABLED!=='false'))throw Error('V2 payments are disabled');
 if(!contract||['agentledger-treasury.testnet','judge.agentledger-owner.testnet'].includes(contract)||!contract.endsWith('.testnet')||!isTestnetAccountId(contract)||!hash||!/^[0-9a-f]{64}$/.test(hash))throw Error('V2 treasury is not configured');
 return {contract,hash};
}
async function rpc(method:string,params:unknown,fetcher:typeof fetch){
 const response=await fetcher('https://test.rpc.fastnear.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'judge-preflight',method,params}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Testnet RPC unavailable');const body=await response.json();if(body.error||!body.result)throw Error('Testnet RPC unavailable');return body.result;
}
export async function validateDeployment(contract:string,expectedHash:string,fetcher:typeof fetch=fetch){
 const [status,code]=await Promise.all([rpc('status',[],fetcher),rpc('query',{request_type:'view_code',finality:'final',account_id:contract},fetcher)]);
 if(status.chain_id!=='testnet'||typeof code.code_base64!=='string'||code.code_base64.length>6_000_000||!code.code_base64.length)throw Error('Judge contract cannot be verified');
 if(createHash('sha256').update(Buffer.from(code.code_base64,'base64')).digest('hex')!==expectedHash)throw Error('Judge contract code mismatch');
}
export function normalizeJudge(input:JudgeInput,owner:string,contract:string):JudgeInput{
 if(!input||input.signer!==owner||input.contract!==contract)throw Error('Authenticated wallet or contract mismatch');
 if(!input.requestId?.startsWith('v2-jr-')||!input.paymentId?.startsWith('v2-jp-'))throw Error('V2 request and payment identifiers are required');
 if(!input.review||typeof input.review.title!=='string'||typeof input.review.expectedRevenue!=='string')throw Error('Purchase assessment is required');
 const clean:JudgeInput={operation:input.operation,contract,signer:owner,requestId:input.requestId,paymentId:input.paymentId,vendor:input.vendor,amount:input.amount,expiryNs:input.expiryNs,review:{title:input.review.title,expectedRevenue:input.review.expectedRevenue}};prepareJudgeAction(clean);return clean;
}
export async function preflightJudge(i:JudgeInput,fetcher:typeof fetch=fetch){
 const request=await viewContract(i.contract,'get_request',{request_id:i.requestId},fetcher) as {owner:string;status:string;budget:string;remaining:string;expiry_ns:string;vendor:string;payment_id:string|null;amount:string}|null;
 if(i.operation==='create_request'){
  if(request)throw Error('Request ID already exists');
  if(await viewContract(i.contract,'get_payment',{payment_id:i.paymentId},fetcher)!==null)throw Error('Payment ID already used');
  const block=await rpc('block',{finality:'final'},fetcher);const now=BigInt(block.header.timestamp_nanosec);const expiry=BigInt(i.expiryNs);
  if(expiry<=now||expiry>now+86_400_000_000_000n)throw Error('Expiry must be within 24 hours');return;
 }
 if(!request||request.owner!==i.signer||request.budget!==i.amount||request.vendor!==i.vendor||request.expiry_ns!==i.expiryNs||request.payment_id!==i.paymentId)throw Error('Onchain request does not match authenticated owner and preview');
 if(i.operation==='authorize'){
  if(request.status!=='Funded'||BigInt(request.remaining)<BigInt(i.amount)||BigInt(request.expiry_ns)<=BigInt(Date.now())*1_000_000n)throw Error('Guardian blocked this authorization');
  if(await viewContract(i.contract,'get_payment_request',{payment_id:i.paymentId},fetcher)!==i.requestId)throw Error('Payment ID mismatch');
 }
 if(i.operation==='execute'&&(request.status!=='Authorized'||request.payment_id!==i.paymentId||request.amount!==i.amount||BigInt(request.expiry_ns)<=BigInt(Date.now())*1_000_000n))throw Error('Onchain authorization is not executable');
 if(i.operation==='refund'&&(!['Funded','Authorized','Failed','Completed'].includes(request.status)||BigInt(request.remaining)===0n))throw Error('Request is not refundable');
}
export async function claimJudge(owner:string,input:JudgeInput){
 const {contract,hash}=judgeConfig(true);const i=normalizeJudge(input,owner,contract);await validateDeployment(contract,hash);await preflightJudge(i);
 if(i.operation!=='create_request'){
  const rows=await db('SELECT action_input FROM agentledger_v2.payment_intents WHERE owner_account = $1 AND contract_account = $2 AND operation = $3 AND payment_reference = $4 AND status = $5',[owner,contract,'create_request',i.requestId,'CONFIRMED']) as {action_input:JudgeInput}[];
  const initial=rows[0]?.action_input;
  if(rows.length!==1||!initial||initial.signer!==i.signer||initial.requestId!==i.requestId||initial.paymentId!==i.paymentId||initial.vendor!==i.vendor||initial.amount!==i.amount||initial.expiryNs!==i.expiryNs||initial.review?.title!==i.review.title||initial.review?.expectedRevenue!==i.review.expectedRevenue)throw Error('Saved procurement assessment does not match this request');
 }
 const key=createHash('sha256').update(JSON.stringify(['agentledger-v2-testnet',contract,i.requestId,i.operation])).digest('hex');
 const assessment=judgeAssessment(i);
 const rows=await db('SELECT * FROM agentledger_v2.claim_judge_intent($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[owner,key,contract,i.operation==='authorize'?i.paymentId:i.requestId,i.vendor,i.amount,i.operation,JSON.stringify({...i,assessment})]) as JudgeRow[];
 if(rows.length!==1)throw Error('Operation already claimed. Recover the original transaction; do not resubmit.');return rows[0];
}
export async function getJudgeRow(owner:string,id:string){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid intent');
 const {contract}=judgeConfig();const rows=await db('SELECT * FROM agentledger_v2.payment_intents WHERE id = $1 AND owner_account = $2 AND contract_account = $3',[id,owner,contract]) as JudgeRow[];if(rows.length!==1)throw Error('Intent not found');return rows[0];
}
export async function transitionJudge(row:JudgeRow,status:string,hash?:string){
 if(hash&&!validTxHash(hash))throw Error('Invalid transaction hash');
 const rows=await db('SELECT * FROM agentledger_v2.transition_payment_intent($1,$2,$3,$4,$5,$6)',[row.id,row.owner_account,row.version,row.status,status,hash||null]) as JudgeRow[];if(rows.length!==1)throw Error('Intent changed; refresh');return rows[0];
}
