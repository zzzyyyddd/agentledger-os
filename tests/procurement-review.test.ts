import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import Home from '../app/page';
import WalletConnection from '../app/wallet';

test('verified user starts the sandbox explicitly before the demo review; switching accounts resets it',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 Object.assign(globalThis,{window:new EventTarget(),React,IS_REACT_ACT_ENVIRONMENT:true});
 globalThis.fetch=async(input)=>Response.json(String(input).startsWith('/api/')?{configured:true,accountId:null}:{wallets:[]});
 let renderer:ReactTestRenderer|undefined;
 try{
  await act(async()=>{renderer=create(React.createElement(Home));});
  const root=renderer!.root;
  const button=(name:string)=>root.findAllByType('button').find(x=>x.children.some(c=>typeof c==='string'&&c.includes(name)))!;
  await act(async()=>button('Procurement').props.onClick());
  assert.equal(button('Run agent review').props.disabled,true);
  await act(async()=>root.findByType(WalletConnection).props.onIdentityChange('alice.testnet',true));
  assert.equal(button('Run agent review').props.disabled,true);
  await act(async()=>button('Start Judge Demo').props.onClick());
  assert.equal(button('Run agent review').props.disabled,false);
  await act(async()=>button('Run agent review').props.onClick());
  assert.match(JSON.stringify(renderer!.toJSON()),/REVIEWED|Procurement Agent/);
  await act(async()=>root.findByType(WalletConnection).props.onIdentityChange('bob.testnet',true));
  assert.equal(button('Run agent review').props.disabled,true);
  assert.match(JSON.stringify(renderer!.toJSON()),/AWAITING REVIEW/);
  await act(async()=>root.findByType(WalletConnection).props.onIdentityChange(null,false));
  assert.equal(button('Run agent review').props.disabled,true);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});
