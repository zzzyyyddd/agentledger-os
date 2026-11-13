'use client';
import {useEffect,useState} from 'react';
import {viewContract} from '@/lib/payment';

type Summary={owner:string;pending:number;active:number;recent:{id:string;title:string;status:string}[]};
export default function DashboardOverview({account,onPayments}:{account:string|null;onPayments:()=>void}){
 const [summary,setSummary]=useState<Summary|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let current=true;setSummary(null);setError(false);if(!account)return;
  void (async()=>{try{
   const response=await fetch('/api/judge/intents',{cache:'no-store',signal:AbortSignal.timeout(20000)});const body=await response.json();
   if(!response.ok||body.owner!==account||!Array.isArray(body.intents))throw Error('unavailable');
   const requests=await viewContract(body.contract,'get_payments_by_owner',{owner:account,from:0,limit:50});if(!Array.isArray(requests))throw Error('unavailable');
   const pending=body.intents.filter((r:{status:string})=>['AWAITING_SIGNATURE','SUBMITTED','UNKNOWN'].includes(r.status)).length;
   const active=requests.filter((item:unknown)=>Array.isArray(item)&&item[1]&&['Funded','Authorized','Pending','RefundPending'].includes(item[1].status)).length;
   const recent=requests.filter((item:unknown)=>Array.isArray(item)&&typeof item[0]==='string'&&item[1]&&typeof item[1].status==='string').slice(-3).reverse().map((item:[string,{status:string}])=>({id:item[0],title:item[0],status:item[1].status}));
   if(current)setSummary({owner:account,pending,active,recent});
  }catch{if(current)setError(true);}})();return()=>{current=false;};
 },[account]);
 const visible=summary?.owner===account?summary:null;
 const state=(s:string)=>s==='Completed'?'Completed on chain':s==='Funded'?'Funds secured':s==='Authorized'?'Authorized':s==='Pending'?'Pending':s==='RefundPending'?'Return pending':s==='Refunded'?'Returned':s==='Failed'?'Failed':s==='CONFIRMED'?'Verified':s==='SUBMITTED'?'Confirming':s==='UNKNOWN'?'Needs verification':s==='AWAITING_SIGNATURE'?'Waiting for wallet':s==='FAILED'?'Failed':s==='REFUNDED'?'Returned':'In progress';
 return <><div className="overview-metrics"><div className="overview-metric"><span>ACTIVE PAYMENTS</span><strong>{visible?visible.active:'—'}</strong><p>From finalized contract records</p></div><div className="overview-metric"><span>NEEDS ATTENTION</span><strong>{visible?visible.pending:'—'}</strong><p>Transactions to verify</p></div><div className="overview-metric"><span>AVAILABLE BALANCE</span><strong>In wallet</strong><p>Check your wallet for your balance</p></div></div>{error&&<p className="helper">Activity is unavailable. Check your connection and try again.</p>}
 <section className="card overview-activity"><div className="activity-toolbar"><div><h2>Recent activity</h2><p>Your finalized V2 contract records</p></div><button className="text-button" onClick={onPayments}>Open payments ↗</button></div>{visible?.recent.length?<div className="dashboard-list">{visible.recent.map(r=><div key={r.id}><span className="list-icon">↗</span><div><strong>{r.title}</strong><small>NEAR Testnet</small></div><span className="badge soft">{state(r.status)}</span></div>)}</div>:<div className="quiet-empty"><span className="empty-icon">↗</span><strong>{error?'Activity unavailable':account&&!visible?'Loading activity…':account?'No payments yet':'Your activity will appear here'}</strong><p>{account?'Your V2 payments will appear here.':'Connect and verify your wallet to see activity.'}</p></div>}</section></>;
}
