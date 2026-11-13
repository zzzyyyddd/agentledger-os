import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {KeyPairEd25519} from '@near-js/crypto';
import {setQueryForTests} from '../lib/server/database';
import {authDigest} from '../lib/server/auth';
import {POST as verify} from '../app/api/auth/verify/route';

test('a signed browser-bound challenge can issue only one session',async()=>{
 const oldFetch=globalThis.fetch,old={...process.env};Object.assign(process.env,{NODE_ENV:'test',V2_DATABASE_URL:'postgresql://test:dummy@ep-quiet-math-a1y04117.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full',APP_ORIGIN:'http://localhost:3000'});const key=KeyPairEd25519.fromRandom(),nonce=Buffer.alloc(32,12).toString('base64url');const signature=Buffer.from(key.sign(authDigest(nonce,'localhost:3000','http://localhost:3000/')).signature).toString('base64');let used=false,sessions=0;
 globalThis.fetch=async ()=>Response.json({result:{permission:'FullAccess'}});
 setQueryForTests(async sql=>{if(sql.startsWith('SELECT nonce'))return used?[]:[{nonce}];if(sql.includes('consume_wallet_challenge')){if(used)return [];used=true;return [{nonce}];}if(sql.startsWith('INSERT INTO agentledger_v2.wallet_sessions')){sessions++;return [];}throw Error('Unexpected query');});
 const attempt=()=>new Request('http://localhost:3000/api/auth/verify',{method:'POST',headers:{origin:'http://localhost:3000',cookie:'al_v2_challenge=browser','content-type':'application/json'},body:JSON.stringify({id:'00000000-0000-4000-8000-000000000001',accountId:'owner.testnet',publicKey:key.publicKey.toString(),signature})});try{assert.equal((await verify(attempt())).status,200);assert.equal((await verify(attempt())).status,400);assert.equal(sessions,1);}finally{setQueryForTests();globalThis.fetch=oldFetch;process.env=old;}
});

test('disconnect invalidates the current session and clears its cookie',async()=>{
 const {POST:logout}=await import('../app/api/auth/logout/route');const old={...process.env};Object.assign(process.env,{NODE_ENV:'test',V2_DATABASE_URL:'postgresql://test:dummy@ep-quiet-math-a1y04117.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full',APP_ORIGIN:'http://localhost:3000'});let deleted=false;
 setQueryForTests(async(sql,params)=>{assert.match(sql,/DELETE FROM agentledger_v2.wallet_sessions/);assert.notEqual(params[0],'secret-token');deleted=true;return [];});
 try{const response=await logout(new Request('http://localhost:3000/api/auth/logout',{method:'POST',headers:{origin:'http://localhost:3000',cookie:'al_v2_session=secret-token'}}));assert.equal(response.status,200);assert.equal(deleted,true);assert.match(response.headers.get('set-cookie')||'',/Max-Age=0/);}finally{setQueryForTests();process.env=old;}
});
