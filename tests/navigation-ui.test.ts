import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import Home from '../app/home';

test('mobile navigation exposes its open state and closes after choosing a page',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;Object.assign(globalThis,{window:new EventTarget(),React,IS_REACT_ACT_ENVIRONMENT:true});globalThis.fetch=async()=>Response.json({accountId:null});let renderer:ReactTestRenderer|undefined;
 try{await act(async()=>{renderer=create(React.createElement(Home));});const root=renderer!.root,menu=()=>root.findByProps({'aria-controls':'main-navigation'});assert.equal(menu().props['aria-expanded'],false);await act(async()=>menu().props.onClick());assert.equal(menu().props['aria-expanded'],true);const activity=root.findByType('nav').findAllByType('button').find(x=>x.props.children[1]==='Activity')!;await act(async()=>activity.props.onClick());assert.equal(menu().props['aria-expanded'],false);assert.match(JSON.stringify(renderer!.toJSON()),/Payment history/);}finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});

test('settings shows known network and an unavailable contract without inventing configuration',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;Object.assign(globalThis,{window:new EventTarget(),React,IS_REACT_ACT_ENVIRONMENT:true});
 globalThis.fetch=async(url)=>String(url)==='/api/v2/config'?Response.json({error:'unavailable'},{status:503}):Response.json({accountId:null});
 let renderer:ReactTestRenderer|undefined;
 try{await act(async()=>{renderer=create(React.createElement(Home));});const settings=renderer!.root.findByType('nav').findAllByType('button').find(x=>x.props.children[1]==='Settings')!;await act(async()=>settings.props.onClick());const output=JSON.stringify(renderer!.toJSON());assert.match(output,/NEAR Testnet/);assert.match(output,/Unavailable/);assert.match(output,/Not connected/);assert.doesNotMatch(output,/DATABASE_URL|password|secret/i);}
 finally{if(renderer)await act(async()=>renderer!.unmount());globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow,IS_REACT_ACT_ENVIRONMENT:false});}
});
