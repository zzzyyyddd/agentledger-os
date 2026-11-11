import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {judgeAssessment,prepareJudgeAction,JUDGE_STORAGE_FEE,type JudgeInput} from '../lib/judge-payment';
import {submitJudge} from '../app/judge-submit';
import {normalizeJudge,preflightJudge,validateDeployment,judgeConfig} from '../lib/server/judge-intents';
import {reconcileJudge} from '../lib/server/judge-reconcile';
import {isTestnetAccountId} from '../lib/near-account';

const input:JudgeInput={operation:'create_request',contract:'judge.testnet',signer:'alice.testnet',requestId:'jr-1',paymentId:'jp-1',vendor:'vendor.testnet',amount:'10000000000000000000000',expiryNs:'1999999999000000000',review:{title:'Test purchase',expectedRevenue:'50000000000000000000000'}};
const hash='11111111111111111111111111111111';
test('wallet action uses exact contract ABI, deposit and supports implicit account',()=>{
 const a=prepareJudgeAction(input).actions[0].functionCall!;
 assert.equal(a.deposit,BigInt(input.amount)+JUDGE_STORAGE_FEE);
 assert.deepEqual(JSON.parse(Buffer.from(a.args).toString()),{request_id:'jr-1',expiry_ns:input.expiryNs,vendor:input.vendor,budget:input.amount});
 assert.equal(isTestnetAccountId('a'.repeat(64)),true);assert.equal(isTestnetAccountId('alice.near'),false);
 assert.equal(prepareJudgeAction({...input,signer:'a'.repeat(64)}).signerId,'a'.repeat(64));
 assert.throws(()=>prepareJudgeAction({...input,amount:'100000000000000000000001'}),/amount/);
 const assessment=judgeAssessment(input);assert.equal(assessment.recommendedVendor,input.vendor);assert.equal(assessment.marginBasisPoints,'8000');assert.equal(assessment.advisory,true);
 assert.throws(()=>judgeAssessment({...input,review:{title:'',expectedRevenue:input.review.expectedRevenue}}),/description/);
});
test('wallet signs only after claim and account match; unknown remains locked',async()=>{
 const events:string[]=[];let selected='alice.testnet';
 const deps={claim:async(i:JudgeInput)=>{events.push('claim');return {id:'id',status:'AWAITING_SIGNATURE',action_input:i};},update:async(_id:string,status:'SUBMITTED'|'UNKNOWN')=>{events.push(status);},connect:async()=>({account:selected,wallet:{signAndSendTransaction:async()=>{events.push('sign');return {transaction:{hash}};}}})};
 assert.equal(await submitJudge(input,deps),hash);assert.deepEqual(events,['claim','sign','SUBMITTED']);
 events.length=0;selected='bob.testnet';await assert.rejects(submitJudge(input,deps),/UNKNOWN/);assert.deepEqual(events,['claim','UNKNOWN']);
 events.length=0;selected='alice.testnet';const reject={...deps,connect:async()=>({account:selected,wallet:{signAndSendTransaction:async()=>{events.push('sign');throw Error('rejected');}}})};await assert.rejects(submitJudge(input,reject),/UNKNOWN/);assert.deepEqual(events,['claim','sign','UNKNOWN']);
 events.length=0;const tampered={...deps,claim:async(i:JudgeInput)=>{events.push('claim');return {id:'id',status:'AWAITING_SIGNATURE',action_input:{...i,review:{...i.review,title:'Changed'}}};}};
 await assert.rejects(submitJudge(input,tampered),/UNKNOWN/);assert.deepEqual(events,['claim','UNKNOWN']);
});
test('contract preflight pins deployment and blocks another owner and duplicate ID',async()=>{
 const code=Buffer.from('judge-wasm'),digest=createHash('sha256').update(code).digest('hex');
 const deployment:typeof fetch=async(_url,init)=>{const q=JSON.parse(String(init?.body));return Response.json({result:q.method==='status'?{chain_id:'testnet'}:{code_base64:code.toString('base64')}});};
 await validateDeployment(input.contract,digest,deployment);await assert.rejects(validateDeployment(input.contract,'0'.repeat(64),deployment),/mismatch/);
 assert.throws(()=>normalizeJudge(input,'bob.testnet',input.contract),/mismatch/);
 const state={owner:'bob.testnet',status:'Funded',budget:input.amount,remaining:input.amount,vendor:input.vendor,expiry_ns:input.expiryNs};
 const view:typeof fetch=async()=>Response.json({result:{result:[...Buffer.from(JSON.stringify(state))]}});
 await assert.rejects(preflightJudge({...input,operation:'authorize'},view),/does not match/);
 await assert.rejects(preflightJudge(input,view),/already exists/);
 const good={...state,owner:input.signer,expiry_ns:'1'};
 const expired:typeof fetch=async()=>Response.json({result:{result:[...Buffer.from(JSON.stringify(good))]}});
 await assert.rejects(preflightJudge({...input,operation:'authorize',expiryNs:'1'},expired),/Guardian blocked/);
});
test('live judge gate stays separate from the disabled legacy payments gate',()=>{const old={...process.env};try{Object.assign(process.env,{JUDGE_PAYMENTS_ENABLED:'false',PAYMENTS_ENABLED:'false',JUDGE_TREASURY_CONTRACT_ID:input.contract,JUDGE_TREASURY_WASM_SHA256:'0'.repeat(64)});assert.throws(()=>judgeConfig(true),/disabled/);process.env.JUDGE_PAYMENTS_ENABLED='true';assert.equal(judgeConfig(true).contract,input.contract);process.env.PAYMENTS_ENABLED='true';assert.throws(()=>judgeConfig(true),/disabled/);}finally{process.env=old;}});
test('reconciliation requires matching signed action, finalized callback and recipient receipt',async()=>{
 const i={...input,operation:'execute' as const},action=prepareJudgeAction(i).actions[0].functionCall!;
 const tx={hash,signer_id:i.signer,receiver_id:i.contract,actions:[{FunctionCall:{method_name:action.methodName,gas:String(action.gas),deposit:String(action.deposit),args:Buffer.from(action.args).toString('base64')}}]};
 const request={owner:i.signer,budget:i.amount,expiry_ns:i.expiryNs,vendor:i.vendor,payment_id:i.paymentId,amount:i.amount,remaining:'0',status:'Completed'};
 const result={final_execution_status:'FINAL',transaction:tx,status:{SuccessValue:'dHJ1ZQ=='},receipts_outcome:[{outcome:{executor_id:i.contract,status:{SuccessValue:'dHJ1ZQ=='}}},{outcome:{executor_id:i.vendor,status:{SuccessValue:''}}}]};
 const fetcher:typeof fetch=async(_url,init)=>{const q=JSON.parse(String(init?.body));if(q.method==='tx')return Response.json({result});const value=q.params.method_name==='get_request'?request:i.requestId;return Response.json({result:{result:[...Buffer.from(JSON.stringify(value))]}});};
 const row={id:'id',owner_account:i.signer,status:'SUBMITTED',version:1,transaction_hash:hash,action_input:i};
 assert.equal(await reconcileJudge(row,fetcher),'CONFIRMED');result.receipts_outcome.pop();assert.equal(await reconcileJudge(row,fetcher),'UNKNOWN');
 result.final_execution_status='STARTED';assert.equal(await reconcileJudge(row,fetcher),'UNKNOWN');
});
