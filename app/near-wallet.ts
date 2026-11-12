import {isTestnetAccountId} from '@/lib/near-account';
import type {NearConnector} from '@hot-labs/near-connect';

export const TESTNET_CONTRACT='agentledger-treasury.testnet';
export const WALLET_CHANGED='agentledger:wallet-changed';
const SELECTION_KEY='agentledger:near-account:v1';
let connector:Promise<NearConnector>|undefined;

// One connector per browser session. Wallet code and supported methods come from
// the connector's manifest; the application never installs an access key.
export function getSelector(){
 if(!connector)connector=import('@hot-labs/near-connect').then(({NearConnector})=>new NearConnector({network:'testnet',features:{testnet:true,signMessage:true,signInWithoutAddKey:true},autoConnect:false})).catch(error=>{connector=undefined;throw error;});
 return connector;
}
export function supportedWallets<T extends {manifest:{features?:{testnet?:boolean;signMessage?:boolean;signInWithoutAddKey?:boolean}}}>(wallets:T[]):T[]{
 return wallets.filter(({manifest:{features}})=>features?.testnet===true&&features.signMessage===true&&features.signInWithoutAddKey===true);
}
export const isTestnetAccount=isTestnetAccountId;
export function walletError(error:unknown){const message=error instanceof Error?error.message:'';if(/reject|denied|cancel|closed/i.test(message))return 'Connection was cancelled. Please try again.';if(/install|not found|not available/i.test(message))return 'Wallet unavailable. Install it or open its mobile app, then try again.';if(/network|testnet/i.test(message))return 'Switch your wallet to NEAR Testnet and try again.';return 'Could not connect to this wallet. Check its Testnet settings and try again.';}
export function resolveAccount(walletId:string,accounts:{accountId:string}[],saved:string|null):string{
 const eligible=accounts.map(a=>a.accountId).filter(isTestnetAccountId);
 if(!eligible.length)throw Error('Switch your wallet to NEAR Testnet');
 if(saved){try{const selection=JSON.parse(saved) as {walletId?:string;account?:string};if(selection.walletId===walletId){if(selection.account&&eligible.includes(selection.account))return selection.account;throw Error('Selected wallet account is no longer available');}}catch(error){if(error instanceof Error&&error.message==='Selected wallet account is no longer available')throw error;}}
 return eligible[0];
}
function savedSelection(){try{return typeof window==='undefined'?null:window.localStorage.getItem(SELECTION_KEY);}catch{return null;}}
export async function connectedAccount(){
 const selector=await getSelector();await selector.whenManifestLoaded;
 const {wallet,accounts}=await selector.getConnectedWallet();
 if(!supportedWallets([wallet]).length)throw Error('Wallet is not supported on Testnet');
 const account=resolveAccount(wallet.manifest.id,accounts,savedSelection());
 return {wallet,account,accounts:accounts.map(a=>a.accountId).filter(isTestnetAccountId)};
}
export async function selectWalletAccount(account:string){
 const selector=await getSelector();const {wallet,accounts}=await selector.getConnectedWallet();
 if(!isTestnetAccountId(account)||!accounts.some(a=>a.accountId===account))throw Error('Selected wallet account is no longer available');
 window.localStorage.setItem(SELECTION_KEY,JSON.stringify({walletId:wallet.manifest.id,account}));
 notifyWalletChange();
}
export function clearWalletAccount(){try{window.localStorage.removeItem(SELECTION_KEY);}catch{}}
export function notifyWalletChange(){if(typeof window!=='undefined')window.dispatchEvent(new Event(WALLET_CHANGED));}
