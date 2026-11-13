'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import WalletConnection from '../../wallet';
import Activity from '../../activity';
import {intentLabel} from '../../live-judge-treasury';
import {validTxHash} from '@/lib/transaction';
import type {JudgeInput} from '@/lib/judge-payment';

type Intent={id:string;status:string;transaction_hash:string|null;action_input:JudgeInput};
type Evidence={id:string;outcome:string;hash:string|null};
export function DemoContent({account}:{account:string|null}){
 const [contract,setContract]=useState(''),[intents,setIntents]=useState<Intent[]>([]),[state,setState]=useState<'loading'|'ready'|'error'>('loading');
 const [evidence,setEvidence]=useState<Evidence|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const revision=useRef(0);
 const refresh=useCallback(async()=>{
  const current=++revision.current;setEvidence(null);setMessage('');setIntents([]);setState('loading');
  try{
   const config=await fetch('/api/v2/config',{cache:'no-store'});if(!config.ok)throw Error();
   const configured=await config.json();if(current!==revision.current)return;setContract(configured.contract);
   if(!account){setState('ready');return;}
   const response=await fetch('/api/judge/intents',{cache:'no-store'});if(!response.ok)throw Error();
   const result=await response.json();if(current!==revision.current)return;
   if(result.owner!==account||result.contract!==configured.contract||!Array.isArray(result.intents))throw Error();
   setIntents(result.intents);setState('ready');
  }catch{if(current===revision.current)setState('error');}
 },[account]);
 useEffect(()=>{const version=revision;void refresh();const onFocus=()=>void refresh();window.addEventListener('focus',onFocus);return()=>{version.current++;window.removeEventListener('focus',onFocus);};},[refresh]);
 async function verify(id:string){
  const current=revision.current;setBusy(true);setEvidence(null);setMessage('Checking finalized Testnet evidence…');
  try{const response=await fetch('/api/v2/demo/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id}),cache:'no-store'});if(!response.ok)throw Error();const result=await response.json();if(current!==revision.current)return;
   if(!['UNKNOWN','CONFIRMED','FAILED','REFUNDED'].includes(result.outcome))throw Error();
   setEvidence({id,outcome:result.outcome,hash:typeof result.hash==='string'&&validTxHash(result.hash)?result.hash:null});
   setMessage(result.outcome==='UNKNOWN'?'Unresolved: the original transaction remains uncertain. Do not submit it again.':`Finalized evidence: ${intentLabel(result.outcome)}.`);
  }catch{if(current===revision.current)setMessage('Verification is unavailable. The original transaction remains unresolved.');}finally{setBusy(false);}
 }
 return <>
  <div className="page-heading"><div><div className="eyebrow green">V2 JUDGE DEMO · NEAR TESTNET</div><h1>Explore the payment lifecycle.</h1><p>Read-only preview. Payment signing is disabled on this page.</p></div></div>
  <div className="notice"><strong>Testnet contract:</strong> {contract||(state==='error'?'Configuration unavailable':'Checking configuration…')}<p>Connect and verify a Nightly or Sender wallet to see its V2 history. If a wallet request was rejected or interrupted, check the original transaction before taking any further action.</p></div>
  <section className="card pad policy-card"><div className="section-kicker">PAYMENT LIFECYCLE</div><div className="policy-item"><strong>1. Create and secure</strong><span>The owner funds the request.</span></div><div className="policy-item"><strong>2. Authorize</strong><span>The owner approves the recipient and amount.</span></div><div className="policy-item"><strong>3. Execute</strong><span>The contract settles the payment.</span></div><div className="policy-item"><strong>4. Refund</strong><span>Eligible remaining funds can be returned.</span></div></section>
  <Activity account={account} readOnly onResume={()=>{document.getElementById('v2-intents')?.scrollIntoView();}}/>
  <section className="card pad policy-card" id="v2-intents"><div className="section-kicker">READ-ONLY VERIFICATION</div><h2>Saved transaction intents</h2><p>Verification reads finalized chain evidence and does not change the saved intent.</p>
   {!account?<p>Connect and verify your wallet to see saved intents.</p>:state==='loading'?<p>Loading saved intents…</p>:state==='error'?<p role="alert">Saved intents are unavailable. Check your connection and verified session.</p>:intents.length===0?<p>No saved V2 intents for this wallet.</p>:intents.map(row=><div className="policy-item" key={row.id}><div><strong>{row.action_input.operation.replaceAll('_',' ')}</strong><p>{row.action_input.requestId} · {row.status==='UNKNOWN'?'Unresolved · needs verification':intentLabel(row.status)}</p></div><div><button className="secondary" disabled={busy} onClick={()=>void verify(row.id)}>Verify on Testnet</button>{evidence?.id===row.id&&evidence.outcome!=='UNKNOWN'&&evidence.hash&&<p><a href={`https://testnet.nearblocks.io/txns/${evidence.hash}`} target="_blank" rel="noreferrer">View verified transaction ↗</a></p>}</div></div>)}
   {message&&<p role="status">{message}</p>}
  </section>
 </>;
}
export default function V2Demo(){
 const [identity,setIdentity]=useState<{account:string|null;verified:boolean}>({account:null,verified:false});
 const onIdentityChange=useCallback((account:string|null,verified:boolean)=>setIdentity({account,verified}),[]);
 return <div className="shell"><aside className="sidebar"><div className="brand"><div className="brandmark">◈</div><div><strong>agentledger</strong><small>OPERATING SYSTEM</small></div></div><div className="navlabel">V2 JUDGE DEMO</div><p><Link href="/">← Back to workspace</Link></p><div className="sidebar-bottom"><div className="network"><span className="dot"/> NEAR TESTNET</div></div></aside><main className="main"><header className="topbar"><div className="topbar-title"><Link href="/">Workspace</Link><span className="slash">/</span><strong>V2 demo</strong></div><div className="topright"><span className="network-text">Testnet</span><WalletConnection onIdentityChange={onIdentityChange}/></div></header><div className="content"><DemoContent account={identity.verified?identity.account:null}/></div></main></div>;
}
