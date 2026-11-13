import {Buffer} from 'buffer';
import type {WalletSelector} from '@near-wallet-selector/core';
import type {prepareAction} from '@/lib/payment';
import type {prepareJudgeAction} from '@/lib/judge-payment';
import {isTestnetAccountId} from '@/lib/near-account';

export const WALLET_CHANGED='agentledger:wallet-changed';
type Action=ReturnType<typeof prepareAction>|ReturnType<typeof prepareJudgeAction>;
type Wallet={manifest:{id:string;features:{signMessage:boolean;signAndSendTransaction:boolean}};signMessage:(input:{message:string;recipient:string;nonce:Uint8Array;network:string;signerId:string})=>Promise<{accountId:string;publicKey:string;signature:string}|undefined>;signAndSendTransaction:(action:Action)=>Promise<{transaction?:{hash?:string}}|void>};
let instance:Promise<WalletSelector>|undefined;
export function getSelector():Promise<WalletSelector>{
 if(!instance)instance=Promise.all([import('@near-wallet-selector/core'),import('@near-wallet-selector/nightly'),import('@near-wallet-selector/sender')]).then(async([core,nightly,sender])=>{
  const selector=await core.setupWalletSelector({network:'testnet',modules:[nightly.setupNightly(),sender.setupSender()]});
  let previous='';selector.store.observable.subscribe(state=>{const current=JSON.stringify([state.selectedWalletId,state.accounts]);if(previous&&current!==previous&&typeof window!=='undefined')window.dispatchEvent(new Event(WALLET_CHANGED));previous=current;});
  return selector;
 }).catch(error=>{instance=undefined;throw error;});
 return instance;
}
export async function connectedAccount():Promise<{account:string;wallet:Wallet;accounts:string[]}>{
 return connectedSelectorAccount(await getSelector());
}
export async function connectedSelectorAccount(selector:WalletSelector):Promise<{account:string;wallet:Wallet;accounts:string[]}>{
 const state=selector.store.getState();
 if(!state.selectedWalletId)throw Error('No wallet selected');
 const selected=await selector.wallet();
 if(selected.type!=='injected'||!['nightly','sender'].includes(selected.id))throw Error('Wallet is not supported');
 const accounts=(await selected.getAccounts()).map(a=>a.accountId);
 // These extension modules sign with the account selected in the wallet itself.
 const account=accounts[0];if(!account||!isTestnetAccountId(account))throw Error('Switch your wallet to NEAR Testnet');
 if(!state.accounts.some(a=>a.accountId===account))throw Error('Wallet account changed; reconnect and verify');
 const stillSelected=()=>{const current=selector.store.getState();return current.selectedWalletId===selected.id&&current.accounts.some(a=>a.accountId===account&&a.active);};
 if(!stillSelected())throw Error('Wallet account changed; reconnect and verify');
 const wallet:Wallet={manifest:{id:selected.id,features:{signMessage:typeof selected.signMessage==='function',signAndSendTransaction:typeof selected.signAndSendTransaction==='function'}},
  signMessage:async input=>{if(!stillSelected()||input.signerId!==account||input.network!=='testnet'||!selected.signMessage)throw Error('Wallet account or signing capability changed');return (await selected.signMessage({message:input.message,recipient:input.recipient,nonce:Buffer.from(input.nonce)}))||undefined;},
  signAndSendTransaction:action=>{if(!stillSelected()||action.signerId!==account)throw Error('Wallet account changed');return selected.signAndSendTransaction(action);}
 };
 return {account,wallet,accounts};
}
