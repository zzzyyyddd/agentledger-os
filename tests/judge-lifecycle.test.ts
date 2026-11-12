import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {intentLabel,paymentActions,paymentStage} from '../app/live-judge-treasury';

test('payment activity distinguishes pending, verified and uncertain outcomes',()=>{
 assert.equal(intentLabel('AWAITING_SIGNATURE'),'Awaiting wallet approval');
 assert.equal(intentLabel('SUBMITTED'),'Submitted · pending verification');
 assert.equal(intentLabel('UNKNOWN'),'Transaction status needs verification');
 assert.equal(intentLabel('CONFIRMED'),'Confirmed');assert.equal(intentLabel('FAILED'),'Failed');
});
test('available actions follow finalized contract state and ownership',()=>{
 const base={owner:'alice.testnet',status:'Funded',remaining:'1',expiry_ns:'9999999999999999999'};
 assert.deepEqual(paymentActions(base,'alice.testnet',0),['authorize','refund']);
 assert.deepEqual(paymentActions({...base,status:'Authorized'},'alice.testnet',0),['execute','refund']);
 assert.deepEqual(paymentActions({...base,status:'Pending'},'alice.testnet',0),[]);
 assert.deepEqual(paymentActions({...base,status:'Completed',remaining:'0'},'alice.testnet',0),[]);
 assert.deepEqual(paymentActions(base,'bob.testnet',0),[]);
 assert.deepEqual(paymentActions({...base,expiry_ns:'1'},'alice.testnet',1),['refund']);
 assert.match(paymentStage('Funded'),/awaiting authorization/);
 assert.match(paymentStage('Completed'),/verify the transaction/);
});

test('Prism journey never marks escrow funding as a completed payment',async()=>{
 const {journeyProgress}=await import('../app/payment-journey');
 const row=(operation:'create_request'|'authorize'|'execute',status:string)=>({status,action_input:{operation,requestId:'request'}});
 assert.deepEqual(journeyProgress([row('create_request','CONFIRMED')],'request'),{secured:true,authorized:false,paid:false,attention:false});
 assert.deepEqual(journeyProgress([row('create_request','CONFIRMED'),row('authorize','UNKNOWN')],'request'),{secured:true,authorized:false,paid:false,attention:true});
 assert.deepEqual(journeyProgress([row('create_request','CONFIRMED'),row('authorize','CONFIRMED'),row('execute','CONFIRMED')],'request'),{secured:true,authorized:true,paid:true,attention:false});
 assert.equal(journeyProgress([row('execute','CONFIRMED')],'different').paid,false);
});
