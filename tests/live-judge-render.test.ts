import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {createElement} from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import LiveJudgeTreasury from '../app/live-judge-treasury';
import {WALLET_CHANGED,type connectedAccount} from '../app/near-wallet';

test('treasury controls remain mounted through refresh, wallet changes and failures',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 const events=new EventTarget();Object.assign(globalThis,{window:events,React,IS_REACT_ACT_ENVIRONMENT:true});
 let session='owner.testnet',fail=false,release:(()=>void)|undefined;
 const connect=async()=>({account:session,wallet:{}}) as Awaited<ReturnType<typeof connectedAccount>>;
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url==='/api/auth/session'){if(release)await new Promise<void>(resolve=>{const ready=release!;release=()=>{ready();resolve();};});if(fail)throw Error('offline');return Response.json({accountId:session});}
  if(url==='/api/judge/intents')return Response.json({owner:session,enabled:false,contract:'judge.testnet',intents:[]});
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
  assert.equal(form().props.disabled,false);assert.equal(input(),original);assert.ok(headings().includes('Payment activity'));
  await act(async()=>{release!();release=undefined;});
  assert.equal(form().props.disabled,false);assert.equal(input(),original);assert.match(JSON.stringify(renderer!.toJSON()),/Live advisory review/);
  session='other.testnet';fail=true;
  await act(async()=>{events.dispatchEvent(new Event(WALLET_CHANGED));});
  assert.equal(form().props.disabled,false);assert.equal(input(),original);assert.ok(headings().includes('Payment activity'));assert.match(JSON.stringify(renderer!.toJSON()),/Unable to refresh wallet eligibility/);
  assert.equal(button('Preview and fund').props.disabled,true);
  fail=false;await act(async()=>{events.dispatchEvent(new Event(WALLET_CHANGED));});
  assert.equal(form().props.disabled,false);assert.doesNotMatch(JSON.stringify(renderer!.toJSON()),/Live advisory review/);assert.equal(button('Preview and fund').props.disabled,true);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('eligibility survives overlapping refreshes, but failures, expiry and disconnect fail closed',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 const events=new EventTarget();Object.assign(globalThis,{window:events,React,IS_REACT_ACT_ENVIRONMENT:true});
 let session:string|null='owner.testnet',disconnected=false,offline=false,enabled=true;let intents:unknown[]=[];
 let pending:((response:Response)=>void)|undefined,hold=false;
 const connect=async()=>{if(disconnected)throw Error('No wallet selected');return {account:'owner.testnet',wallet:{}} as Awaited<ReturnType<typeof connectedAccount>>;};
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url==='/api/auth/session'){
   if(hold){hold=false;return new Promise<Response>(resolve=>{pending=resolve;});}
   if(offline)throw Error('offline');return Response.json({accountId:session});
  }
  if(url==='/api/judge/intents')return Response.json({owner:'owner.testnet',enabled,contract:'judge.testnet',intents});
  return Response.json({result:{result:[...Buffer.from('[]')]}});
 };
 let renderer:ReactTestRenderer|undefined;
 try{
  await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect}));});
  const root=renderer!.root,button=(label:string)=>root.findAllByType('button').find(x=>x.children.join('').includes(label))!;
  const recipient=root.findAllByType('input').find(x=>x.props.placeholder==='vendor.testnet or implicit account')!;
  await act(async()=>recipient.props.onChange({target:{value:'agentledger-vendor.testnet'}}));
  await act(async()=>button('Review live transaction').props.onClick());
  const checkbox=root.findAllByType('input').find(x=>x.props.type==='checkbox')!;
  assert.match(JSON.stringify(renderer!.toJSON()),/Confirm the Guardian review checkbox/);
  await act(async()=>checkbox.props.onChange({target:{checked:true}}));
  assert.equal(button('Preview and fund').props.disabled,false);
  hold=true;await act(async()=>{events.dispatchEvent(new Event('focus'));await Promise.resolve();});
  assert.equal(button('Preview and fund').props.disabled,false);
  await act(async()=>{events.dispatchEvent(new Event('focus'));});
  await act(async()=>{pending!(Response.json({accountId:null}));});
  assert.equal(button('Preview and fund').props.disabled,false);
  for(let i=0;i<3;i++)await act(async()=>{events.dispatchEvent(new Event('focus'));});
  assert.match(JSON.stringify(renderer!.toJSON()),/Verified account: owner.testnet/);
  offline=true;await act(async()=>{events.dispatchEvent(new Event('focus'));});
  assert.match(JSON.stringify(renderer!.toJSON()),/Unable to refresh wallet eligibility/);
  assert.match(JSON.stringify(renderer!.toJSON()),/Live advisory review/);assert.equal(button('Review live transaction').props.disabled,false);assert.equal(button('Preview and fund').props.disabled,true);
  offline=false;hold=true;await act(async()=>{events.dispatchEvent(new Event('focus'));await Promise.resolve();});assert.equal(button('Preview and fund').props.disabled,true);
  await act(async()=>{pending!(Response.json({accountId:'owner.testnet'}));});assert.equal(button('Preview and fund').props.disabled,false);
  intents=[{id:'pending',status:'UNKNOWN',transaction_hash:null,action_input:{operation:'create_request',requestId:'request'}}];
  await act(async()=>{events.dispatchEvent(new Event('focus'));});assert.equal(button('Preview and fund').props.disabled,true);assert.match(JSON.stringify(renderer!.toJSON()),/previous transaction needs verification/);
  intents=[];enabled=false;await act(async()=>{events.dispatchEvent(new Event('focus'));});assert.match(JSON.stringify(renderer!.toJSON()),/New transactions are disabled/);assert.equal(button('Preview and fund').props.disabled,true);
  session=null;await act(async()=>{events.dispatchEvent(new Event('focus'));});assert.match(JSON.stringify(renderer!.toJSON()),/session expired/);assert.equal(root.findByType('fieldset').props.disabled,true);
  session='owner.testnet';enabled=true;await act(async()=>{events.dispatchEvent(new Event('focus'));});assert.equal(button('Preview and fund').props.disabled,true);
  disconnected=true;await act(async()=>{events.dispatchEvent(new Event(WALLET_CHANGED));});assert.match(JSON.stringify(renderer!.toJSON()),/Wallet disconnected/);assert.equal(root.findByType('fieldset').props.disabled,true);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('repeated funding clicks in one render issue only one claim',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 Object.assign(globalThis,{window:new EventTarget(),React,IS_REACT_ACT_ENVIRONMENT:true});
 let claims=0,release:((response:Response)=>void)|undefined;
 const wallet={manifest:{id:'test-wallet',features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{throw Error('must not hand off after failed claim');}};
 const connect=async()=>({account:'owner.testnet',wallet}) as unknown as Awaited<ReturnType<typeof connectedAccount>>;
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url==='/api/auth/session')return Response.json({accountId:'owner.testnet'});
  if(url==='/api/judge/intents')return Response.json({owner:'owner.testnet',enabled:true,contract:'judge.testnet',intents:[]});
  if(url==='/api/judge/claim'){claims++;return new Promise<Response>(resolve=>{release=resolve;});}
  return Response.json({result:{result:[...Buffer.from('[]')]}});
 };
 let renderer:ReactTestRenderer|undefined;
 try{
  await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect}));});
  const root=renderer!.root,button=(label:string)=>root.findAllByType('button').find(x=>x.children.join('').includes(label))!;
  const recipient=root.findAllByType('input').find(x=>x.props.placeholder==='vendor.testnet or implicit account')!;
  await act(async()=>recipient.props.onChange({target:{value:'vendor.testnet'}}));
  await act(async()=>button('Review live transaction').props.onClick());
  await act(async()=>root.findAllByType('input').find(x=>x.props.type==='checkbox')!.props.onChange({target:{checked:true}}));
  const click=button('Preview and fund').props.onClick;
  await act(async()=>{click();click();await Promise.resolve();});
  assert.equal(claims,1);
  await act(async()=>{release!(Response.json({error:'timeout'},{status:400}));});
  assert.match(JSON.stringify(renderer!.toJSON()),/claim may still be processing/);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('an unresolved approval stays locked even when finalized contract still shows secured funds',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 Object.assign(globalThis,{window:new EventTarget(),React,IS_REACT_ACT_ENVIRONMENT:true});
 const input={operation:'create_request',contract:'judge.testnet',signer:'owner.testnet',requestId:'jr-1',paymentId:'jp-1',vendor:'vendor.testnet',amount:'10000000000000000000000',expiryNs:'9999999999999999999',review:{title:'Purchase',expectedRevenue:'50000000000000000000000'}};
 const connect=async()=>({account:'owner.testnet',wallet:{}}) as Awaited<ReturnType<typeof connectedAccount>>;
 globalThis.fetch=async(url)=>{
  if(String(url)==='/api/auth/session')return Response.json({accountId:'owner.testnet'});
  if(String(url)==='/api/judge/intents')return Response.json({owner:'owner.testnet',enabled:true,contract:'judge.testnet',intents:[{id:'approval',status:'UNKNOWN',transaction_hash:null,action_input:{...input,operation:'authorize'}},{id:'funded',status:'CONFIRMED',transaction_hash:'11111111111111111111111111111111',action_input:input}]});
  return Response.json({result:{result:[...Buffer.from(JSON.stringify([['jr-1',{owner:'owner.testnet',status:'Funded',remaining:input.amount,expiry_ns:input.expiryNs}]]))]}});
 };
 let renderer:ReactTestRenderer|undefined;
 try{
  await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect}));});
  const output=JSON.stringify(renderer!.toJSON());assert.match(output,/Transaction status needs verification/);assert.match(output,/popup that did not open does not prove/);
  const approve=renderer!.root.findAllByType('button').find(x=>x.children.join('').includes('Approve payment'));assert.ok(approve);assert.equal(approve.props.disabled,true);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});
