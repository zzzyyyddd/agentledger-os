import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {reviewJudgeRecovery} from '../lib/server/judge-recovery-review';
import {prepareJudgeAction} from '../lib/judge-payment';
import type {JudgeRow} from '../lib/server/judge-intents';

const id='00000000-0000-4000-8000-000000000001',hash='11111111111111111111111111111111';
const target={id,owner:'alice.testnet',contract:'judge.testnet',requestId:'jr-1'};
const row={id,owner_account:target.owner,status:'UNKNOWN',version:3,transaction_hash:null,action_input:{operation:'create_request',contract:target.contract,signer:target.owner,requestId:target.requestId,paymentId:'jp-1',vendor:'vendor.testnet',amount:'10000000000000000000000',expiryNs:'1999999999000000000',review:{title:'Purchase',expectedRevenue:'50000000000000000000000'}}} as JudgeRow;

test('operator review never unlocks a hashless intent or infers failure from missing history',async()=>{
 const result=await reviewJudgeRecovery(row,target,async()=>{throw Error('must not query');});
 assert.equal(result.handoff,'POSSIBLY_BROADCAST');assert.equal(result.outcome,'UNKNOWN');assert.equal(result.lock,'RETAIN');
});

test('operator review rejects mismatched owner, contract, request, state and hashes',async()=>{
 for(const changed of [{owner:'bob.testnet'},{contract:'other.testnet'},{requestId:'other'},{id:'00000000-0000-4000-8000-000000000002'}])await assert.rejects(reviewJudgeRecovery(row,{...target,...changed}),/does not match/);
 await assert.rejects(reviewJudgeRecovery({...row,status:'CONFIRMED'},target),/pending state/);
 await assert.rejects(reviewJudgeRecovery({...row,transaction_hash:hash},{...target,hash:'22222222222222222222222222222222'}),/conflicts/);
});

test('unverified, pending and failed candidate hashes retain the lock',async()=>{
 const fetcher:typeof fetch=async()=>Response.json({result:{final_execution_status:'STARTED'}});
 const result=await reviewJudgeRecovery(row,{...target,hash},fetcher);assert.equal(result.outcome,'UNKNOWN');assert.equal(result.lock,'RETAIN');
});

test('a finalized failure of a matching create transaction does not unlock an uncertain intent',async()=>{
 const action=prepareJudgeAction(row.action_input).actions[0].functionCall!;
 const fetcher:typeof fetch=async()=>Response.json({result:{final_execution_status:'FINAL',status:{Failure:{}},transaction:{hash,signer_id:target.owner,receiver_id:target.contract,actions:[{FunctionCall:{method_name:action.methodName,args:Buffer.from(action.args).toString('base64'),gas:String(action.gas),deposit:String(action.deposit)}}]}}});
 const result=await reviewJudgeRecovery(row,{...target,hash},fetcher);assert.equal(result.outcome,'UNKNOWN');assert.equal(result.lock,'RETAIN');
});
