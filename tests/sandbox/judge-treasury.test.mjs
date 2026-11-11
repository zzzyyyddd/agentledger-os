import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'near-workspaces';

const ONE=10n**24n, FEE=3n*ONE/100n, AMOUNT=ONE/100n, GAS=100_000_000_000_000n;
test('judge treasury: separate owners, callbacks, refunds and replay', {timeout:240000}, async()=>{
 const worker=await Worker.init({network:'sandbox',rm:true});
 try{
  const root=worker.rootAccount,alice=await root.createSubAccount('alice'),bob=await root.createSubAccount('bob'),vendor=await root.createSubAccount('vendor');
  const contract=await root.devDeploy('contract/target/wasm32-unknown-unknown/release/agentledger_judge_treasury.wasm');
  await contract.call(contract,'new',{});
  const expiry_ns=String(BigInt(Date.now()+3600000)*1000000n);
  const create=(request_id,recipient=vendor.accountId)=>({request_id,expiry_ns,vendor:recipient,budget:String(AMOUNT)});
  const auth=(request_id,payment_id,recipient=vendor.accountId)=>({request_id,payment_id,vendor:recipient,amount:String(AMOUNT)});
  const request=request_id=>contract.view('get_request',{request_id});
  await alice.call(contract,'create_request',create('alice'),{attachedDeposit:FEE+AMOUNT,gas:GAS});
  await bob.call(contract,'create_request',create('bob'),{attachedDeposit:FEE+AMOUNT,gas:GAS});
  assert.equal((await request('alice')).owner,alice.accountId);
  const recovered=await contract.view('get_owner_requests',{owner:alice.accountId,from:0,limit:50});
  assert.equal(recovered.length,1);assert.equal(recovered[0][0],'alice');assert.equal(recovered[0][1].owner,alice.accountId);
  await assert.rejects(bob.call(contract,'authorize',auth('alice','p1')));
  await assert.rejects(bob.call(contract,'refund',{request_id:'alice'},{gas:GAS}));
  await alice.call(contract,'authorize',auth('alice','p1'),{gas:GAS});
  await assert.rejects(bob.call(contract,'execute',{request_id:'alice'},{gas:GAS}));
  await assert.rejects(bob.call(contract,'authorize',auth('bob','p1')));
  const before=BigInt((await vendor.balance()).total);
  const settled=await alice.callRaw(contract,'execute',{request_id:'alice'},{gas:GAS});
  assert.equal(settled.parseResult(),true);assert.equal(settled.receiptFailures.length,0);
  assert.equal(BigInt((await vendor.balance()).total)-before,AMOUNT);
  assert.equal((await request('alice')).status,'Completed');assert.equal((await request('alice')).remaining,'0');
  await assert.rejects(alice.call(contract,'execute',{request_id:'alice'},{gas:GAS}));
  const refunded=await bob.callRaw(contract,'refund',{request_id:'bob'},{gas:GAS});
  assert.equal(refunded.parseResult(),true);assert.equal((await request('bob')).status,'Refunded');
  await assert.rejects(bob.call(contract,'refund',{request_id:'bob'},{gas:GAS}));
  const missing=`missing.${root.accountId}`;
  await alice.call(contract,'create_request',create('failure',missing),{attachedDeposit:FEE+AMOUNT,gas:GAS});
  await alice.call(contract,'authorize',auth('failure','p-failure',missing),{gas:GAS});
  const failed=await alice.callRaw(contract,'execute',{request_id:'failure'},{gas:GAS});
  assert.equal(failed.parseResult(),false);assert(failed.receiptFailures.length>0);
  assert.equal((await request('failure')).status,'Failed');assert.equal((await request('failure')).remaining,String(AMOUNT));
  assert.equal(await contract.view('get_liabilities'),String(AMOUNT));
  await alice.call(contract,'refund',{request_id:'failure'},{gas:GAS});
  assert.equal(await contract.view('get_liabilities'),'0');
  await assert.rejects(alice.call(contract,'create_request',{...create('expired'),expiry_ns:'1'},{attachedDeposit:FEE+AMOUNT,gas:GAS}));
 }finally{await worker.tearDown();}
});
