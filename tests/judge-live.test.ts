import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {judgeAssessment,prepareJudgeAction,JUDGE_STORAGE_FEE,type JudgeInput} from '../lib/judge-payment';
import {submitJudge,prepareJudge} from '../app/near-transaction';
import {DEFAULT_JUDGE_TREASURY_CONTRACT_ID,DEFAULT_JUDGE_TREASURY_WASM_SHA256,normalizeJudge,preflightJudge,validateDeployment,judgeConfig} from '../lib/server/judge-intents';
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
test('all wallet calls match the Judge Treasury ABI and attached deposits',()=>{
 const cases=[
  {operation:'create_request' as const,args:{request_id:input.requestId,expiry_ns:input.expiryNs,vendor:input.vendor,budget:input.amount},deposit:BigInt(input.amount)+JUDGE_STORAGE_FEE},
  {operation:'authorize' as const,args:{request_id:input.requestId,payment_id:input.paymentId,vendor:input.vendor,amount:input.amount},deposit:0n},
  {operation:'execute' as const,args:{request_id:input.requestId},deposit:0n},
  {operation:'refund' as const,args:{request_id:input.requestId},deposit:0n},
 ];
 for(const c of cases){const tx=prepareJudgeAction({...input,operation:c.operation});const action=tx.actions[0].functionCall!;assert.equal(tx.signerId,input.signer);assert.equal(tx.receiverId,input.contract);assert.equal(action.methodName,c.operation);assert.equal(action.gas,100_000_000_000_000n);assert.equal(action.deposit,c.deposit);assert.deepEqual(JSON.parse(Buffer.from(action.args).toString()),c.args);}
});
test('wallet signs only after claim and account match; unknown remains locked',async()=>{
 const events:string[]=[];let selected='alice.testnet';
 const deps={revalidate:async()=>{},claim:async(i:JudgeInput)=>{events.push('claim');return {id:'id',status:'AWAITING_SIGNATURE',action_input:i};},update:async(_id:string,status:'SUBMITTED'|'UNKNOWN')=>{events.push(status);},connect:async()=>({account:selected,wallet:{manifest:{features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{events.push('sign');return {transaction:{hash}};}}})};
 assert.equal(await submitJudge(input,deps),hash);assert.deepEqual(events,['claim','sign','SUBMITTED']);
 events.length=0;selected='bob.testnet';await assert.rejects(submitJudge(input,deps),/does not match/);assert.equal(events.length,0);
 events.length=0;selected='alice.testnet';const reject={...deps,connect:async()=>({account:selected,wallet:{manifest:{features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{events.push('sign');throw Error('rejected');}}})};await assert.rejects(submitJudge(input,reject),/UNKNOWN/);assert.deepEqual(events,['claim','sign','UNKNOWN']);
 events.length=0;const expired={...deps,revalidate:async()=>{throw Error('session expired');}};await assert.rejects(submitJudge(input,expired),/UNKNOWN/);assert.deepEqual(events,['claim','UNKNOWN']);
 events.length=0;const tampered={...deps,claim:async(i:JudgeInput)=>{events.push('claim');return {id:'id',status:'AWAITING_SIGNATURE',action_input:{...i,review:{...i.review,title:'Changed'}}};}};
 await assert.rejects(submitJudge(input,tampered),/UNKNOWN/);assert.deepEqual(events,['claim','UNKNOWN']);
});
test('unsupported wallet fails before claiming and switching after claim stays locked',async()=>{
 let claims=0,updates=0,connects=0;
 const wallet={manifest:{features:{signAndSendTransaction:false}},signAndSendTransaction:async()=>({transaction:{hash}})};
 const deps={revalidate:async()=>{},claim:async(i:JudgeInput)=>{claims++;return {id:'id',status:'AWAITING_SIGNATURE',action_input:i};},update:async()=>{updates++;},connect:async()=>({account:input.signer,wallet})};
 await assert.rejects(submitJudge(input,deps),/does not advertise/);assert.equal(claims,0);assert.equal(updates,0);
 const missingMethod={...deps,connect:async()=>({account:input.signer,wallet:{manifest:{features:{signAndSendTransaction:true}}} as typeof wallet})};
 await assert.rejects(submitJudge(input,missingMethod),/does not advertise/);assert.equal(claims,0);
 const wrongNetwork={...deps,connect:async()=>{throw Error('Switch your wallet to NEAR Testnet');}};
 await assert.rejects(submitJudge(input,wrongNetwork),/Testnet/);assert.equal(claims,0);
 wallet.manifest.features.signAndSendTransaction=true;
 const switched={...deps,connect:async()=>({account:++connects===1?input.signer:'other.testnet',wallet})};
 await assert.rejects(submitJudge(input,switched),/UNKNOWN/);assert.equal(claims,1);assert.equal(updates,1);
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
test('deployed public defaults do not enable payments and can be overridden',()=>{
 const old={...process.env};try{
  delete process.env.JUDGE_TREASURY_CONTRACT_ID;delete process.env.JUDGE_TREASURY_WASM_SHA256;
  Object.assign(process.env,{JUDGE_PAYMENTS_ENABLED:'false',PAYMENTS_ENABLED:'false'});
  assert.equal(DEFAULT_JUDGE_TREASURY_CONTRACT_ID,'judge.agentledger-owner.testnet');
  assert.equal(DEFAULT_JUDGE_TREASURY_WASM_SHA256,'5f846cc122636f8bc7e1f7ca94e85c1e17e67dedc269ca0ed27c783fca510753');
  assert.deepEqual(judgeConfig(),{contract:DEFAULT_JUDGE_TREASURY_CONTRACT_ID,hash:DEFAULT_JUDGE_TREASURY_WASM_SHA256});
  assert.throws(()=>judgeConfig(true),/disabled/);
  process.env.JUDGE_TREASURY_CONTRACT_ID='other.testnet';process.env.JUDGE_TREASURY_WASM_SHA256='1'.repeat(64);
  assert.deepEqual(judgeConfig(),{contract:'other.testnet',hash:'1'.repeat(64)});
 }finally{process.env=old;}
});
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

test('late wallet result records original hash after interruption without making another submission',async()=>{
 let resolveWallet:((value:{transaction:{hash:string}})=>void)|undefined,calls=0,status='AWAITING_SIGNATURE';const phases:string[]=[];
 const wallet={manifest:{features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{calls++;return new Promise<{transaction:{hash:string}}>(resolve=>{resolveWallet=resolve;});}};
 const deps={onPhase:(phase:'PRE_WALLET_HANDOFF'|'POSSIBLY_BROADCAST')=>phases.push(phase),revalidate:async()=>{},claim:async(i:JudgeInput)=>({id:'id',status:'AWAITING_SIGNATURE',action_input:i}),connect:async()=>({account:input.signer,wallet}),update:async(_id:string,next:'SUBMITTED'|'UNKNOWN',value?:string)=>{if(next==='SUBMITTED'){assert.equal(value,hash);assert.ok(['AWAITING_SIGNATURE','UNKNOWN'].includes(status));}status=next;}};
 const pending=submitJudge(input,deps);
 while(!resolveWallet)await new Promise<void>(resolve=>setImmediate(resolve));
 assert.deepEqual(phases,['PRE_WALLET_HANDOFF','POSSIBLY_BROADCAST']);status='UNKNOWN';resolveWallet({transaction:{hash}});
 assert.equal(await pending,hash);assert.equal(status,'SUBMITTED');assert.equal(calls,1);
});

test('failure before wallet handoff remains locked and reports the handoff phase',async()=>{
 const phases:string[]=[],updates:string[]=[];
 const wallet={manifest:{features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{throw Error('wallet must not open');}};
 const deps={onPhase:(phase:'PRE_WALLET_HANDOFF'|'POSSIBLY_BROADCAST')=>phases.push(phase),revalidate:async()=>{throw Error('unavailable');},claim:async(i:JudgeInput)=>({id:'id',status:'AWAITING_SIGNATURE',action_input:i}),connect:async()=>({account:input.signer,wallet}),update:async(_id:string,next:'SUBMITTED'|'UNKNOWN')=>{updates.push(next);}};
 await assert.rejects(submitJudge(input,deps),/handoff did not start/);assert.deepEqual(phases,['PRE_WALLET_HANDOFF']);assert.deepEqual(updates,['UNKNOWN']);
});

test('blocked wallet popup remains possibly broadcast and does not unlock',async()=>{
 const phases:string[]=[],updates:string[]=[];
 const wallet={manifest:{features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{throw Error('popup blocked');}};
 const deps={onPhase:(phase:'PRE_WALLET_HANDOFF'|'POSSIBLY_BROADCAST')=>phases.push(phase),revalidate:async()=>{},claim:async(i:JudgeInput)=>({id:'id',status:'AWAITING_SIGNATURE',action_input:i}),connect:async()=>({account:input.signer,wallet}),update:async(_id:string,next:'SUBMITTED'|'UNKNOWN')=>{updates.push(next);}};
 await assert.rejects(submitJudge(input,deps),/wallet may have broadcast/);assert.deepEqual(phases,['PRE_WALLET_HANDOFF','POSSIBLY_BROADCAST']);assert.deepEqual(updates,['UNKNOWN']);
});

test('void wallet response remains locked and never retries',async()=>{
 let calls=0;const updates:string[]=[];
 const wallet={manifest:{id:'popup',features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{calls++;}};
 await assert.rejects(submitJudge(input,{revalidate:async()=>{},claim:async(i)=>({id:'id',status:'AWAITING_SIGNATURE',action_input:i}),connect:async()=>({account:input.signer,wallet}),update:async(_id,status)=>{updates.push(status);}}),/UNKNOWN/);
 assert.equal(calls,1);assert.deepEqual(updates,['UNKNOWN']);
});
test('switching wallets for the same account before handoff leaves the claim locked',async()=>{
 let calls=0,connections=0;const updates:string[]=[];
 const wallet=(id:string)=>({manifest:{id,features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{calls++;return {transaction:{hash}};}});
 await assert.rejects(submitJudge(input,{revalidate:async()=>{},claim:async(i)=>({id:'id',status:'AWAITING_SIGNATURE',action_input:i}),connect:async()=>({account:input.signer,wallet:wallet(++connections===1?'one':'two')}),update:async(_id,status)=>{updates.push(status);}}),/handoff did not start/);
 assert.equal(calls,0);assert.deepEqual(updates,['UNKNOWN']);
});

test('a lost claim response never opens the wallet or attempts to update an unknown row',async()=>{
 let calls=0,updates=0;
 const wallet={manifest:{id:'wallet',features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{calls++;return {transaction:{hash}};}};
 await assert.rejects(submitJudge(input,{connect:async()=>({account:input.signer,wallet}),claim:async()=>{throw Error('timeout');},revalidate:async()=>{},update:async()=>{updates++;}}),/claim may still be processing/);
 assert.equal(calls,0);assert.equal(updates,0);
});

test('stale authorization stops handoff and retains the claimed intent',async()=>{
 let calls=0;const updates:string[]=[];
 const wallet={manifest:{id:'wallet',features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{calls++;return {transaction:{hash}};}};
 await assert.rejects(submitJudge(input,{connect:async()=>({account:input.signer,wallet}),claim:async(i)=>({id:'id',status:'AWAITING_SIGNATURE',action_input:i}),revalidate:async()=>{throw Error('session expired');},update:async(_id,status)=>{updates.push(status);}}),/handoff did not start/);
 assert.equal(calls,0);assert.deepEqual(updates,['UNKNOWN']);
});

test('reconciliation keeps delayed RPC and mismatched signer unknown',async()=>{
 const action=prepareJudgeAction(input).actions[0].functionCall!;
 const row={id:'id',owner_account:input.signer,status:'SUBMITTED',version:1,transaction_hash:hash,action_input:input};
 assert.equal(await reconcileJudge(row,async()=>{throw Error('timeout');}),'UNKNOWN');
 const fetcher:typeof fetch=async()=>Response.json({result:{final_execution_status:'FINAL',transaction:{hash,signer_id:'other.testnet',receiver_id:input.contract,actions:[{FunctionCall:{method_name:action.methodName,gas:String(action.gas),deposit:String(action.deposit),args:Buffer.from(action.args).toString('base64')}}]},status:{SuccessValue:''},receipts_outcome:[]}});
 assert.equal(await reconcileJudge(row,fetcher),'UNKNOWN');
});

test('original hash is available for recovery before a failed server update',async()=>{
 const events:string[]=[];
 const wallet={manifest:{id:'wallet',features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>({transaction:{hash}})};
 await assert.rejects(submitJudge(input,{connect:async()=>({account:input.signer,wallet}),claim:async(i)=>({id:'intent',status:'AWAITING_SIGNATURE',action_input:i}),revalidate:async()=>{},onHash:(id,value)=>{assert.equal(id,'intent');assert.equal(value,hash);events.push('saved');},update:async(_id,status,value)=>{assert.equal(status,'SUBMITTED');assert.equal(value,hash);events.push('update');throw Error('offline');}}),/Save original hash/);
 assert.deepEqual(events,['saved','update','update']);
});

test('matching transaction with altered deposit or arguments stays unknown',async()=>{
 const action=prepareJudgeAction(input).actions[0].functionCall!;
 const row={id:'id',owner_account:input.signer,status:'SUBMITTED',version:1,transaction_hash:hash,action_input:input};
 const tx={hash,signer_id:input.signer,receiver_id:input.contract,actions:[{FunctionCall:{method_name:action.methodName,gas:String(action.gas),deposit:'0',args:Buffer.from(action.args).toString('base64')}}]};
 const fetcher:typeof fetch=async()=>Response.json({result:{final_execution_status:'FINAL',transaction:tx,status:{SuccessValue:''},receipts_outcome:[]}});
 assert.equal(await reconcileJudge(row,fetcher),'UNKNOWN');
 tx.actions[0].FunctionCall.deposit=String(action.deposit);tx.actions[0].FunctionCall.args=Buffer.from('{}').toString('base64');
 assert.equal(await reconcileJudge(row,fetcher),'UNKNOWN');
});

test('a finalized create requires the matching contract receipt and request',async()=>{
 const action=prepareJudgeAction(input).actions[0].functionCall!;
 const row={id:'id',owner_account:input.signer,status:'SUBMITTED',version:1,transaction_hash:hash,action_input:input};
 const request={owner:input.signer,budget:input.amount,expiry_ns:input.expiryNs,vendor:input.vendor,remaining:input.amount,status:'Funded'};
 const result={final_execution_status:'FINAL',transaction:{hash,signer_id:input.signer,receiver_id:input.contract,actions:[{FunctionCall:{method_name:action.methodName,gas:String(action.gas),deposit:String(action.deposit),args:Buffer.from(action.args).toString('base64')}}]},status:{SuccessValue:''},receipts_outcome:[{outcome:{executor_id:input.contract,status:{SuccessValue:''}}}]};
 const fetcher:typeof fetch=async(_url,init)=>{const q=JSON.parse(String(init?.body));return q.method==='tx'?Response.json({result}):Response.json({result:{result:[...Buffer.from(JSON.stringify(request))]}});};
 assert.equal(await reconcileJudge(row,fetcher),'CONFIRMED');
 result.receipts_outcome=[];assert.equal(await reconcileJudge(row,fetcher),'UNKNOWN');
});

test('Meteor-compatible signer returns its hash after the durable claim',async()=>{
 const events:string[]=[];const wallet={manifest:{id:'meteor-wallet',features:{signAndSendTransaction:true}},signAndSendTransaction:async(action:ReturnType<typeof prepareJudgeAction>)=>{events.push('wallet');assert.equal(action.signerId,input.signer);return {transaction:{hash}};}};
 const result=await submitJudge(input,{connect:async()=>({account:input.signer,wallet}),claim:async(i)=>{events.push('claim');return {id:'intent',status:'AWAITING_SIGNATURE',action_input:i};},revalidate:async()=>{},update:async(_id,status,value)=>{events.push(status);assert.equal(value,hash);}});
 assert.equal(result,hash);assert.deepEqual(events,['claim','wallet','SUBMITTED']);
});

test('Meteor blocked popup and cancelled approval remain locked without rebroadcast',async()=>{
 for(const error of ['popup blocked','user rejected']){
  let calls=0;const updates:string[]=[];
  const wallet={manifest:{id:'meteor-wallet',features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{calls++;throw Error(error);}};
  await assert.rejects(submitJudge(input,{connect:async()=>({account:input.signer,wallet}),claim:async(i)=>({id:'intent',status:'AWAITING_SIGNATURE',action_input:i}),revalidate:async()=>{},update:async(_id,status)=>{updates.push(status);}}),/wallet may have broadcast/);
  assert.equal(calls,1);assert.deepEqual(updates,['UNKNOWN']);
 }
});

test('each prepared operation calls the wallet synchronously on final approval',async()=>{
 for(const operation of ['create_request','authorize','execute','refund'] as const){
  const events:string[]=[];const i={...input,operation};
  const wallet={manifest:{id:'extension',features:{signAndSendTransaction:true}},signAndSendTransaction:(action:ReturnType<typeof prepareJudgeAction>)=>{events.push('wallet');assert.equal(action.signerId,i.signer);assert.equal(action.actions[0].functionCall!.methodName,operation);return Promise.resolve({transaction:{hash}});}};
  const prepared=await prepareJudge(i,{connect:async()=>{events.push('connect');return {account:i.signer,wallet};},claim:async(x)=>{events.push('claim');return {id:'intent',status:'AWAITING_SIGNATURE',action_input:x};},revalidate:async()=>{events.push('revalidate');return {id:'intent',owner:i.signer,action_input:i,expiresAt:Date.now()+60000};},update:async(_id,status)=>{events.push(status);}});
  assert.deepEqual(events,['connect','claim','revalidate','connect']);
  const result=prepared.approve();assert.deepEqual(events,['connect','claim','revalidate','connect','wallet']);
  assert.throws(()=>prepared.approve(),/expired or changed/);
  assert.equal(await result,hash);assert.deepEqual(events,['connect','claim','revalidate','connect','wallet','SUBMITTED']);
 }
});

test('expired or invalidated preparation never opens the wallet or releases the lock',async()=>{
 let calls=0,updates=0;const wallet={manifest:{id:'extension',features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{calls++;return {transaction:{hash}};}};
 const deps={connect:async()=>({account:input.signer,wallet}),claim:async(i:JudgeInput)=>({id:'intent',status:'AWAITING_SIGNATURE',action_input:i}),revalidate:async()=>({id:'intent',owner:input.signer,action_input:input,expiresAt:Date.now()+60000}),update:async()=>{updates++;}};
 const oldNow=Date.now;try{let now=1000;Date.now=()=>now;const expired=await prepareJudge(input,deps);now=expired.expiresAt;assert.throws(()=>expired.approve(),/expired or changed/);const changed=await prepareJudge(input,deps);changed.invalidate();assert.throws(()=>changed.approve(),/expired or changed/);}finally{Date.now=oldNow;}
 assert.equal(calls,0);assert.equal(updates,0);
});

test('preparation refuses changed wallet or mismatched server snapshot',async()=>{
 for(const scenario of ['wallet','snapshot'] as const){
  let calls=0,connections=0;const updates:string[]=[];
  const makeWallet=(id:string)=>({manifest:{id,features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{calls++;return {transaction:{hash}};}});
  await assert.rejects(prepareJudge(input,{connect:async()=>({account:input.signer,wallet:makeWallet(scenario==='wallet'&&++connections===2?'other':'original')}),claim:async(i)=>({id:'intent',status:'AWAITING_SIGNATURE',action_input:i}),revalidate:async()=>({id:'intent',owner:input.signer,action_input:scenario==='snapshot'?{...input,amount:'1'}:input,expiresAt:Date.now()+59000}),update:async(_id,status)=>{updates.push(status);}}),/handoff did not start/);
  assert.equal(calls,0);assert.deepEqual(updates,['UNKNOWN']);
 }
});
