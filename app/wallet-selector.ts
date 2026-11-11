import type {WalletSelector} from '@near-wallet-selector/core';
let selector:Promise<WalletSelector>|undefined;
export function getSelector(){
 if(!selector)selector=Promise.all([import('@near-wallet-selector/core'),import('@near-wallet-selector/my-near-wallet')]).then(([core,wallet])=>core.setupWalletSelector({network:'testnet',modules:[wallet.setupMyNearWallet()]})).catch(e=>{selector=undefined;throw e});
 return selector;
}
