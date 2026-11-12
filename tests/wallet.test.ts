import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {supportedWallets,isTestnetAccount,walletError,resolveAccount} from '../app/near-wallet';

test('wallet selection uses capabilities, not wallet names',()=>{
 const wallet=(id:string,testnet=true,signMessage=true,signInWithoutAddKey=true)=>({manifest:{id,features:{testnet,signMessage,signInWithoutAddKey}}});
 assert.deepEqual(supportedWallets([wallet('any-wallet'),wallet('offline',false),wallet('no-message',true,false)]).map(w=>w.manifest.id),['any-wallet']);
 assert.equal(isTestnetAccount('alice.testnet'),true);assert.equal(isTestnetAccount('alice.near'),false);
 assert.match(walletError(Error('User rejected')),/cancelled/);
});
test('account selection is bound to the wallet and must still be available',()=>{
 const accounts=[{accountId:'alice.testnet'},{accountId:'bob.testnet'}];
 assert.equal(resolveAccount('one',accounts,null),'alice.testnet');
 assert.equal(resolveAccount('one',accounts,JSON.stringify({walletId:'one',account:'bob.testnet'})),'bob.testnet');
 assert.equal(resolveAccount('two',accounts,JSON.stringify({walletId:'one',account:'bob.testnet'})),'alice.testnet');
 assert.throws(()=>resolveAccount('one',accounts,JSON.stringify({walletId:'one',account:'removed.testnet'})),/no longer available/);
 assert.throws(()=>resolveAccount('one',[{accountId:'alice.near'}],null),/Testnet/);
});
