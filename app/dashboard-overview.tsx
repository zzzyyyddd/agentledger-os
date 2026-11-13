'use client';
import {useEffect,useState} from 'react';
import {formatNear,formatNearDisplay,viewContract} from '@/lib/v2-view';
import {isTestnetAccountId} from '@/lib/near-account';

type Summary={owner:string;pending:number;active:number;partialIntents:boolean;partialRequests:boolean;recent:{id:string;title:string;status:string}[]};
type Balance={owner:string;amount:string};
export default function DashboardOverview({account,walletAccount=account,onPayments,onActivity}:{account:string|null;walletAccount?:string|null;onPayments:()=>void;onActivity?:()=>void}){
 const [summary,setSummary]=useState<Summary|null>(null),[error,setError]=useState(false);
 const [balance,setBalance]=useState<Balance|null>(null),[balanceError,setBalanceError]=useState(false);
 useEffect(()=>{let current=true;setBalance(null);setBalanceError(false);if(!walletAccount)return;
  void (async()=>{try{if(!isTestnetAccountId(walletAccount))throw Error();const response=await fetch('https://test.rpc.fastnear.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'v2-wallet-balance',method:'query',params:{request_type:'view_account',finality:'final',account_id:walletAccount}}),signal:AbortSignal.timeout(12000)});const body=await response.json();if(!response.ok||body.error||typeof body.result?.amount!=='string')throw Error();formatNear(body.result.amount);if(current)setBalance({owner:walletAccount,amount:body.result.amount});}catch{if(current)setBalanceError(true);}})();return()=>{current=false;};
 },[walletAccount]);
 useEffect(()=>{let current=true;setSummary(null);setError(false);if(!account)return;
  void (async()=>{try{
   const response=await fetch('/api/judge/intents',{cache:'no-store',signal:AbortSignal.timeout(20000)});const body=await response.json();
   if(!response.ok||body.owner!==account||!Array.isArray(body.intents))throw Error('unavailable');
   const requests=await viewContract(body.contract,'get_payments_by_owner',{owner:account,from:0,limit:50});if(!Array.isArray(requests))throw Error('unavailable');
   const pending=body.intents.filter((r:{status:string})=>['AWAITING_SIGNATURE','SUBMITTED','UNKNOWN'].includes(r.status)).length;
   const active=requests.filter((item:unknown)=>Array.isArray(item)&&item[1]&&['Funded','Authorized','Pending','RefundPending'].includes(item[1].status)).length;
   const recent=requests.filter((item:unknown)=>Array.isArray(item)&&typeof item[0]==='string'&&item[1]&&typeof item[1].status==='string').slice(-3).reverse().map((item:[string,{status:string}])=>({id:item[0],title:item[0],status:item[1].status}));
   if(current)setSummary({owner:account,pending,active,partialIntents:body.intents.length===100,partialRequests:requests.length===50,recent});
  }catch{if(current)setError(true);}})();return()=>{current=false;};
 },[account]);
 const visible=summary?.owner===account?summary:null;
 const visibleBalance=balance?.owner===walletAccount?balance:null;
 const state=(s:string)=>s==='Completed'?'Completed on chain':s==='Funded'?'Funds secured':s==='Authorized'?'Authorized':s==='Pending'?'Pending':s==='RefundPending'?'Return pending':s==='Refunded'?'Returned':s==='Failed'?'Failed':s==='CONFIRMED'?'Verified':s==='SUBMITTED'?'Confirming':s==='UNKNOWN'?'Needs verification':s==='AWAITING_SIGNATURE'?'Waiting for wallet':s==='FAILED'?'Failed':s==='REFUNDED'?'Returned':'In progress';
 return <><div className="overview-metrics"><div className="overview-metric"><span>ACTIVE PAYMENTS</span><strong>{visible?`${visible.partialRequests?'≥':''}${visible.active}`:'—'}</strong><p>{visible?.partialRequests?'At least this many in loaded activity':'From loaded activity'}</p></div><div className="overview-metric"><span>NEEDS ATTENTION</span><strong>{visible?`${visible.partialIntents?'≥':''}${visible.pending}`:'—'}</strong><p>{visible?.partialIntents?'At least this many in loaded activity':'From loaded activity'}</p></div><div className="overview-metric"><span>WALLET BALANCE</span><strong title={visibleBalance?`${formatNear(visibleBalance.amount)} NEAR`:undefined}>{visibleBalance?`${formatNearDisplay(visibleBalance.amount)} NEAR`:!walletAccount?'—':balanceError?'Unavailable':'Loading…'}</strong><p>{!walletAccount?'Connect a wallet':balanceError?'Could not load wallet balance':'Testnet balance · storage requirements may apply'}</p></div></div>{error&&<p className="helper">Activity is unavailable. Check your connection and try again.</p>}
 <section className="card overview-activity"><div className="activity-toolbar"><div><h2>Recent activity</h2><p>From your loaded payments</p></div><button className="text-button" onClick={onActivity||onPayments}>{onActivity?'View activity':'Open payments'} ↗</button></div>{visible?.recent.length?<div className="dashboard-list">{visible.recent.map(r=><div key={r.id}><span className="list-icon">↗</span><div><strong>{r.title}</strong><small>NEAR Testnet</small></div><span className="badge soft">{state(r.status)}</span></div>)}</div>:<div className="quiet-empty overview-empty"><strong>{error?'Activity unavailable':account&&!visible?'Loading activity…':account?'No payments yet':'Your activity will appear here'}</strong><p>{error?'Check your connection to load activity.':account?'Your payments will appear here.':'Connect and verify your wallet to see activity.'}</p>{onActivity&&<button className="text-button" onClick={onActivity}>View activity →</button>}</div>}<details className="developer-details overview-details"><summary>About these figures</summary><p>Active payments and activity use up to the first 50 finalized contract records. Attention counts use up to the 100 most recent saved intents; a ≥ indicates a partial count. Wallet balance is a finalized account balance and may include funds needed for storage.</p>{visibleBalance&&<p>Exact wallet balance: {formatNear(visibleBalance.amount)} NEAR</p>}</details></section></>;
}
