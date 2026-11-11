'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WalletSelector, InjectedWallet } from '@near-wallet-selector/core';
import { getSelector } from './wallet-selector';

const contractId = process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID || '';
const validContract = /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(contractId);
export function activeWalletAccount(accounts: {accountId:string;active:boolean}[]): string | null {
 return accounts.find(a=>a.active)?.accountId ?? accounts[0]?.accountId ?? null;
}
export default function WalletConnection() {
 const selector = useRef<WalletSelector|null>(null);
 const [account,setAccount]=useState<string|null>(null);
 const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 const initialize=useCallback(async()=>{
  if(selector.current)return selector.current;
  const instance=await getSelector(); selector.current=instance; return instance;
 },[]);
 useEffect(()=>{let active=true; let unsubscribe: {unsubscribe():void}|undefined;
  if(validContract) initialize().then(s=>{if(!active)return;setAccount(activeWalletAccount(s.store.getState().accounts));unsubscribe=s.store.observable.subscribe(state=>{if(active)setAccount(activeWalletAccount(state.accounts));});}).catch(()=>{if(active)setError('Wallet initialization failed.');});
  return ()=>{active=false;unsubscribe?.unsubscribe();};
 },[initialize]);
 async function toggle(){setError('');if(!validContract){setError('Set NEXT_PUBLIC_NEAR_CONTRACT_ID to a deployed testnet contract to connect.');return;}setBusy(true);try {const s=await initialize();if(account){const wallet=await s.wallet();await wallet.signOut();setAccount(null);}else{const wallet=await s.wallet<InjectedWallet>('my-near-wallet');const accounts=await wallet.signIn({contractId});setAccount(accounts[0]?.accountId ?? null);}}catch{setError('Wallet connection was cancelled or could not complete.');}finally{setBusy(false)}}
 return <div className="wallet-wrap"><button className="wallet" onClick={toggle} disabled={busy} aria-label={account?`Disconnect ${account}`:'Connect NEAR testnet wallet'}>{busy?'Connecting…':account?`${account} · Disconnect`:'Connect wallet ↗'}</button>{error&&<div className="wallet-error" role="alert">{error}</div>}</div>;
}
