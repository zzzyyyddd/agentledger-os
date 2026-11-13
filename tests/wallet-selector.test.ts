import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import type {WalletSelector} from '@near-wallet-selector/core';
import {connectedSelectorAccount} from '../app/wallet-migration';
import {prepareJudgeAction,type JudgeInput} from '../lib/judge-payment';

const input:JudgeInput={operation:'create_request',contract:'judge.testnet',signer:'alice.testnet',requestId:'jr-1',paymentId:'jp-1',vendor:'vendor.testnet',amount:'10000000000000000000000',expiryNs:'1999999999000000000',review:{title:'Purchase',expectedRevenue:'50000000000000000000000'}};
function fixture(){
 let selectedWalletId='meteor-wallet',active='alice.testnet';const calls:ReturnType<typeof prepareJudgeAction>[]=[];
 const wallet={id:'meteor-wallet',type:'injected',getAccounts:async()=>[{accountId:'alice.testnet'}],signMessage:async()=>({accountId:'alice.testnet',publicKey:'key',signature:'signature'}),signAndSendTransaction:(action:ReturnType<typeof prepareJudgeAction>)=>{calls.push(action);return Promise.resolve({transaction:{hash:'11111111111111111111111111111111'}});}};
 const selector={store:{getState:()=>({selectedWalletId,accounts:[{accountId:active,active:true}]})},wallet:async()=>wallet} as unknown as WalletSelector;
 return {selector,calls,switchAccount:()=>{active='bob.testnet';},switchWallet:()=>{selectedWalletId='nightly';}};
}
test('selector forwards all four transaction actions with exact signer and deposit',async()=>{
 const f=fixture(),connection=await connectedSelectorAccount(f.selector);
 for(const operation of ['create_request','authorize','execute','refund'] as const){const action=prepareJudgeAction({...input,operation});await connection.wallet.signAndSendTransaction(action);assert.equal(f.calls.at(-1),action);assert.equal(action.signerId,'alice.testnet');assert.equal(action.actions[0].functionCall?.methodName,operation);assert.equal(action.actions[0].functionCall?.deposit,operation==='create_request'?40000000000000000000000n:0n);}
});
test('account or wallet switch blocks the captured signer before wallet invocation',async()=>{
 for(const change of ['account','wallet'] as const){const f=fixture(),connection=await connectedSelectorAccount(f.selector);if(change==='account')f.switchAccount();else f.switchWallet();assert.throws(()=>connection.wallet.signAndSendTransaction(prepareJudgeAction(input)),/account changed/);assert.equal(f.calls.length,0);}
});
