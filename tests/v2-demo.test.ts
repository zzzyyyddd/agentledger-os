import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {createHash} from 'node:crypto';
import {DemoContent} from '../app/v2/demo/v2-demo';
import {POST as verify} from '../app/api/v2/demo/verify/route';
import {digest,setQueryForTests} from '../lib/server/database';

test('demo renders disabled payments and keeps UNKNOWN unresolved without signing',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,requests:string[]=[];
 Object.assign(globalThis,{window:new EventTarget(),React,IS_REACT_ACT_ENVIRONMENT:true});
 const input={operation:'create_request',contract:'v2.testnet',signer:'alice.testnet',requestId:'v2-jr-1',paymentId:'v2-jp-1',vendor:'vendor.testnet',amount:'100',expiryNs:'2000000000000000000',review:{title:'Purchase',expectedRevenue:'200'}};
 globalThis.fetch=async(url)=>{const path=String(url);requests.push(path);if(path==='/api/v2/config')return Response.json({contract:'v2.testnet'});if(path==='/api/judge/intents')return Response.json({owner:'alice.testnet',contract:'v2.testnet',enabled:false,intents:[{id:'one',status:'UNKNOWN',transaction_hash:null,action_input:input}]});if(path==='/api/v2/demo/verify')return Response.json({outcome:'UNKNOWN',hash:null});return Response.json({result:{result:[...Buffer.from('[]')]}});};
 let renderer:ReactTestRenderer|undefined;
 try{
  await act(async()=>{renderer=create(React.createElement(DemoContent,{account:'alice.testnet'}));});
  assert.match(JSON.stringify(renderer!.toJSON()),/Payment signing is disabled/);
  await act(async()=>renderer!.root.findAllByType('button').find(x=>x.children.join('').includes('Verify on Testnet'))!.props.onClick());
  assert.match(JSON.stringify(renderer!.toJSON()),/Unresolved/);
  assert.equal(renderer!.root.findAllByType('a').some(x=>String(x.props.href).includes('/txns/')),false);
  assert.equal(requests.some(x=>/\/api\/judge\/(claim|prepare|update|reconcile)/.test(x)),false);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('read-only verification scopes the intent to the session owner and never writes',async()=>{
 const old={...process.env},oldFetch=globalThis.fetch,code=Buffer.from('v2-demo-code'),id='00000000-0000-4000-8000-000000000001';let writes=0;
 Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'postgresql://localhost/test',APP_ORIGIN:'http://localhost:3000',V2_TREASURY_CONTRACT_ID:'v2.testnet',V2_TREASURY_WASM_SHA256:createHash('sha256').update(code).digest('hex'),V2_PAYMENTS_ENABLED:'false',PAYMENTS_ENABLED:'false'});
 const input={operation:'execute',contract:'v2.testnet',signer:'alice.testnet',requestId:'v2-jr-1',paymentId:'v2-jp-1',vendor:'vendor.testnet',amount:'100',expiryNs:'2000000000000000000',review:{title:'Purchase',expectedRevenue:'200'}};
 setQueryForTests(async(sql,p)=>{if(!/^SELECT/i.test(sql.trim()))writes++;if(sql.includes('wallet_sessions'))return [{owner_account:p[0]===digest('alice')?'alice.testnet':'bob.testnet'}];if(sql.includes('payment_intents'))return p[1]==='alice.testnet'?[{id,owner_account:'alice.testnet',status:'UNKNOWN',version:1,transaction_hash:null,action_input:input}]:[];throw Error('unexpected query');});
 globalThis.fetch=async(_url,init)=>{const q=JSON.parse(String(init?.body));return q.method==='status'?Response.json({result:{chain_id:'testnet'}}):Response.json({result:{code_base64:code.toString('base64')}});};
 const req=(token:string)=>new Request('http://localhost:3000/api/v2/demo/verify',{method:'POST',headers:{origin:'http://localhost:3000',cookie:`al_v2_session=${token}`,'content-type':'application/json'},body:JSON.stringify({id})});
 try{const own=await verify(req('alice'));assert.equal(own.status,200);assert.equal((await own.json()).outcome,'UNKNOWN');assert.equal((await verify(req('bob'))).status,400);assert.equal(writes,0);}finally{setQueryForTests();globalThis.fetch=oldFetch;process.env=old;}
});
