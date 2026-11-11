import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {activeWalletAccount} from '../app/wallet';
test('wallet state chooses active account and handles disconnection',()=>{
 assert.equal(activeWalletAccount([]),null);
 assert.equal(activeWalletAccount([{accountId:'first.testnet',active:false},{accountId:'owner.testnet',active:true}]),'owner.testnet');
 assert.equal(activeWalletAccount([{accountId:'first.testnet',active:false}]),'first.testnet');
});
