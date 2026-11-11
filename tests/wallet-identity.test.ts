import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readWalletIdentity,verifyWalletIdentity} from '../app/wallet-identity';

type Deps=NonNullable<Parameters<typeof readWalletIdentity>[0]>;
function fixture(){
 let selected='alice.testnet',session:string|null=null,signCalls=0;let reject=false;const requests:string[]=[];
 const wallet={manifest:{features:{signMessage:true}},async signMessage(input:{nonce:Uint8Array;signerId:string}){signCalls++;assert.equal(input.nonce.length,32);if(reject)throw Error('User rejected');return {accountId:input.signerId,publicKey:'test-key',signature:'test-signature'};}};
 const request:typeof fetch=async(input,init)=>{const path=String(input);requests.push(path);if(path==='/api/auth/session')return Response.json({configured:true,accountId:session,signingEnabled:false});if(path==='/api/auth/challenge')return Response.json({id:'challenge',message:'message',recipient:'localhost',nonce:Buffer.alloc(32,1).toString('base64url')});if(path==='/api/auth/verify'){const body=JSON.parse(String(init?.body));assert.equal(body.accountId,'alice.testnet');session=body.accountId;return Response.json({accountId:session});}if(path==='/api/auth/logout'){session=null;return Response.json({ok:true});}throw Error('Unexpected request');};
 const deps={connect:async()=>({account:selected,wallet}),request} as unknown as Deps;
 return {deps,requests,setAccount:(v:string)=>{selected=v;},setSession:(v:string|null)=>{session=v;},setReject:()=>{reject=true;},getSignCalls:()=>signCalls,getSession:()=>session};
}

test('connected wallet requires explicit verification and shows only matching server session',async()=>{
 const f=fixture();let state=await readWalletIdentity(f.deps);assert.equal(state.account,'alice.testnet');assert.equal(state.verified,false);assert.equal(f.getSignCalls(),0);
 assert.equal(await verifyWalletIdentity(f.deps),'alice.testnet');assert.equal(f.getSignCalls(),1);state=await readWalletIdentity(f.deps);assert.equal(state.verified,true);assert.equal(state.signingEnabled,false);
 f.setSession(null);assert.equal((await readWalletIdentity(f.deps)).verified,false);
});

test('account switch revokes the old session and stale refresh cannot log out a new session',async()=>{
 const f=fixture();f.setSession('alice.testnet');f.setAccount('bob.testnet');const result=await readWalletIdentity(f.deps);assert.equal(result.verified,false);assert.equal(f.getSession(),null);assert(f.requests.includes('/api/auth/logout'));
 f.setSession('alice.testnet');await readWalletIdentity(f.deps,()=>false);assert.equal(f.getSession(),'alice.testnet');
});

test('rejected signature never submits verification',async()=>{
 const f=fixture();f.setReject();await assert.rejects(verifyWalletIdentity(f.deps),/rejected/);assert.equal(f.requests.includes('/api/auth/verify'),false);assert.equal(f.getSession(),null);
});

test('switching accounts during verification revokes the newly issued session',async()=>{
 const f=fixture();const original=f.deps.request;f.deps.request=async(input,init)=>{const response=await original(input,init);if(String(input)==='/api/auth/verify')f.setAccount('bob.testnet');return response;};
 await assert.rejects(verifyWalletIdentity(f.deps),/account changed/);assert.equal(f.getSession(),null);assert(f.requests.includes('/api/auth/logout'));
});

test('a disconnected wallet revokes its session but transient connector errors preserve it',async()=>{
 const f=fixture();f.setSession('alice.testnet');f.deps.connect=async()=>{throw Error('Temporary network failure');};await assert.rejects(readWalletIdentity(f.deps),/network failure/);assert.equal(f.getSession(),'alice.testnet');
 f.deps.connect=async()=>{throw Error('No wallet selected');};assert.equal((await readWalletIdentity(f.deps)).verified,false);assert.equal(f.getSession(),null);
});
