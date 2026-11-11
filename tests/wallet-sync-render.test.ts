import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import WalletConnection from '../app/wallet';
import type {readWalletIdentity} from '../app/wallet-identity';

test('30-second wallet sync preserves verified identity on transient failure and clears it on expiry',async()=>{
 const oldWindow=globalThis.window,oldInterval=globalThis.setInterval,oldClear=globalThis.clearInterval;
 let resolveOld:((value:Awaited<ReturnType<typeof readWalletIdentity>>)=>void)|undefined,hold=false;
 let tick:(()=>void)|undefined,delay=0,mode:'verified'|'failure'|'expired'='verified';const changes:string[]=[];
 Object.assign(globalThis,{window:new EventTarget(),React,IS_REACT_ACT_ENVIRONMENT:true,setInterval:(fn:()=>void,ms:number)=>{tick=fn;delay=ms;return 1;},clearInterval:()=>{}});
 const readIdentity:typeof readWalletIdentity=async()=>{if(hold){hold=false;return new Promise(resolve=>{resolveOld=resolve;});}if(mode==='failure')throw Error('offline');return {account:'alice.testnet',verified:mode==='verified',configured:true,signingEnabled:false};};
 let renderer:ReactTestRenderer|undefined;
 try{
  await act(async()=>{renderer=create(React.createElement(WalletConnection,{readIdentity,onIdentityChange:(account,verified)=>changes.push(`${account}:${verified}`)}));});
  assert.equal(delay,30000);assert.match(JSON.stringify(renderer!.toJSON()),/alice.testnet · Verified/);
  hold=true;await act(async()=>{tick!();});await act(async()=>{tick!();});
  await act(async()=>{resolveOld!({account:'alice.testnet',verified:false,configured:true,signingEnabled:false});});
  assert.equal(changes.at(-1),'alice.testnet:true');
  mode='failure';await act(async()=>{tick!();});
  assert.match(JSON.stringify(renderer!.toJSON()),/Verification unavailable/);assert.equal(changes.at(-1),'alice.testnet:true');
  mode='verified';await act(async()=>{tick!();});assert.match(JSON.stringify(renderer!.toJSON()),/alice.testnet · Verified/);
  mode='expired';await act(async()=>{tick!();});assert.match(JSON.stringify(renderer!.toJSON()),/alice.testnet · Wallet/);assert.equal(changes.at(-1),'alice.testnet:false');
 }finally{if(renderer)await act(async()=>renderer!.unmount());Object.assign(globalThis,{window:oldWindow,setInterval:oldInterval,clearInterval:oldClear,IS_REACT_ACT_ENVIRONMENT:false});}
});
