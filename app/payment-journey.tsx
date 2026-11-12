import type {JudgeOperation} from '@/lib/judge-payment';
export type JourneyRow={status:string;action_input:{operation:JudgeOperation;requestId:string}};
export function journeyProgress(rows:JourneyRow[],requestId:string){
 const related=rows.filter(row=>row.action_input.requestId===requestId);
 const confirmed=(operation:JudgeOperation)=>related.some(row=>row.action_input.operation===operation&&row.status==='CONFIRMED');
 const secured=confirmed('create_request'),authorized=secured&&confirmed('authorize'),paid=authorized&&confirmed('execute');
 const attention=related.some(row=>['UNKNOWN','AWAITING_SIGNATURE','SUBMITTED'].includes(row.status));
 return {secured,authorized,paid,attention};
}
export default function PaymentJourney({rows,requestId}:{rows:JourneyRow[];requestId:string}){
 const p=journeyProgress(rows,requestId);const stages=[{label:'Review',done:p.secured},{label:'Secure funds',done:p.secured},{label:'Authorize',done:p.authorized},{label:'Pay',done:p.paid},{label:'Verified',done:p.paid}];
 let next=false;return <div className="journey" aria-label="Payment journey">{stages.map((stage,index)=>{const active=!stage.done&&!next; if(active)next=true;return <div className={`journey-stage ${stage.done?'is-done':active?'is-current':''}`} key={stage.label}><span>{stage.done?'✓':String(index+1).padStart(2,'0')}</span><strong>{stage.label}</strong><small>{stage.done?'Verified':active?(p.attention?'Needs verification':'Next step'):'Upcoming'}</small></div>;})}</div>;
}
