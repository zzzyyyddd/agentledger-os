'use client';
import {useEffect,useState} from 'react';
import {formatNear,viewContract} from '@/lib/v2-view';

type Snapshot={contract:string;balance:string;liabilities:string};
export default function V2TreasurySummary(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[state,setState]=useState<'loading'|'ready'|'error'>('loading');
 useEffect(()=>{let current=true;async function load(){try{
  const config=await fetch('/api/v2/config',{cache:'no-store',signal:AbortSignal.timeout(15000)});const data=await config.json();if(!config.ok||data.contract!=='agentledger-v2.agentledger-owner.testnet')throw Error();
  const response=await fetch('https://test.rpc.fastnear.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'v2-treasury',method:'query',params:{request_type:'view_account',finality:'final',account_id:data.contract}}),signal:AbortSignal.timeout(15000)});
  const body=await response.json();if(!response.ok||body.error||typeof body.result?.amount!=='string')throw Error();
  const liabilities=await viewContract(data.contract,'get_liabilities',{});if(typeof liabilities!=='string')throw Error();
  const balance=formatNear(body.result.amount),owed=formatNear(liabilities);
  if(current){setSnapshot({contract:data.contract,balance,liabilities:owed});setState('ready');}
 }catch{if(current)setState('error');}}void load();return()=>{current=false;};},[]);
 return <section className="card pad policy-card treasury-live" aria-labelledby="treasury-live-title"><div className="section-kicker">LIVE TESTNET TREASURY</div><h2 id="treasury-live-title">Treasury at a glance</h2><p className="section-copy">Finalized contract data shared across all owners. This is not your wallet balance.</p>{state==='loading'?<p className="helper" role="status">Checking the treasury…</p>:state==='error'?<p className="helper" role="status">Treasury data is unavailable. Please try again later.</p>:snapshot&&<><div className="policy-item"><strong>Contract status</strong><span>Responding on Testnet</span></div><div className="policy-item"><strong>Contract balance</strong><span>{snapshot.balance} NEAR</span></div><div className="policy-item"><strong>Funds owed to owners</strong><span>{snapshot.liabilities} NEAR</span></div><p className="helper">The contract balance includes funds reserved for storage and other owners; it is not an available balance.</p><details className="developer-details"><summary>Contract details</summary><p>{snapshot.contract} · NEAR Testnet</p></details></>}</section>;
}
