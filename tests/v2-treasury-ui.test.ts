import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import V2TreasurySummary from '../app/v2-treasury-summary';

test('treasury shows finalized values and never invents balances on failure',async()=>{
 const old=globalThis.fetch;Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});let fail=false;
 globalThis.fetch=async(url,init)=>{
  if(String(url)==='/api/v2/config')return Response.json({contract:'agentledger-v2.agentledger-owner.testnet'});
  if(fail)throw Error('offline');
  const request=JSON.parse(String(init?.body));assert.equal(request.params.finality,'final');assert.equal(request.params.account_id,'agentledger-v2.agentledger-owner.testnet');
  return request.params.request_type==='view_account'?Response.json({result:{amount:'1000000000000000000000000'}}):Response.json({result:{result:[...Buffer.from(JSON.stringify('500000000000000000000000'))]}});
 };
 let renderer:ReactTestRenderer|undefined;
 try{
  await act(async()=>{renderer=create(React.createElement(V2TreasurySummary));});let output=JSON.stringify(renderer!.toJSON());assert.match(output,/"1"," NEAR"/);assert.match(output,/"0.5"," NEAR"/);assert.match(output,/not your wallet balance/);
  await act(async()=>renderer!.unmount());renderer=undefined;fail=true;
  await act(async()=>{renderer=create(React.createElement(V2TreasurySummary));});output=JSON.stringify(renderer!.toJSON());assert.match(output,/data is unavailable/);assert.doesNotMatch(output,/"1"," NEAR"|"0.5"," NEAR"/);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=old;Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:false});}
});
