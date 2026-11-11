'use client';
import {useEffect,useState} from 'react';
import {SETTLEMENT} from '@/lib/settlement';

export default function SettlementEvidence(){
 const [state,setState]=useState<'loading'|'match'|'mismatch'|'unavailable'>('loading');
 const [observed,setObserved]=useState('');
 useEffect(()=>{let active=true;fetch('/api/settlement',{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(async r=>{if(!r.ok)throw Error();const d=await r.json();if(active){setState(d.matches===true?'match':'mismatch');setObserved(typeof d.observedAt==='string'?d.observedAt:'');}}).catch(()=>{if(active)setState('unavailable');});return()=>{active=false;};},[]);
 return <section className="card pad section-gap" aria-labelledby="evidence-title"><div className="card-head"><div><div className="eyebrow green">HISTORICAL · IMPORTED · TESTNET</div><h2 id="evidence-title">Verified Onchain Settlement</h2><p>Real settlement submitted separately using the CLI, not initiated by this app.</p></div><span className="badge pale">0.01 NEAR</span></div>
 <p className="notice" role="status">{state==='loading'?'Checking finalized request state…':state==='match'?`Finalized request matches: Completed, 0 NEAR remaining. Checked ${observed}.`:state==='mismatch'?'Current request state does not match this historical evidence. Inspect the explorer before relying on it.':'Live request state unavailable. Historical evidence remains available in the explorer.'}</p>
 <dl className="treasury-grid"><div><dt>Contract</dt><dd>{SETTLEMENT.contract}</dd></div><div><dt>Vendor</dt><dd>{SETTLEMENT.vendor}</dd></div><div><dt>Amount</dt><dd>0.01 NEAR</dd></div><div><dt>Owner</dt><dd>{SETTLEMENT.owner}</dd></div><div><dt>Operator</dt><dd>{SETTLEMENT.operator}</dd></div><div><dt>Request ID</dt><dd>{SETTLEMENT.request}</dd></div><div><dt>Payment ID</dt><dd>{SETTLEMENT.payment}</dd></div></dl>
 <p className="helper">The owner created and authorized the request; the operator executed it. Verify the transaction and transfer/callback receipts independently.</p><div className="evidence-links">{SETTLEMENT.transactions.map(([label,hash])=><a className="secondary" key={hash} href={`https://testnet.nearblocks.io/txns/${hash}`} target="_blank" rel="noreferrer">{label} ↗</a>)}</div></section>;
}
