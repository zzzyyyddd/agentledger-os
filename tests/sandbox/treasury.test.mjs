import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'near-workspaces';

const ONE=10n**24n, GAS=250_000_000_000_000n;
test('sandbox: initialization, storage reserve, escrow, settlement, failed callback and refund', {timeout:180000}, async()=>{
 const worker=await Worker.init();
 try {
  const root=worker.rootAccount;
  const owner=await root.createSubAccount('owner');
  const vendor=await root.createSubAccount('vendor');
  const treasury=await root.devDeploy('contract/target/wasm32-unknown-unknown/release/agentledger_treasury.wasm');
  await assert.rejects(owner.call(treasury,'new',{owner:owner.accountId,operator:owner.accountId}));
  await treasury.call(treasury,'new',{owner:owner.accountId,operator:owner.accountId});
  assert.deepEqual(await treasury.view('get_roles'),[owner.accountId,owner.accountId]);
  await owner.call(treasury,'set_vendor',{vendor:vendor.accountId,allowed:true});
  const expiry_ns=(BigInt(Date.now()+86400000)*1000000n).toString();
  await owner.call(treasury,'create_request',{request_id:'success',expiry_ns},{attachedDeposit:ONE});
  assert.equal(await treasury.view('get_liabilities'),'1000000000000000000000000');
  await owner.call(treasury,'authorize',{request_id:'success',payment_id:'p-success',vendor:vendor.accountId,amount:(ONE/2n).toString()});
  await owner.call(treasury,'execute',{request_id:'success'},{gas:GAS});
  assert.equal((await treasury.view('get_request',{request_id:'success'})).status,'Completed');
  assert.equal(await treasury.view('get_liabilities'),(ONE/2n).toString());
  await owner.call(treasury,'refund',{request_id:'success'},{gas:GAS});
  assert.equal((await treasury.view('get_request',{request_id:'success'})).status,'Refunded');
  assert.equal(await treasury.view('get_liabilities'),'0');
  const missing=`missing.${root.accountId}`;
  await owner.call(treasury,'set_vendor',{vendor:missing,allowed:true});
  await owner.call(treasury,'create_request',{request_id:'failure',expiry_ns},{attachedDeposit:ONE});
  await owner.call(treasury,'authorize',{request_id:'failure',payment_id:'p-failure',vendor:missing,amount:(ONE/2n).toString()});
  await owner.call(treasury,'execute',{request_id:'failure'},{gas:GAS});
  const failed=await treasury.view('get_request',{request_id:'failure'});
  assert.equal(failed.status,'Failed');assert.equal(failed.remaining,ONE.toString());
  assert.equal(await treasury.view('get_liabilities'),ONE.toString());
  await owner.call(treasury,'refund',{request_id:'failure'},{gas:GAS});
  assert.equal((await treasury.view('get_request',{request_id:'failure'})).status,'Refunded');
  assert.equal(await treasury.view('get_liabilities'),'0');
 } finally {await worker.tearDown();}
});
