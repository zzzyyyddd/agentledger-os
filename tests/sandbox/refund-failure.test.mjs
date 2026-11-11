import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'near-workspaces';

const ONE=10n**24n, GAS=250_000_000_000_000n;
test('sandbox: failed refund receipt restores funds and permits exactly one recovery refund', {timeout:180000}, async()=>{
 const worker=await Worker.init({network:'sandbox',rm:true});
 try {
  const root=worker.rootAccount;
  const owner=await root.createSubAccount('refundowner');
  const ownerId=owner.accountId;
  await owner.deploy('tests/sandbox/refund-owner/target/near/sandbox_refund_owner.wasm');
  const treasury=await root.devDeploy('contract/target/near/agentledger_treasury.wasm');
  await treasury.call(treasury,'new',{owner:ownerId,operator:root.accountId});
  const expiry_ns=String(BigInt(Date.now()+86400000)*1000000n);
  await owner.call(treasury,'create_request',{request_id:'refund-failure',expiry_ns},{attachedDeposit:ONE});
  const request=()=>treasury.view('get_request',{request_id:'refund-failure'});
  const liabilities=()=>treasury.view('get_liabilities');
  assert.equal(await liabilities(),String(ONE));
  assert.equal((await request()).remaining,String(ONE));
  const before=BigInt((await treasury.balance()).total);
  const result=await owner.callRaw(owner,'delete_then_refund',{treasury:treasury.accountId,beneficiary:root.accountId,request_id:'refund-failure'},{gas:GAS});
  assert.equal(result.parseResult(),false);
  const receipts=result.result.receipts_outcome;
  assert(receipts.some(r=>r.outcome.executor_id===ownerId && r.outcome.status.Failure), 'refund transfer to deleted owner must fail');
  assert(receipts.some(r=>r.outcome.executor_id===treasury.accountId && r.outcome.status.SuccessValue===Buffer.from('false').toString('base64')), 'treasury failure callback must return false');
  assert.equal(await owner.exists(),false);
  const after=BigInt((await treasury.balance()).total);
  assert(after>=before, 'failed transfer must not reduce the treasury balance');
  assert.equal((await request()).status,'Failed');
  assert.equal((await request()).remaining,String(ONE));
  assert.equal(await liabilities(),String(ONE));
  // Recreate the disposable local owner solely to exercise the contract's normal retry path.
  const recoveredOwner=await root.createSubAccount('refundowner');
  const ownerBefore=BigInt((await recoveredOwner.balance()).total);
  const retry=await recoveredOwner.callRaw(treasury,'refund',{request_id:'refund-failure'},{gas:GAS});
  assert.equal(retry.parseResult(),true);
  assert.equal(retry.receiptFailures.length,0);
  assert.equal((await request()).status,'Refunded');
  assert.equal((await request()).remaining,'0');
  assert.equal(await liabilities(),'0');
  const ownerAfter=BigInt((await recoveredOwner.balance()).total);
  assert(retry.result.receipts_outcome.some(r=>r.outcome.executor_id===ownerId && r.outcome.status.SuccessValue!==undefined), 'refund transfer receipt must succeed');
  // The RPC may return before unused prepaid gas is credited back to the signer.
  assert(ownerAfter>ownerBefore+ONE/2n && ownerAfter<=ownerBefore+ONE, 'owner balance reflects one refund less prepaid gas');
  await assert.rejects(recoveredOwner.call(treasury,'refund',{request_id:'refund-failure'},{gas:GAS}),/invalid status/);
  assert.equal((await request()).remaining,'0');
  assert.equal(await liabilities(),'0');
 } finally {await worker.tearDown();}
});
