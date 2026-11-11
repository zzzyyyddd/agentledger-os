import type {NearConnector} from '@hot-labs/near-connect';

export const TESTNET_CONTRACT = 'agentledger-treasury.testnet';
export const WALLET_IDS = ['meteor-wallet','intear-wallet','nightly-wallet'] as const;
export const WALLET_CHANGED = 'agentledger:wallet-changed';
let connector:Promise<NearConnector>|undefined;
export function getSelector(){
 if(!connector) connector=import('@hot-labs/near-connect').then(({NearConnector})=>new NearConnector({network:'testnet',features:{testnet:true,signMessage:true,signInWithoutAddKey:true},excludedWallets:['mynearwallet','my-near-wallet'],autoConnect:false})).catch(e=>{connector=undefined;throw e});
 return connector;
}
export function supportedWallets<T extends {manifest:{id:string;features?:{testnet?:boolean;signMessage?:boolean;signInWithoutAddKey?:boolean}}}>(wallets:T[]):T[]{
 return wallets.filter(w=>WALLET_IDS.some(id=>id===w.manifest.id)&&w.manifest.features?.testnet===true&&w.manifest.features.signMessage===true&&w.manifest.features.signInWithoutAddKey===true).sort((a,b)=>WALLET_IDS.indexOf(a.manifest.id as typeof WALLET_IDS[number])-WALLET_IDS.indexOf(b.manifest.id as typeof WALLET_IDS[number]));
}
export function isTestnetAccount(account:string){return /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(account)&&account.length<=64;}
export function walletError(error:unknown){const message=error instanceof Error?error.message:'';if(/reject|denied|cancel|closed/i.test(message))return 'Connection was cancelled. Please try again.';if(/install|not found|not available/i.test(message))return 'Wallet unavailable. Install it or open its mobile app, then try again.';if(/network|testnet/i.test(message))return 'Switch your wallet to NEAR Testnet and try again.';return 'Could not connect to this wallet. Check its Testnet settings and try again.';}
export async function connectedAccount(){const selector=await getSelector();await selector.whenManifestLoaded;if(!selector.manifest.wallets.length)throw Error('Wallet providers unavailable');const {wallet,accounts}=await selector.getConnectedWallet();if(!supportedWallets([wallet]).length)throw Error('Wallet is not supported on Testnet');const account=accounts[0]?.accountId;if(!account||!isTestnetAccount(account))throw Error('Switch your wallet to NEAR Testnet');return {wallet,account};}
export function notifyWalletChange(){if(typeof window!=='undefined')window.dispatchEvent(new Event(WALLET_CHANGED));}
