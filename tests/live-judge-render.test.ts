import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {createElement} from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import LiveJudgeTreasury from '../app/live-judge-treasury';
import {WALLET_CHANGED,type connectedAccount} from '../app/wallet-selector';

test('treasury controls remain mounted through refresh, wallet changes and failures',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 const events=new EventTarget();Object.assign(globalThis,{window:events,React,IS_REACT_ACT_ENVIRONMENT:true});
 let session='owner.testnet',fail=false,release:(()=>void)|undefined;
 const connect=async()=>({account:session,wallet:{}}) as Awaited<ReturnType<typeof connectedAccount>>;
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url==='/api/auth/session'){if(release)await new Promise<void>(resolve=>{const ready=release!;release=()=>{ready();resolve();};});if(fail)throw Error('offline');return Response.json({accountId:session});}
  if(url==='/api/judge/intents')return Response.json({enabled:false,contract:'judge.testnet',intents:[]});
  return Response.json({result:{result:[...Buffer.from('[]')]}});
 };
 let renderer:ReactTestRenderer|undefined;
 try{
  await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect}));});
  const root=renderer!.root;
  const form=()=>root.findByType('fieldset');
  const input=()=>root.findAllByType('input').find(x=>x.props.value==='Testnet purchase')!;
  const headings=()=>root.findAllByType('h3').map(x=>x.children.join(''));
  assert.equal(form().props.disabled,false);const original=input();
  const recipient=()=>root.findAllByType('input').find(x=>x.props.placeholder==='vendor.testnet or implicit account')!;
  const button=(label:string)=>root.findAllByType('button').find(x=>x.children.join('').includes(label))!;
  assert.equal(button('Review live transaction').props.disabled,true);
  await act(async()=>recipient().props.onChange({target:{value:'invalid.near'}}));
  assert.equal(button('Review live transaction').props.disabled,true);
  await act(async()=>recipient().props.onChange({target:{value:'agentledger-vendor.testnet'}}));
  assert.equal(button('Review live transaction').props.disabled,false);
  await act(async()=>button('Review live transaction').props.onClick());
  const rendered=JSON.stringify(renderer!.toJSON());
  assert.match(rendered,/agentledger-vendor.testnet/);assert.match(rendered,/escrow 0.01 NEAR/);assert.match(rendered,/expected revenue 0.05 NEAR/);assert.match(rendered,/estimated margin 80%/);assert.doesNotMatch(rendered,/1200 NEAR/);
  assert.equal(button('Preview and fund').props.disabled,true); // payment gate remains disabled
  await act(async()=>recipient().props.onChange({target:{value:'other.testnet'}}));
  assert.doesNotMatch(JSON.stringify(renderer!.toJSON()),/Live advisory review/);
  await act(async()=>recipient().props.onChange({target:{value:'agentledger-vendor.testnet'}}));
  await act(async()=>button('Review live transaction').props.onClick());
  release=()=>{};
  await act(async()=>{events.dispatchEvent(new Event('focus'));await Promise.resolve();});
  assert.equal(form().props.disabled,true);assert.equal(input(),original);assert.ok(headings().includes('Durable transaction intents'));
  await act(async()=>{release!();release=undefined;});
  assert.equal(form().props.disabled,false);assert.equal(input(),original);assert.match(JSON.stringify(renderer!.toJSON()),/Live advisory review/);
  session='other.testnet';fail=true;
  await act(async()=>{events.dispatchEvent(new Event(WALLET_CHANGED));});
  assert.equal(form().props.disabled,true);assert.equal(input(),original);assert.ok(headings().includes('Finalized contract requests'));
  assert.equal(button('Preview and fund').props.disabled,true);
  fail=false;await act(async()=>{events.dispatchEvent(new Event(WALLET_CHANGED));});
  assert.equal(form().props.disabled,false);assert.doesNotMatch(JSON.stringify(renderer!.toJSON()),/Live advisory review/);assert.equal(button('Preview and fund').props.disabled,true);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});
