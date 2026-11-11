import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {KeyPairEd25519} from '@near-js/crypto';
import {setQueryForTests} from '../lib/server/database';
import {authDigest} from '../lib/server/auth';
import {POST as verify} from '../app/api/auth/verify/route';

test('a signed browser-bound challenge can issue only one session',async()=>{
 const oldFetch=globalThis.fetch,old={...process.env};Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'postgresql://user:pass@localhost/test',APP_ORIGIN:'http://localhost:3000'});const key=KeyPairEd25519.fromRandom(),nonce=Buffer.alloc(32,12).toString('base64url');const signature=Buffer.from(key.sign(authDigest(nonce,'localhost:3000','http://localhost:3000/')).signature).toString('base64');let used=false,sessions=0;
 globalThis.fetch=async ()=>Response.json({result:{permission:'FullAccess'}});
 setQueryForTests(async sql=>{if(sql.startsWith('SELECT nonce'))return used?[]:[{nonce}];if(sql.includes('consume_wallet_challenge')){if(used)return [];used=true;return [{nonce}];}if(sql.startsWith('INSERT INTO public.wallet_sessions')){sessions++;return [];}throw Error('Unexpected query');});
 const attempt=()=>new Request('http://localhost:3000/api/auth/verify',{method:'POST',headers:{origin:'http://localhost:3000',cookie:'al_challenge=browser','content-type':'application/json'},body:JSON.stringify({id:'00000000-0000-4000-8000-000000000001',accountId:'owner.testnet',publicKey:key.publicKey.toString(),signature})});try{assert.equal((await verify(attempt())).status,200);assert.equal((await verify(attempt())).status,400);assert.equal(sessions,1);}finally{setQueryForTests();globalThis.fetch=oldFetch;process.env=old;}
});
