import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {claimJudge,v2PaymentsEnabled} from '../lib/server/judge-intents';
import {assertInitialSigningLimit,prepareJudgeAction,type JudgeInput} from '../lib/judge-payment';

test('V2 signing requires explicit V2 opt-in and both legacy gates off',()=>{
 const old={...process.env};
 try{
  Object.assign(process.env,{V2_PAYMENTS_ENABLED:'true',PAYMENTS_ENABLED:'false',JUDGE_PAYMENTS_ENABLED:'false'});
  assert.equal(v2PaymentsEnabled(),true);
  for(const [key,value] of [['V2_PAYMENTS_ENABLED','false'],['PAYMENTS_ENABLED','true'],['JUDGE_PAYMENTS_ENABLED','true']] as const){process.env[key]=value;assert.equal(v2PaymentsEnabled(),false);process.env[key]=key==='V2_PAYMENTS_ENABLED'?'true':'false';}
  delete process.env.JUDGE_PAYMENTS_ENABLED;assert.equal(v2PaymentsEnabled(),false);
 }finally{process.env=old;}
});

test('initial wallet handoff permits only the exact budget plus storage deposit',()=>{
 const input:JudgeInput={operation:'create_request',contract:'agentledger-v2.agentledger-owner.testnet',signer:'alice.testnet',requestId:'v2-jr-test',paymentId:'v2-jp-test',vendor:'bob.testnet',amount:'10000000000000000000000',expiryNs:'2000000000000000000',review:{title:'Test',expectedRevenue:'20000000000000000000000'}};
 assertInitialSigningLimit(input);assert.equal(prepareJudgeAction(input).actions[0].functionCall!.deposit,40000000000000000000000n);
 assert.throws(()=>assertInitialSigningLimit({...input,amount:'10000000000000000000001'}),/0.04 NEAR/);
 for(const operation of ['authorize','execute','refund'] as const){assertInitialSigningLimit({...input,operation});assert.equal(prepareJudgeAction({...input,operation}).actions[0].functionCall!.deposit,0n);}
});

test('a new payment above the initial 0.01 NEAR cap fails before RPC',async()=>{
 const old={...process.env},oldFetch=globalThis.fetch;let calls=0;
 try{
  Object.assign(process.env,{V2_PAYMENTS_ENABLED:'true',PAYMENTS_ENABLED:'false',JUDGE_PAYMENTS_ENABLED:'false',V2_TREASURY_CONTRACT_ID:'agentledger-v2.agentledger-owner.testnet',V2_TREASURY_WASM_SHA256:'a'.repeat(64)});
  globalThis.fetch=async()=>{calls++;throw Error('unexpected RPC');};
  await assert.rejects(claimJudge('alice.testnet',{operation:'create_request',contract:'agentledger-v2.agentledger-owner.testnet',signer:'alice.testnet',requestId:'v2-jr-test',paymentId:'v2-jp-test',vendor:'bob.testnet',amount:'10000000000000000000001',expiryNs:'2000000000000000000',review:{title:'Test',expectedRevenue:'20000000000000000000000'}}),/0.01 NEAR/);
  assert.equal(calls,0);
 }finally{process.env=old;globalThis.fetch=oldFetch;}
});
