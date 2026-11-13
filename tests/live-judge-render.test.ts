import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {createElement} from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import LiveJudgeTreasury from '../app/live-judge-treasury';
import {WALLET_CHANGED,type connectedAccount} from '../app/wallet-migration';

test('untrusted wallet callback does not update an intent or trigger signing',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,requests:string[]=[];
 const events=Object.assign(new EventTarget(),{location:{search:'?transactionHashes=11111111111111111111111111111111&errorCode=cancelled'}});
 Object.assign(globalThis,{window:events,React,IS_REACT_ACT_ENVIRONMENT:true});
 globalThis.fetch=async(url)=>{requests.push(String(url));return Response.json({accountId:null});};
 const connect=async()=>{throw Error('No wallet selected');};let renderer:ReactTestRenderer|undefined;
 try{await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect}));});assert.match(JSON.stringify(renderer!.toJSON()),/callback details are unverified/);assert.equal(requests.some(path=>/\/api\/judge\/(claim|update|reconcile)/.test(path)),false);}
 finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('wizard keeps payment details on refresh and blocks signing when eligibility is unavailable',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,events=new EventTarget();Object.assign(globalThis,{window:events,React,IS_REACT_ACT_ENVIRONMENT:true});
 let offline=false,enabled=true;const connect=async()=>({account:'owner.testnet',wallet:{}}) as Awaited<ReturnType<typeof connectedAccount>>;
 globalThis.fetch=async(url)=>{if(String(url)==='/api/auth/session'){if(offline)throw Error('offline');return Response.json({accountId:'owner.testnet'});}if(String(url)==='/api/judge/intents')return Response.json({owner:'owner.testnet',enabled,contract:'judge.testnet',intents:[]});return Response.json({result:{result:[...Buffer.from('[]')]}});};
 let renderer:ReactTestRenderer|undefined;try{await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect}));});const root=renderer!.root,button=(name:string)=>root.findAllByType('button').find(x=>x.children.join('').includes(name))!;
 const recipient=root.findAllByType('input').find(x=>x.props.placeholder==='vendor.testnet or implicit account')!;
 await act(async()=>recipient.props.onChange({target:{value:'vendor.testnet'}}));await act(async()=>{events.dispatchEvent(new Event('focus'));});assert.equal(recipient.props.value,'vendor.testnet');
 await act(async()=>button('Review payment').props.onClick());assert.match(JSON.stringify(renderer!.toJSON()),/Review your payment/);assert.equal(root.findAllByType('fieldset').length,0);
 await act(async()=>button('Continue to secure funds').props.onClick());await act(async()=>root.findAllByType('input').find(x=>x.props.type==='checkbox')!.props.onChange({target:{checked:true}}));assert.equal(button('Prepare wallet approval').props.disabled,false);
 offline=true;await act(async()=>{events.dispatchEvent(new Event('focus'));});assert.match(JSON.stringify(renderer!.toJSON()),/could not check your wallet/);assert.equal(button('Prepare wallet approval').props.disabled,true);
 offline=false;enabled=false;await act(async()=>{events.dispatchEvent(new Event('focus'));});assert.equal(button('Prepare wallet approval').props.disabled,true);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('account switch clears the saved review and pauses an old payment',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,events=new EventTarget();Object.assign(globalThis,{window:events,React,IS_REACT_ACT_ENVIRONMENT:true});let account='owner.testnet';
 const connect=async()=>({account,wallet:{}}) as Awaited<ReturnType<typeof connectedAccount>>;
 globalThis.fetch=async(url)=>String(url)==='/api/auth/session'?Response.json({accountId:account}):String(url)==='/api/judge/intents'?Response.json({owner:account,enabled:true,contract:'judge.testnet',intents:[]}):Response.json({result:{result:[...Buffer.from('[]')]}});
 let renderer:ReactTestRenderer|undefined;try{await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect}));});const root=renderer!.root,button=(name:string)=>root.findAllByType('button').find(x=>x.children.join('').includes(name))!;
 await act(async()=>root.findAllByType('input').find(x=>x.props.placeholder==='vendor.testnet or implicit account')!.props.onChange({target:{value:'vendor.testnet'}}));await act(async()=>button('Review payment').props.onClick());await act(async()=>button('Continue to secure funds').props.onClick());
 account='other.testnet';await act(async()=>{events.dispatchEvent(new Event(WALLET_CHANGED));});assert.match(JSON.stringify(renderer!.toJSON()),/Payment details/);assert.match(JSON.stringify(renderer!.toJSON()),/other.testnet/);
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
  await act(async()=>button('Review payment').props.onClick());
  await act(async()=>button('Continue to secure funds').props.onClick());
  await act(async()=>root.findAllByType('input').find(x=>x.props.type==='checkbox')!.props.onChange({target:{checked:true}}));
  const click=button('Prepare wallet approval').props.onClick;
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
  await act(async()=>renderer!.root.findAllByType('button').find(x=>x.children.join('').includes('Resume payment'))!.props.onClick());const output=JSON.stringify(renderer!.toJSON());assert.match(output,/Transaction needs verification/);assert.match(output,/Do not submit it again/);assert.equal(renderer!.root.findAllByType('button').some(x=>x.children.join('').includes('Prepare approval')),false);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('final approval invokes the wallet before any asynchronous work',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;Object.assign(globalThis,{window:new EventTarget(),React,IS_REACT_ACT_ENVIRONMENT:true});
 const events:string[]=[];let saved:unknown;
 const wallet={manifest:{id:'injected',features:{signAndSendTransaction:true}},signAndSendTransaction:()=>{events.push('wallet');return Promise.resolve({transaction:{hash:'11111111111111111111111111111111'}});}};
 const connect=async()=>({account:'owner.testnet',wallet}) as unknown as Awaited<ReturnType<typeof connectedAccount>>;
 globalThis.fetch=async(url,init)=>{const path=String(url);if(path==='/api/auth/session')return Response.json({accountId:'owner.testnet'});if(path==='/api/judge/intents')return Response.json({owner:'owner.testnet',enabled:true,contract:'judge.testnet',intents:[]});if(path==='/api/judge/claim'){events.push('claim');saved=JSON.parse(String(init?.body)).input;return Response.json({id:'intent',status:'AWAITING_SIGNATURE',action_input:saved});}if(path==='/api/judge/prepare'){events.push('prepare');return Response.json({id:'intent',owner:'owner.testnet',action_input:saved,expiresAt:Date.now()+59000,serverNow:Date.now()});}if(path==='/api/judge/update'){events.push('update');return Response.json({});}return Response.json({result:{result:[...Buffer.from('[]')]}});};
 let renderer:ReactTestRenderer|undefined;try{
  await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect}));});const root=renderer!.root,button=(name:string)=>root.findAllByType('button').find(x=>x.children.join('').includes(name))!;
  await act(async()=>root.findAllByType('input').find(x=>x.props.placeholder==='vendor.testnet or implicit account')!.props.onChange({target:{value:'vendor.testnet'}}));
  await act(async()=>button('Review payment').props.onClick());await act(async()=>button('Continue to secure funds').props.onClick());await act(async()=>root.findAllByType('input').find(x=>x.props.type==='checkbox')!.props.onChange({target:{checked:true}}));
  await act(async()=>{button('Prepare wallet approval').props.onClick();});assert.deepEqual(events,['claim','prepare']);
  await act(async()=>{button('Open wallet to approve').props.onClick();assert.deepEqual(events,['claim','prepare','wallet']);});assert.deepEqual(events,['claim','prepare','wallet','update']);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('window blur pauses an existing approval and rechecks it on focus without losing its claim',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,windowEvents=new EventTarget();Object.assign(globalThis,{window:windowEvents,React,IS_REACT_ACT_ENVIRONMENT:true});
 const events:string[]=[];let saved:unknown;
 const wallet={manifest:{id:'nightly',features:{signAndSendTransaction:true}},signAndSendTransaction:()=>{events.push('wallet');return Promise.resolve({transaction:{hash:'11111111111111111111111111111111'}});}};
 const connect=async()=>({account:'owner.testnet',wallet}) as unknown as Awaited<ReturnType<typeof connectedAccount>>;
 globalThis.fetch=async(url,init)=>{const path=String(url);if(path==='/api/auth/session')return Response.json({accountId:'owner.testnet'});if(path==='/api/judge/intents')return Response.json({owner:'owner.testnet',enabled:true,contract:'judge.testnet',intents:saved?[{id:'intent',status:'AWAITING_SIGNATURE',transaction_hash:null,action_input:saved}]:[]});if(path==='/api/judge/claim'){events.push('claim');saved=JSON.parse(String(init?.body)).input;return Response.json({id:'intent',status:'AWAITING_SIGNATURE',action_input:saved});}if(path==='/api/judge/prepare'){events.push('prepare');return Response.json({id:'intent',owner:'owner.testnet',action_input:saved,expiresAt:Date.now()+59000,serverNow:Date.now()});}if(path==='/api/judge/update'){events.push('update');return Response.json({});}return Response.json({result:{result:[...Buffer.from('[]')]}});};
 let renderer:ReactTestRenderer|undefined;try{
  await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect}));});const root=renderer!.root,button=(name:string)=>root.findAllByType('button').find(x=>x.children.join('').includes(name))!;
  await act(async()=>root.findAllByType('input').find(x=>x.props.placeholder==='vendor.testnet or implicit account')!.props.onChange({target:{value:'vendor.testnet'}}));
  await act(async()=>button('Review payment').props.onClick());await act(async()=>button('Continue to secure funds').props.onClick());await act(async()=>root.findAllByType('input').find(x=>x.props.type==='checkbox')!.props.onChange({target:{checked:true}}));
  await act(async()=>{button('Prepare wallet approval').props.onClick();});assert.deepEqual(events,['claim','prepare']);
  await act(async()=>{windowEvents.dispatchEvent(new Event('blur'));});assert.equal(button('Open wallet to approve').props.disabled,true);assert.doesNotMatch(JSON.stringify(renderer!.toJSON()),/approval window changed/);
  await act(async()=>{windowEvents.dispatchEvent(new Event('focus'));});assert.equal(button('Open wallet to approve').props.disabled,false);assert.deepEqual(events,['claim','prepare','prepare']);
  await act(async()=>{button('Open wallet to approve').props.onClick();});assert.deepEqual(events,['claim','prepare','prepare','wallet','update']);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('focus changes during claim trigger a recheck before approval becomes available',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,windowEvents=new EventTarget();Object.assign(globalThis,{window:windowEvents,React,IS_REACT_ACT_ENVIRONMENT:true});
 let release:((response:Response)=>void)|undefined,saved:unknown,preparations=0;
 const wallet={manifest:{id:'nightly',features:{signAndSendTransaction:true}},signAndSendTransaction:async()=>{throw Error('wallet must not open');}};
 const connect=async()=>({account:'owner.testnet',wallet}) as unknown as Awaited<ReturnType<typeof connectedAccount>>;
 globalThis.fetch=async(url,init)=>{const path=String(url);if(path==='/api/auth/session')return Response.json({accountId:'owner.testnet'});if(path==='/api/judge/intents')return Response.json({owner:'owner.testnet',enabled:true,contract:'judge.testnet',intents:[]});if(path==='/api/judge/claim'){saved=JSON.parse(String(init?.body)).input;return new Promise<Response>(resolve=>{release=resolve;});}if(path==='/api/judge/prepare'){preparations++;return Response.json({id:'intent',owner:'owner.testnet',action_input:saved,expiresAt:Date.now()+59000,serverNow:Date.now()});}return Response.json({result:{result:[...Buffer.from('[]')]}});};
 let renderer:ReactTestRenderer|undefined;try{
  await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect}));});const root=renderer!.root,button=(name:string)=>root.findAllByType('button').find(x=>x.children.join('').includes(name))!;
  await act(async()=>root.findAllByType('input').find(x=>x.props.placeholder==='vendor.testnet or implicit account')!.props.onChange({target:{value:'vendor.testnet'}}));
  await act(async()=>button('Review payment').props.onClick());await act(async()=>button('Continue to secure funds').props.onClick());await act(async()=>root.findAllByType('input').find(x=>x.props.type==='checkbox')!.props.onChange({target:{checked:true}}));
  await act(async()=>{button('Prepare wallet approval').props.onClick();await Promise.resolve();});
  await act(async()=>{windowEvents.dispatchEvent(new Event('blur'));windowEvents.dispatchEvent(new Event('focus'));});
  await act(async()=>{release!(Response.json({id:'intent',status:'AWAITING_SIGNATURE',action_input:saved}));});
  assert.equal(preparations,2);assert.equal(button('Open wallet to approve').props.disabled,false);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('V2 owner history restores contract state on refresh and maps payment IDs to requests',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,events=new EventTarget();
 Object.assign(globalThis,{window:events,React,IS_REACT_ACT_ENVIRONMENT:true});
 const input={operation:'create_request',contract:'v2.testnet',signer:'owner.testnet',requestId:'v2-jr-1',paymentId:'v2-jp-1',vendor:'vendor.testnet',amount:'100',expiryNs:'9999999999999999999',review:{title:'Purchase',expectedRevenue:'200'}};
 const connect=async()=>({account:'owner.testnet',wallet:{}}) as Awaited<ReturnType<typeof connectedAccount>>;
 let status='Funded',calls=0;
 globalThis.fetch=async(url,init)=>{
  if(String(url)==='/api/auth/session')return Response.json({accountId:'owner.testnet'});
  if(String(url)==='/api/judge/intents')return Response.json({owner:'owner.testnet',enabled:true,contract:'v2.testnet',intents:[{id:'created',status:'CONFIRMED',transaction_hash:null,action_input:input}]});
  const query=JSON.parse(String(init?.body));assert.equal(query.params.method_name,'get_payments_by_owner');assert.equal(query.params.finality,'final');calls++;
  return Response.json({result:{result:[...Buffer.from(JSON.stringify([[input.paymentId,{request_id:input.requestId,owner:input.signer,status,remaining:input.amount,expiry_ns:input.expiryNs}]]))]}});
 };
 let renderer:ReactTestRenderer|undefined;
 try{await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect}));});await act(async()=>renderer!.root.findAllByType('button').find(x=>x.children.join('').includes('Resume payment'))!.props.onClick());assert.match(JSON.stringify(renderer!.toJSON()),/Funds secured · awaiting authorization/);assert.ok(renderer!.root.findAllByType('button').some(x=>x.children.join('').includes('Prepare approval')));
 status='Authorized';await act(async()=>{events.dispatchEvent(new Event('focus'));});assert.match(JSON.stringify(renderer!.toJSON()),/Ready for execution/);assert.ok(renderer!.root.findAllByType('button').some(x=>x.children.join('').includes('Prepare transfer')));assert.ok(calls>=2);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('a receipt requires finalized completed state and a verified execution',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,events=new EventTarget();Object.assign(globalThis,{window:events,React,IS_REACT_ACT_ENVIRONMENT:true});
 const input={operation:'create_request',contract:'v2.testnet',signer:'owner.testnet',requestId:'v2-jr-1',paymentId:'v2-jp-1',vendor:'vendor.testnet',amount:'100',expiryNs:'9999999999999999999',review:{title:'Purchase',expectedRevenue:'200'}};
 let execution='UNKNOWN';const hash='11111111111111111111111111111111';const connect=async()=>({account:'owner.testnet',wallet:{}}) as Awaited<ReturnType<typeof connectedAccount>>;
 globalThis.fetch=async(url)=>{if(String(url)==='/api/auth/session')return Response.json({accountId:'owner.testnet'});if(String(url)==='/api/judge/intents')return Response.json({owner:'owner.testnet',enabled:true,contract:'v2.testnet',intents:[{id:'created',status:'CONFIRMED',transaction_hash:hash,action_input:input},{id:'sent',status:execution,transaction_hash:hash,action_input:{...input,operation:'execute'}}]});return Response.json({result:{result:[...Buffer.from(JSON.stringify([[input.paymentId,{request_id:input.requestId,owner:input.signer,status:'Completed',remaining:'0',expiry_ns:input.expiryNs}]]))]}});};
 let renderer:ReactTestRenderer|undefined;try{await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect,resumeId:input.requestId}));});let output=JSON.stringify(renderer!.toJSON());assert.match(output,/Settlement needs verification/);assert.doesNotMatch(output,/Payment verified/);assert.equal(renderer!.root.findAllByType('button').some(x=>x.children.join('').includes('Prepare transfer')),false);
 execution='CONFIRMED';await act(async()=>{events.dispatchEvent(new Event('focus'));});output=JSON.stringify(renderer!.toJSON());assert.match(output,/Payment verified/);assert.match(output,/View verified transaction/);
 }finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('hashless funded creation can recover from finalized contract state without a second submission',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;Object.assign(globalThis,{window:new EventTarget(),React,IS_REACT_ACT_ENVIRONMENT:true});
 const input={operation:'create_request',contract:'v2.testnet',signer:'owner.testnet',requestId:'v2-jr-1',paymentId:'v2-jp-1',vendor:'vendor.testnet',amount:'100',expiryNs:'9999999999999999999',review:{title:'Purchase',expectedRevenue:'200'}};let reconciles=0,claims=0;
 const connect=async()=>({account:'owner.testnet',wallet:{}}) as Awaited<ReturnType<typeof connectedAccount>>;
 globalThis.fetch=async(url)=>{if(String(url)==='/api/auth/session')return Response.json({accountId:'owner.testnet'});if(String(url)==='/api/judge/intents')return Response.json({owner:'owner.testnet',enabled:true,contract:'v2.testnet',intents:[{id:'pending',status:'UNKNOWN',transaction_hash:null,action_input:input}]});if(String(url)==='/api/judge/reconcile'){reconciles++;return Response.json({outcome:'UNKNOWN'});}if(String(url)==='/api/judge/claim'){claims++;return Response.json({});}return Response.json({result:{result:[...Buffer.from(JSON.stringify([[input.paymentId,{request_id:input.requestId,owner:input.signer,status:'Funded',remaining:input.amount,expiry_ns:input.expiryNs}]]))]}});};
 let renderer:ReactTestRenderer|undefined;try{await act(async()=>{renderer=create(createElement(LiveJudgeTreasury,{connect,resumeId:input.requestId}));});const button=renderer!.root.findAllByType('button').find(x=>x.children.join('').includes('Recover from contract state'));assert.ok(button);assert.equal(renderer!.root.findAllByType('button').some(x=>x.children.join('').includes('Prepare approval')),false);await act(async()=>button.props.onClick());assert.equal(reconciles,1);assert.equal(claims,0);assert.match(JSON.stringify(renderer!.toJSON()),/remains locked/);}finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});
