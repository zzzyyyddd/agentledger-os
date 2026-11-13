import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import Activity from '../app/activity';

test('activity searches finalized V2 records and opens the selected payment',async()=>{
 const oldFetch=globalThis.fetch;Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});let selected='';
 globalThis.fetch=async(url,init)=>{if(String(url)==='/api/judge/intents')return Response.json({owner:'owner.testnet',contract:'v2.testnet',intents:[]});const body=JSON.parse(String(init?.body));assert.equal(body.params.account_id,'v2.testnet');assert.equal(body.params.method_name,'get_payments_by_owner');assert.equal(body.params.finality,'final');const payments=[['v2-p1',{request_id:'v2-r1',owner:'owner.testnet',vendor:'alice.testnet',budget:'100',status:'Funded'}],['v2-p2',{request_id:'v2-r2',owner:'owner.testnet',vendor:'bob.testnet',budget:'100',status:'Completed'}]];return Response.json({result:{result:[...Buffer.from(JSON.stringify(payments))]}});};
 let renderer:ReactTestRenderer|undefined;try{await act(async()=>{renderer=create(React.createElement(Activity,{account:'owner.testnet',onResume:(id:string)=>{selected=id;}}));});assert.match(JSON.stringify(renderer!.toJSON()),/alice.testnet/);await act(async()=>renderer!.root.findByProps({placeholder:'Search payments'}).props.onChange({target:{value:'bob'}}));const output=JSON.stringify(renderer!.toJSON());assert.match(output,/bob.testnet/);assert.doesNotMatch(output,/alice.testnet/);await act(async()=>renderer!.root.findAllByType('button').find(x=>x.children.join('').includes('View'))!.props.onClick());assert.equal(selected,'v2-r2');}finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:false});}
});

test('activity links only finalized verified receipts, never unknown intents',async()=>{
 const oldFetch=globalThis.fetch;Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
 const hash='11111111111111111111111111111111';
 globalThis.fetch=async(url)=>String(url)==='/api/judge/intents'?Response.json({owner:'owner.testnet',contract:'v2.testnet',intents:[{id:'pending',status:'UNKNOWN',transaction_hash:hash,action_input:{requestId:'unknown',operation:'create_request'}},{status:'CONFIRMED',transaction_hash:hash,action_input:{requestId:'verified'}}]}):Response.json({result:{result:[...Buffer.from(JSON.stringify([['a',{request_id:'unknown',owner:'owner.testnet',vendor:'one.testnet',budget:'1',status:'Funded'}],['b',{request_id:'verified',owner:'owner.testnet',vendor:'two.testnet',budget:'1',status:'Completed'}]]))]}});
 let renderer:ReactTestRenderer|undefined;
 try{await act(async()=>{renderer=create(React.createElement(Activity,{account:'owner.testnet',onResume:()=>{}}));});assert.match(JSON.stringify(renderer!.toJSON()),/Needs verification/);const links=renderer!.root.findAllByType('a');assert.equal(links.length,1);assert.equal(links[0].props.href,`https://testnet.nearblocks.io/txns/${hash}`);}
 finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:false});}
});
