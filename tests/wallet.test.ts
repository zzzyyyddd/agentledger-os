import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {activeWalletAccount} from '../app/wallet';
test('wallet state chooses active account and handles disconnection',()=>{
 assert.equal(activeWalletAccount([]),null);
 assert.equal(activeWalletAccount([{accountId:'first.testnet',active:false},{accountId:'owner.testnet',active:true}]),'owner.testnet');
 assert.equal(activeWalletAccount([{accountId:'first.testnet',active:false}]),'first.testnet');
});

import {supportedWallets,isTestnetAccount,walletError} from '../app/wallet-selector';
test('wallet selection only offers approved Testnet sign-message providers',()=>{
 const wallet=(id:string,testnet=true,signMessage=true,signInWithoutAddKey=true)=>({manifest:{id,features:{testnet,signMessage,signInWithoutAddKey}}});
 assert.deepEqual(supportedWallets([wallet('mynearwallet'),wallet('hot-wallet',false),wallet('nightly-wallet'),wallet('meteor-wallet'),wallet('intear-wallet',true,false)]).map(w=>w.manifest.id),['meteor-wallet','nightly-wallet']);
 assert.equal(isTestnetAccount('alice.testnet'),true);assert.equal(isTestnetAccount('alice.near'),false);
 assert.match(walletError(Error('User rejected')),/cancelled/);assert.match(walletError(Error('not installed')),/Install/);assert.match(walletError(Error('network mismatch')),/Testnet/);
});
