import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {KeyPairEd25519} from '@near-js/crypto';
import {serializeNep413} from '@near-wallet-selector/core';
import {decodeChallengeNonce} from '../lib/challenge-nonce';
import {setQueryForTests} from '../lib/server/database';
import {POST as challengeRoute} from '../app/api/auth/challenge/route';
import {POST as verifyRoute} from '../app/api/auth/verify/route';

const require=createRequire(import.meta.url);
test('browser nonce decoding handles base64url without unsupported Buffer encoding',()=>{
 const browserBuffer=require('next/dist/compiled/buffer').Buffer;
 const bytes=Buffer.from([0xfb,0xff,0xef,...Array(29).fill(42)]);
 const nonce=bytes.toString('base64url');
 assert.match(nonce,/[-_]/);
 assert.throws(()=>browserBuffer.from(nonce,'base64url'),/Unknown encoding: base64url/);
 assert.deepEqual(decodeChallengeNonce(nonce),new Uint8Array(bytes));
 for(const bad of ['',nonce+'=',nonce.slice(1),nonce.replace('-','+')])assert.throws(()=>decodeChallengeNonce(bad),/Invalid wallet challenge/);
});

test('browser-compatible nonce authenticates a wallet signature and rejects invalid, expired, replayed and wrong-owner attempts',async()=>{
 const old={...process.env},oldFetch=globalThis.fetch;
 Object.assign(process.env,{NODE_ENV:'test',V2_DATABASE_URL:'postgresql://test:dummy@ep-quiet-math-a1y04117.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full',APP_ORIGIN:'http://localhost:3000'});
 const key=KeyPairEd25519.fromRandom();const owner='owner.testnet';const id='00000000-0000-4000-8000-000000000001';
 let stored:{nonce:string;browser:string;expires:string}|undefined,used=false,expired=false,sessions=0;
 setQueryForTests(async(sql,params)=>{
  if(sql.startsWith('INSERT INTO agentledger_v2.wallet_challenges')){stored={nonce:String(params[0]),browser:String(params[1]),expires:String(params[2])};used=false;expired=false;return [{id}];}
  if(sql.startsWith('SELECT nonce'))return stored&&!used&&!expired&&params[0]===id&&params[1]===stored.browser&&Date.parse(stored.expires)>Date.now()?[{nonce:stored.nonce}]:[];
  if(sql.includes('consume_wallet_challenge')){if(!stored||used||expired||params[0]!==id||params[1]!==stored.browser)return [];used=true;return [{nonce:stored.nonce}];}
  if(sql.startsWith('INSERT INTO agentledger_v2.wallet_sessions')){sessions++;return [];}
  throw Error('Unexpected SQL');
 });
 globalThis.fetch=async(_url,init)=>{const q=JSON.parse(String(init?.body));return q.params.account_id===owner&&q.params.public_key===key.publicKey.toString()?Response.json({result:{permission:'FullAccess'}}):Response.json({error:{name:'UNKNOWN_ACCESS_KEY'}});};
 const newChallenge=async()=>{const res=await challengeRoute(new Request('http://localhost:3000/api/auth/challenge',{method:'POST',headers:{origin:'http://localhost:3000'}}));assert.equal(res.status,200);return {data:await res.json(),cookie:res.headers.get('set-cookie')!.split(';')[0]};};
 const verify=async(cookie:string,accountId:string,signature:string)=>verifyRoute(new Request('http://localhost:3000/api/auth/verify',{method:'POST',headers:{origin:'http://localhost:3000',cookie,'content-type':'application/json'},body:JSON.stringify({id,accountId,publicKey:key.publicKey.toString(),signature})}));
 try{
  const {data,cookie}=await newChallenge();const nonce=decodeChallengeNonce(data.nonce);assert.equal(nonce.length,32);
  // The wallet signs the standard NEP-413 payload without an optional callback URL.
  const payload=serializeNep413({message:data.message,recipient:data.recipient,nonce:Buffer.from(nonce)});
  const signature=Buffer.from(key.sign(createHash('sha256').update(payload).digest()).signature).toString('base64');
  assert.equal((await verify(cookie,owner,Buffer.alloc(64).toString('base64'))).status,400);
  assert.equal((await verify(cookie,'attacker.testnet',signature)).status,400);
  assert.equal((await verify('al_v2_challenge=wrong',owner,signature)).status,400);
  assert.equal((await verify(cookie,owner,signature)).status,200);
  assert.equal((await verify(cookie,owner,signature)).status,400);
  const next=await newChallenge();expired=true;assert.equal((await verify(next.cookie,owner,signature)).status,400);
  assert.equal(sessions,1);
 }finally{setQueryForTests();globalThis.fetch=oldFetch;process.env=old;}
});
