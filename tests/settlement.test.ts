import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {settlementMatches,SETTLEMENT} from '../lib/settlement';
import {GET} from '../app/api/settlement/route';

const request={status:'Completed',budget:SETTLEMENT.amount,remaining:'0',amount:SETTLEMENT.amount,vendor:SETTLEMENT.vendor,payment_id:SETTLEMENT.payment};
test('historical settlement matches only exact completed state and amounts',()=>{
 assert.equal(settlementMatches(request),true);
 for(const patch of [{status:'Pending'},{remaining:'1'},{amount:'1'},{vendor:'other.testnet'},{payment_id:'other'}]) assert.equal(settlementMatches({...request,...patch}),false);
 assert.equal(settlementMatches(null),false);
});
test('settlement endpoint queries only the fixed finalized read-only contract request and fails closed',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));assert.equal(body.method,'query');assert.equal(body.params.finality,'final');assert.equal(body.params.account_id,SETTLEMENT.contract);assert.equal(body.params.method_name,'get_request');assert.deepEqual(JSON.parse(Buffer.from(body.params.args_base64,'base64').toString()),{request_id:SETTLEMENT.request});return Response.json({result:{result:[...Buffer.from(JSON.stringify(request))],block_height:1}});};
  const ok=await GET();assert.equal(ok.status,200);assert.equal((await ok.json()).matches,true);
  globalThis.fetch=async()=>Response.json({error:{message:'unavailable'}});const unavailable=await GET();assert.equal(unavailable.status,503);
 } finally {globalThis.fetch=original;}
});
