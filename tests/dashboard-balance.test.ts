import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import DashboardOverview from '../app/dashboard-overview';

test('wallet balance is read-only and represents loading, success, error and disconnect',async()=>{
 const oldFetch=globalThis.fetch;Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});let resolve:((value:Response)=>void)|undefined,requests=0;
 globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://test.rpc.fastnear.com');requests++;const body=JSON.parse(String(init?.body));assert.equal(body.method,'query');assert.equal(body.params.request_type,'view_account');assert.equal(body.params.account_id,'alice.testnet');assert.equal(body.params.finality,'final');return new Promise<Response>(done=>{resolve=done;});};
 let renderer:ReactTestRenderer|undefined;
 try{
  await act(async()=>{renderer=create(React.createElement(DashboardOverview,{account:null,walletAccount:'alice.testnet',onPayments:()=>{}}));});assert.match(JSON.stringify(renderer!.toJSON()),/Loading…/);
  await act(async()=>resolve!(Response.json({result:{amount:'3498000000000000000000000'}})));assert.match(JSON.stringify(renderer!.toJSON()),/3.4980 NEAR/);assert.equal(requests,1);
  await act(async()=>renderer!.update(React.createElement(DashboardOverview,{account:null,walletAccount:null,onPayments:()=>{}})));assert.match(JSON.stringify(renderer!.toJSON()),/Connect a wallet/);assert.doesNotMatch(JSON.stringify(renderer!.toJSON()),/3.4980/);
  globalThis.fetch=async()=>{throw Error('offline');};await act(async()=>renderer!.update(React.createElement(DashboardOverview,{account:null,walletAccount:'alice.testnet',onPayments:()=>{}})));assert.match(JSON.stringify(renderer!.toJSON()),/Could not load wallet balance/);assert.doesNotMatch(JSON.stringify(renderer!.toJSON()),/3.4980/);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:false});}
});

test('partial counts are marked and limits appear in expandable details',async()=>{
 const oldFetch=globalThis.fetch;Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
 globalThis.fetch=async(url)=>String(url)==='/api/judge/intents'?Response.json({owner:'alice.testnet',contract:'treasury.testnet',intents:Array.from({length:100},()=>({status:'UNKNOWN'}))}):Response.json({result:{result:[...Buffer.from(JSON.stringify(Array.from({length:50},(_,i)=>[`p${i}`,{owner:'alice.testnet',status:'Funded'}])))]}});
 let renderer:ReactTestRenderer|undefined;try{await act(async()=>{renderer=create(React.createElement(DashboardOverview,{account:'alice.testnet',walletAccount:null,onPayments:()=>{},onActivity:()=>{}}));});const output=JSON.stringify(renderer!.toJSON());assert.match(output,/≥50/);assert.match(output,/≥100/);const details=renderer!.root.findByType('details');assert.match(details.findByType('p').children.join(''),/first 50/);assert.match(JSON.stringify(renderer!.toJSON()),/View activity/);}finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:false});}
});
