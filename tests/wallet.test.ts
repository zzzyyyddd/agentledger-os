import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {activeWalletAccount} from '../app/wallet';
test('wallet state chooses active account and handles disconnection',()=>{
 assert.equal(activeWalletAccount([]),null);
 assert.equal(activeWalletAccount([{accountId:'first.testnet',active:false},{accountId:'owner.testnet',active:true}]),'owner.testnet');
 assert.equal(activeWalletAccount([{accountId:'first.testnet',active:false}]),'first.testnet');
});

import {supportedWallets,nightlyStatus,isTestnetAccount,walletError} from '../app/wallet-selector';
test('wallet selection only offers approved Testnet sign-message providers',()=>{
 const wallet=(id:string,testnet=true,signMessage=true,signInWithoutAddKey=true,signAndSendTransaction=true)=>({manifest:{id,features:{testnet,signMessage,signInWithoutAddKey,signAndSendTransaction}}});
 assert.deepEqual(supportedWallets([wallet('mynearwallet'),wallet('hot-wallet',false),wallet('nightly-wallet'),wallet('meteor-wallet'),wallet('intear-wallet',true,false)]).map(w=>w.manifest.id),['nightly-wallet','meteor-wallet']);
 assert.equal(isTestnetAccount('alice.testnet'),true);assert.equal(isTestnetAccount('alice.near'),false);
 assert.match(walletError(Error('User rejected')),/cancelled/);assert.match(walletError(Error('not installed')),/Install/);assert.match(walletError(Error('network mismatch')),/Testnet/);
});

test('Nightly extension detection requires its provider and advertised Testnet, NEP-413 and transaction capabilities',()=>{
 const features={testnet:true,signMessage:true,signInWithoutAddKey:true,signAndSendTransaction:true};
 const wallet={manifest:{id:'nightly-wallet',features}};
 const near={connect(){},isConnected(){},account(){},signMessage(){},signTransaction(){}};
 assert.equal(nightlyStatus([wallet],{nightly:{near}}),'ready');
 assert.equal(nightlyStatus([wallet],{}),'not-detected');
 assert.equal(nightlyStatus([wallet],{nightly:{near:{...near,signTransaction:undefined}}}),'not-detected');
 for(const key of Object.keys(features) as (keyof typeof features)[]){const w={manifest:{...wallet.manifest,features:{...features,[key]:false}}};assert.equal(nightlyStatus([w],{nightly:{near}}),'unsupported');assert.equal(supportedWallets([w]).length,0);}
 assert.equal(nightlyStatus([],{nightly:{near}}),'unsupported');
});
