import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {setQueryForTests} from '../lib/server/database';
import {GET} from '../app/api/auth/session/route';

test('session API distinguishes expiry from durable-store failure',async()=>{
 const old={...process.env};Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'postgresql://localhost/test',APP_ORIGIN:'http://localhost:3000'});
 const request=()=>new Request('http://localhost:3000/api/auth/session',{headers:{cookie:'al_session=test'}});
 try{
  setQueryForTests(async()=>[]);const expired=await GET(request());assert.equal(expired.status,200);assert.equal((await expired.json()).accountId,null);
  setQueryForTests(async()=>{throw Error('database offline');});const unavailable=await GET(request());assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).error,'Identity service unavailable');
  setQueryForTests(async()=>[{owner_account:'alice.testnet'}]);const valid=await GET(request());assert.equal((await valid.json()).accountId,'alice.testnet');
 }finally{setQueryForTests();process.env=old;}
});
