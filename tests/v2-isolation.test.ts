import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {setQueryForTests} from '../lib/server/database';
import {GET as list} from '../app/api/judge/intents/route';
import {GET as legacyList} from '../app/api/intents/route';

test('V2 intent history and locks are scoped to the V2 schema, owner and contract',async()=>{
 const old={...process.env};Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'postgresql://localhost/test',APP_ORIGIN:'http://localhost:3000',V2_TREASURY_CONTRACT_ID:'v2.testnet',V2_TREASURY_WASM_SHA256:'a'.repeat(64),V2_PAYMENTS_ENABLED:'true',PAYMENTS_ENABLED:'false'});
 const v1={id:'v1',owner_account:'owner.testnet',contract_account:'v1.testnet',status:'UNKNOWN'};
 const v2={id:'v2',owner_account:'owner.testnet',contract_account:'v2.testnet',status:'CONFIRMED'};
 let checked=false;setQueryForTests(async(sql,params)=>{if(sql.includes('wallet_sessions')){assert.match(sql,/agentledger_v2\.wallet_sessions/);return [{owner_account:'owner.testnet'}];}assert.match(sql,/FROM agentledger_v2\.payment_intents/);assert.match(sql,/owner_account = \$1 AND contract_account = \$2/);assert.deepEqual(params,['owner.testnet','v2.testnet',0]);checked=true;return [v1,v2].filter(row=>row.contract_account===params[1]);});
 try{const response=await list(new Request('http://localhost:3000/api/judge/intents',{headers:{cookie:'al_v2_session=test'}}));assert.equal(response.status,200);const result=await response.json();assert.deepEqual(result.intents.map((r:{id:string})=>r.id),['v2']);assert.equal(checked,true);assert.equal((await legacyList(new Request('http://localhost:3000/api/intents'))).status,410);}finally{setQueryForTests();process.env=old;}
});
