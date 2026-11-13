import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {reconcileJudge} from '../lib/server/judge-reconcile';
import type {JudgeInput} from '../lib/judge-payment';

const code=Buffer.from('independent-v2');
const input:JudgeInput={operation:'create_request',contract:'new-v2.testnet',signer:'alice.testnet',requestId:'v2-jr-example',paymentId:'v2-jp-example',vendor:'vendor.testnet',amount:'100',expiryNs:'2000000000000000000',review:{title:'Purchase',expectedRevenue:'200'}};
const row={id:'id',owner_account:input.signer,status:'UNKNOWN',version:1,transaction_hash:null,action_input:input};
const payment={request_id:input.requestId,payment_id:input.paymentId,owner:input.signer,vendor:input.vendor,budget:input.amount,expiry_ns:input.expiryNs,status:'Funded'};
test('hashless V2 creation recovers only a finalized matching payment on the verified contract',async()=>{
 const old={...process.env};Object.assign(process.env,{V2_TREASURY_CONTRACT_ID:input.contract,V2_TREASURY_WASM_SHA256:createHash('sha256').update(code).digest('hex')});
 let state:typeof payment|null=payment;
 const rpc:typeof fetch=async(_url,init)=>{const q=JSON.parse(String(init?.body));if(q.method==='status')return Response.json({result:{chain_id:'testnet'}});if(q.params.request_type==='view_code')return Response.json({result:{code_base64:code.toString('base64')}});assert.equal(q.params.method_name,'get_payment');assert.equal(q.params.finality,'final');return Response.json({result:{result:[...Buffer.from(JSON.stringify(state))]}});};
 try{assert.equal(await reconcileJudge(row,rpc),'CONFIRMED');state=null;assert.equal(await reconcileJudge(row,rpc),'UNKNOWN');state={...payment,owner:'bob.testnet'};assert.equal(await reconcileJudge(row,rpc),'UNKNOWN');state={...payment,status:'Pending'};assert.equal(await reconcileJudge(row,rpc),'UNKNOWN');assert.equal(await reconcileJudge({...row,action_input:{...input,operation:'execute'}},rpc),'UNKNOWN');process.env.V2_TREASURY_WASM_SHA256='0'.repeat(64);state=payment;assert.equal(await reconcileJudge(row,rpc),'UNKNOWN');}finally{process.env=old;}
});
