import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import WalletConnection from '../app/wallet';
import {WALLET_CHANGED} from '../app/wallet-migration';
import type {IdentityState} from '../app/wallet-identity';

test('verification availability follows server configuration, wallet capability and account state',async()=>{
 const oldWindow=globalThis.window;const events=new EventTarget();Object.assign(globalThis,{window:events,React,IS_REACT_ACT_ENVIRONMENT:true});
 let state:IdentityState={account:'heavyseal6539.testnet',verified:false,configured:false,signingEnabled:false,messageSigningSupported:true};
 let verifyCalls=0;const changes:string[]=[];
 const readIdentity=async()=>({...state});
 const verifyIdentity=async()=>{verifyCalls++;state={...state,verified:true};return state.account!;};
 let renderer:ReactTestRenderer|undefined;
 try{
  await act(async()=>{renderer=create(React.createElement(WalletConnection,{readIdentity,verifyIdentity,onIdentityChange:(account,verified)=>changes.push(`${account}:${verified}`)}));});
  const button=()=>renderer!.root.findAllByType('button').find(b=>b.children.join('').includes('Verify identity'))!;
  assert.equal(button().props.disabled,true);assert.match(JSON.stringify(renderer!.toJSON()),/Identity service is not configured/);
  state={...state,configured:true,messageSigningSupported:false};await act(async()=>{events.dispatchEvent(new Event(WALLET_CHANGED));});
  assert.equal(button().props.disabled,true);assert.match(JSON.stringify(renderer!.toJSON()),/does not support NEP-413/);assert.match(JSON.stringify(renderer!.toJSON()),/Switch wallet/);
  state={...state,messageSigningSupported:true};await act(async()=>{events.dispatchEvent(new Event(WALLET_CHANGED));});
  assert.equal(button().props.disabled,false);await act(async()=>button().props.onClick());assert.equal(verifyCalls,1);assert.equal(changes.at(-1),'heavyseal6539.testnet:true');assert.match(JSON.stringify(renderer!.toJSON()),/wallet-verified/);
  state={...state,account:'other.testnet',verified:false};await act(async()=>{events.dispatchEvent(new Event(WALLET_CHANGED));});
  assert.equal(changes.at(-1),'other.testnet:false');assert.equal(button().props.disabled,false);
 }finally{if(renderer)await act(async()=>renderer!.unmount());Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('wallet header truncates and copies the full address without implying verification',async()=>{
 const oldWindow=globalThis.window,original=Object.getOwnPropertyDescriptor(globalThis,'navigator');const events=new EventTarget();let copied='';
 Object.assign(globalThis,{window:events,React,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async(value:string)=>{copied=value;}}}});
 const account='heavyseal6539.testnet',readIdentity=async():Promise<IdentityState>=>({account,verified:false,configured:true,signingEnabled:false,messageSigningSupported:true});let renderer:ReactTestRenderer|undefined;
 try{await act(async()=>{renderer=create(React.createElement(WalletConnection,{readIdentity}));});const summary=renderer!.root.findByType('summary');assert.equal(summary.props.title,account);assert.match(summary.findAllByType('span').map(x=>x.children.join('')).join(' '),/heavys…estnet/);assert.doesNotMatch(summary.findAllByType('span').map(x=>x.children.join('')).join(' '),/Verified/);const copy=renderer!.root.findAllByType('button').find(x=>x.children.join('')==='Copy address')!;await act(async()=>copy.props.onClick());assert.equal(copied,account);assert.ok(renderer!.root.findAllByType('button').some(x=>x.children.join('')==='Switch wallet'));assert.ok(renderer!.root.findAllByType('button').some(x=>x.children.join('')==='Disconnect'));}
 finally{if(renderer)await act(async()=>renderer!.unmount());if(original)Object.defineProperty(globalThis,'navigator',original);else Reflect.deleteProperty(globalThis,'navigator');Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});
