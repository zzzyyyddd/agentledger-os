import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {digest,setQueryForTests} from '../lib/server/database';
import {POST as claim} from '../app/api/judge/claim/route';
import {POST as update} from '../app/api/judge/update/route';
import {GET as list} from '../app/api/judge/intents/route';
import {POST as reconcile} from '../app/api/judge/reconcile/route';

const owner='alice.testnet',id='00000000-0000-4000-8000-000000000001',code=Buffer.from('judge');
const input={operation:'create_request',contract:'judge.testnet',signer:owner,requestId:'jr-1',paymentId:'jp-1',vendor:'agentledger-vendor.testnet',amount:'10000000000000000000000',expiryNs:String(BigInt(Date.now()+3_600_000)*1_000_000n),review:{title:'Test purchase',expectedRevenue:'50000000000000000000000'}};
const req=(path:string,body?:unknown,token='alice')=>new Request(`http://localhost:3000${path}`,{method:body?'POST':'GET',headers:{origin:'http://localhost:3000',cookie:`al_session=${token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
test('judge routes atomically lock duplicates and scope recovery and updates to the authenticated owner',async()=>{
 const old={...process.env},oldFetch=globalThis.fetch;Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'postgresql://localhost/test',APP_ORIGIN:'http://localhost:3000',PAYMENTS_ENABLED:'false',JUDGE_PAYMENTS_ENABLED:'true',JUDGE_TREASURY_CONTRACT_ID:'judge.testnet',JUDGE_TREASURY_WASM_SHA256:createHash('sha256').update(code).digest('hex')});let saved:Record<string,unknown>|undefined;
 globalThis.fetch=async(_url,init)=>{const q=JSON.parse(String(init?.body));if(q.method==='status')return Response.json({result:{chain_id:'testnet'}});if(q.method==='block')return Response.json({result:{header:{timestamp_nanosec:String(BigInt(Date.now())*1_000_000n)}}});if(q.params.request_type==='view_code')return Response.json({result:{code_base64:code.toString('base64')}});return Response.json({result:{result:[...Buffer.from('null')]}});};
 const query=async(sql:string,p:unknown[])=>{
  if(sql.includes('wallet_sessions'))return [{owner_account:p[0]===digest('alice')?owner:'bob.testnet'}];
  if(sql.includes('claim_judge_intent')){if(saved)return [];saved={id,owner_account:p[0],contract_account:p[2],status:'AWAITING_SIGNATURE',version:1,transaction_hash:null,action_input:JSON.parse(String(p[7]))};return [saved];}
  if(sql.includes('transition_payment_intent')){if(!saved||p[1]!==saved.owner_account||p[2]!==saved.version||p[3]!==saved.status)return [];saved={...saved,status:p[4],version:Number(saved.version)+1,transaction_hash:p[5]};return [saved];}
  if(sql.includes('FROM public.payment_intents'))return saved&&(sql.includes('WHERE id =')?p[1]:p[0])===saved.owner_account?[saved]:[];
  throw Error('Unexpected query');
 };
 setQueryForTests(query);
 try{
  const claims=await Promise.all([claim(req('/api/judge/claim',{input:{...input,assessment:{marginBasisPoints:'forged'}}})),claim(req('/api/judge/claim',{input}))]);assert.deepEqual(claims.map(r=>r.status).sort(),[200,400]);
  const persisted=saved?.action_input as {assessment:{recommendedVendor:string;amount:string;expectedRevenue:string;marginBasisPoints:string;guardian:{recipientBound:boolean;amountWithinContractCap:boolean}}};assert.equal(persisted.assessment.recommendedVendor,input.vendor);assert.equal(persisted.assessment.guardian.recipientBound,true);assert.equal(persisted.assessment.guardian.amountWithinContractCap,true);assert.equal(persisted.assessment.amount,input.amount);assert.equal(persisted.assessment.expectedRevenue,input.review.expectedRevenue);assert.equal(persisted.assessment.marginBasisPoints,'8000');
  assert.equal((await update(req('/api/judge/update',{id,status:'UNKNOWN'},'bob'))).status,400);
  assert.equal((await update(req('/api/judge/update',{id,status:'UNKNOWN'}))).status,200);
  setQueryForTests();setQueryForTests(query); // emulate a fresh process sharing durable storage
  const recovered=await list(req('/api/judge/intents'));assert.equal((await recovered.json()).intents[0].status,'UNKNOWN');
  const other=await list(req('/api/judge/intents',undefined,'bob'));assert.equal((await other.json()).intents.length,0);
  assert.equal((await claim(req('/api/judge/claim',{input}))).status,400);
  if(saved)saved={...saved,status:'CONFIRMED'};
  const repeated=await reconcile(req('/api/judge/reconcile',{id}));assert.equal((await repeated.json()).outcome,'CONFIRMED');
 }finally{setQueryForTests();globalThis.fetch=oldFetch;process.env=old;}
});

test('disabled judge payment gate rejects a claim before RPC or intent writes',async()=>{
 const old={...process.env},oldFetch=globalThis.fetch;let calls=0;
 Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'postgresql://localhost/test',APP_ORIGIN:'http://localhost:3000',PAYMENTS_ENABLED:'false',JUDGE_PAYMENTS_ENABLED:'false'});
 globalThis.fetch=async()=>{calls++;throw Error('Unexpected RPC');};
 setQueryForTests(async sql=>{if(sql.includes('wallet_sessions'))return [{owner_account:owner}];throw Error('Unexpected write');});
 try{const response=await claim(req('/api/judge/claim',{input}));assert.equal(response.status,400);assert.match((await response.json()).error,/disabled/);assert.equal(calls,0);}finally{setQueryForTests();globalThis.fetch=oldFetch;process.env=old;}
});
