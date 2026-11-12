import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {setQueryForTests} from '../lib/server/database';
import {POST} from '../app/api/judge/prepare/route';

const owner='alice.testnet',id='00000000-0000-4000-8000-000000000001',code=Buffer.from('judge');
const input={operation:'create_request',contract:'judge.testnet',signer:owner,requestId:'jr-1',paymentId:'jp-1',vendor:'vendor.testnet',amount:'10000000000000000000000',expiryNs:String(BigInt(Date.now()+3_600_000)*1_000_000n),review:{title:'Purchase',expectedRevenue:'50000000000000000000000'}};
const request=()=>new Request('http://localhost:3000/api/judge/prepare',{method:'POST',headers:{origin:'http://localhost:3000',cookie:'al_session=test','content-type':'application/json'},body:JSON.stringify({id})});
test('preparation rechecks the claimed operation and bounds approval to the session without writes',async()=>{
 const old={...process.env},oldFetch=globalThis.fetch;let status='AWAITING_SIGNATURE',ownerInSession=owner,writes=0;const expiry=Date.now()+30_000;
 Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'postgresql://localhost/test',APP_ORIGIN:'http://localhost:3000',PAYMENTS_ENABLED:'false',JUDGE_PAYMENTS_ENABLED:'true',JUDGE_TREASURY_CONTRACT_ID:'judge.testnet',JUDGE_TREASURY_WASM_SHA256:createHash('sha256').update(code).digest('hex')});
 setQueryForTests(async(sql,p)=>{if(!/^SELECT/i.test(sql))writes++;if(sql.includes('wallet_sessions'))return [{owner_account:ownerInSession,expires_at:new Date(expiry)}];if(sql.includes('payment_intents'))return p[1]===owner?[{id,owner_account:owner,status,version:1,transaction_hash:null,action_input:input}]:[];throw Error('Unexpected query');});
 globalThis.fetch=async(_url,init)=>{const q=JSON.parse(String(init?.body));if(q.method==='status')return Response.json({result:{chain_id:'testnet'}});if(q.method==='block')return Response.json({result:{header:{timestamp_nanosec:String(BigInt(Date.now())*1_000_000n)}}});if(q.params.request_type==='view_code')return Response.json({result:{code_base64:code.toString('base64')}});return Response.json({result:{result:[...Buffer.from('null')]}});};
 try{const response=await POST(request());assert.equal(response.status,200);const result=await response.json();assert.equal(result.id,id);assert.equal(result.owner,owner);assert.deepEqual(result.action_input,input);assert.ok(result.expiresAt<=expiry&&result.expiresAt>Date.now());status='UNKNOWN';assert.equal((await POST(request())).status,400);status='AWAITING_SIGNATURE';ownerInSession='other.testnet';assert.equal((await POST(request())).status,400);assert.equal(writes,0);}finally{setQueryForTests();globalThis.fetch=oldFetch;process.env=old;}
});
