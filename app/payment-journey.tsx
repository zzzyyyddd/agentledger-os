import type {JudgeOperation} from '@/lib/judge-payment';
export type JourneyRow={status:string;action_input:{operation:JudgeOperation;requestId:string}};
export function journeyProgress(rows:JourneyRow[],requestId:string,contractStatus?:string){
 const related=rows.filter(row=>row.action_input.requestId===requestId);
 const confirmed=(operation:JudgeOperation)=>related.some(row=>row.action_input.operation===operation&&row.status==='CONFIRMED');
 const secured=confirmed('create_request');
 const authorized=secured&&['Authorized','Pending','Completed'].includes(contractStatus||'');
 const paid=authorized&&contractStatus==='Completed'&&confirmed('execute');
 const attention=related.some(row=>['UNKNOWN','AWAITING_SIGNATURE','SUBMITTED'].includes(row.status));
 const halted=['Failed','RefundPending','Refunded'].includes(contractStatus||'');
 return {secured,authorized,paid,attention,halted,known:['Funded','Authorized','Pending','Completed','Failed','RefundPending','Refunded'].includes(contractStatus||'')};
}
export default function PaymentJourney({rows,requestId,contractStatus}:{rows:JourneyRow[];requestId:string;contractStatus?:string}){
 const p=journeyProgress(rows,requestId,contractStatus);const stages=[{label:'Review',done:p.secured},{label:'Secure funds',done:p.secured},{label:'Authorize',done:p.authorized},{label:'Pay',done:p.paid},{label:'Verified',done:p.paid}];
 let next=false;return <div className="journey" aria-label="Payment journey">{stages.map((stage,index)=>{const active=!stage.done&&!next&&!p.halted&&p.known; if(active)next=true;return <div className={`journey-stage ${stage.done?'is-done':active?'is-current':''}`} key={stage.label}><span>{stage.done?'✓':String(index+1).padStart(2,'0')}</span><strong>{stage.label}</strong><small>{stage.done?'Verified':active?(p.attention||contractStatus==='Pending'||contractStatus==='Completed'?'Needs verification':'Next step'):'Upcoming'}</small></div>;})}{(p.halted||!p.known)&&<p className="journey-note">{p.halted?'See the contract status above for the latest outcome.':'Contract status unavailable. Verify before continuing.'}</p>}</div>;
}
