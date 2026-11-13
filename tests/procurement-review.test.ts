import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import Home from '../app/home';
import LiveJudgeTreasury from '../app/live-judge-treasury';

test('wallet-free business demo reviews, approves, settles and records only simulated activity',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,requests:string[]=[];
 Object.assign(globalThis,{window:new EventTarget(),React,IS_REACT_ACT_ENVIRONMENT:true});
 globalThis.fetch=async(input)=>{requests.push(String(input));return Response.json({matches:false});};
 let renderer:ReactTestRenderer|undefined;try{
  await act(async()=>{renderer=create(React.createElement(Home));});
  const root=renderer!.root;const button=(name:string)=>root.findAllByType('button').find(x=>x.children.join('').includes(name))!;
  await act(async()=>button('Explore Interactive Demo').props.onClick());
  assert.equal(root.findAllByType(LiveJudgeTreasury).length,0);assert.match(JSON.stringify(renderer!.toJSON()),/No wallet required/);
  await act(async()=>button('Run procurement review').props.onClick());
  let output=JSON.stringify(renderer!.toJSON());assert.match(output,/Northstar Cloud/);assert.match(output,/RECOMMENDED/);assert.match(output,/CFO financial assessment/);assert.match(output,/rule-based/);
  await act(async()=>button('Prepare demo payment').props.onClick());
  await act(async()=>button('Simulate approval').props.onClick());
  assert.equal(button('Simulate payment').props.disabled,false);
  await act(async()=>button('Simulate payment').props.onClick());
  output=JSON.stringify(renderer!.toJSON());assert.match(output,/Demo payment completed/);assert.match(output,/No funds moved/);
  await act(async()=>button('View demo audit trail').props.onClick());
  output=JSON.stringify(renderer!.toJSON());assert.match(output,/Demo audit trail/);assert.match(output,/Demo payment completed/);assert.match(output,/Verified Live Payment/);
  assert.equal(requests.some(path=>/\/api\/(judge|intents|auth\/challenge)/.test(path)),false);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('judge guide separates the wallet-free demo from real test payments',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;Object.assign(globalThis,{window:new EventTarget(),React,IS_REACT_ACT_ENVIRONMENT:true});globalThis.fetch=async()=>Response.json({matches:false});
 let renderer:ReactTestRenderer|undefined;try{await act(async()=>{renderer=create(React.createElement(Home));});const guide=renderer!.root.findAllByType('button').find(x=>x.children.join('').includes('Judge guide'))!;await act(async()=>guide.props.onClick());const output=JSON.stringify(renderer!.toJSON());assert.match(output,/No wallet is needed/);assert.match(output,/Try a real Testnet payment/);assert.match(output,/verify your identity/);}finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});
