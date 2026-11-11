import {prepareJudgeAction,type JudgeInput} from '@/lib/judge-payment';
import {validTxHash} from '@/lib/transaction';

type Row={id:string;status:string;action_input:JudgeInput};
type Wallet={manifest:{features:{signAndSendTransaction:boolean}};signAndSendTransaction:(action:ReturnType<typeof prepareJudgeAction>)=>Promise<{transaction?:{hash?:string}}>};
type Deps={claim:(input:JudgeInput)=>Promise<Row>;update:(id:string,status:'SUBMITTED'|'UNKNOWN',hash?:string)=>Promise<unknown>;connect:()=>Promise<{account:string;wallet:Wallet}>};
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export async function submitJudge(input:JudgeInput,deps:Deps):Promise<string>{
 const before=await deps.connect();
 if(before.account!==input.signer)throw Error('Connected wallet account does not match the preview.');
 if(before.wallet.manifest?.features?.signAndSendTransaction!==true||typeof before.wallet.signAndSendTransaction!=='function')throw Error('This wallet does not advertise Testnet transaction signing. Choose another compatible wallet.');
 const row=await deps.claim(input);let hash:string|undefined;
 try{
  const i=row.action_input;
  if(row.status!=='AWAITING_SIGNATURE'||Object.keys(input).some(k=>stable(input[k as keyof JudgeInput])!==stable(i[k as keyof JudgeInput])))throw Error('Claimed transaction does not match preview');
  const connection=await deps.connect();if(connection.account!==i.signer||connection.wallet.manifest?.features?.signAndSendTransaction!==true||typeof connection.wallet.signAndSendTransaction!=='function')throw Error('Wallet account or signing capability changed');
  const outcome=await connection.wallet.signAndSendTransaction(prepareJudgeAction(i));hash=outcome?.transaction?.hash;
  if(!hash||!validTxHash(hash))throw Error('Wallet returned no transaction hash');
  await deps.update(row.id,'SUBMITTED',hash);return hash;
 }catch{
  if(hash&&validTxHash(hash)){try{await deps.update(row.id,'SUBMITTED',hash);}catch{}throw Error(`Submission tracking interrupted. Save original hash ${hash} and reconcile; do not resubmit.`);}
  try{await deps.update(row.id,'UNKNOWN');}catch{}
  throw Error('Outcome UNKNOWN: recover the original hash and reconcile; do not resubmit.');
 }
}
