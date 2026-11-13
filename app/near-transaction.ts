import {assertInitialSigningLimit,prepareJudgeAction,type JudgeInput} from '@/lib/judge-payment';
import {validTxHash} from '@/lib/transaction';

type Row={id:string;status:string;action_input:JudgeInput};
type Wallet={manifest:{id?:string;features:{signAndSendTransaction:boolean}};signAndSendTransaction:(action:ReturnType<typeof prepareJudgeAction>)=>Promise<{transaction?:{hash?:string}}|void>};
type Deps={onPhase?:(phase:'PRE_WALLET_HANDOFF'|'POSSIBLY_BROADCAST')=>void;onHash?:(id:string,hash:string)=>void;revalidate:(account:string,contract:string)=>Promise<void>;claim:(input:JudgeInput)=>Promise<Row>;update:(id:string,status:'SUBMITTED'|'UNKNOWN',hash?:string)=>Promise<unknown>;connect:()=>Promise<{account:string;wallet:Wallet}>};
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export type PreparedJudge={input:JudgeInput;expiresAt:number;approve:()=>Promise<string>;recheck:()=>Promise<void>;invalidate:()=>void};
type PrepareDeps=Omit<Deps,'revalidate'>&{revalidate:(account:string,contract:string,id:string)=>Promise<{id:string;owner:string;action_input:JudgeInput;expiresAt:number;serverNow:number}>};

// A prepared operation is held only in this tab. The database claim is already
// committed; expiration or invalidation never releases it or retries signing.
export async function prepareJudge(input:JudgeInput,deps:PrepareDeps):Promise<PreparedJudge>{
 const requested=JSON.parse(JSON.stringify(input)) as JudgeInput;
 assertInitialSigningLimit(requested);
 const before=await deps.connect();
 if(before.account!==requested.signer)throw Error('Connected wallet account does not match the preview.');
 if(before.wallet.manifest?.features?.signAndSendTransaction!==true||typeof before.wallet.signAndSendTransaction!=='function')throw Error('This wallet does not advertise Testnet transaction signing. Choose another compatible wallet.');
 let row:Row;
 try{row=await deps.claim(requested);}catch{throw Error('Could not confirm whether the intent was claimed. No wallet handoff started in this attempt. Refresh saved intents before taking another action; a claim may still be processing.');}
 let stage:'snapshot'|'server'|'server-snapshot'|'server-expiry'|'wallet'|'expiry'='snapshot';
 try{
  deps.onPhase?.('PRE_WALLET_HANDOFF');
  const i=row.action_input;
  if(row.status!=='AWAITING_SIGNATURE'||Object.keys(requested).some(k=>stable(requested[k as keyof JudgeInput])!==stable(i[k as keyof JudgeInput])))throw Error('Claimed transaction does not match preview');
  stage='server';
  const validationStarted=performance.now();
  const checked=await deps.revalidate(i.signer,i.contract,row.id);
  stage='server-snapshot';
  if(checked.id!==row.id||checked.owner!==i.signer||!checked.action_input||Object.keys(requested).some(k=>stable(requested[k as keyof JudgeInput])!==stable(checked.action_input[k as keyof JudgeInput])))throw Error('Approval preparation does not match the claimed transaction');
  stage='server-expiry';
  const validity=checked.expiresAt-checked.serverNow;
  if(!Number.isFinite(validity)||validity<=0||validity>60_000)throw Error('Approval preparation validity is invalid');
  stage='wallet';
  const connection=await deps.connect();
  if(connection.account!==i.signer||connection.wallet.manifest.id!==before.wallet.manifest.id||connection.wallet.manifest?.features?.signAndSendTransaction!==true||typeof connection.wallet.signAndSendTransaction!=='function')throw Error('Wallet account or signing capability changed');
  stage='expiry';
  const action=prepareJudgeAction(i),remaining=Math.max(0,validity-(performance.now()-validationStarted));
  if(remaining<=0)throw Error('Approval preparation expired');
  let expiresAt=Date.now()+remaining,monotonicExpiry=performance.now()+remaining;
  let used=false;
  return {input:requested,expiresAt,invalidate:()=>{used=true;},recheck:async()=>{
   if(used||Date.now()>=expiresAt||performance.now()>=monotonicExpiry)throw Error('Approval preparation expired');
   const current=await deps.connect();
   if(current.account!==i.signer||current.wallet.manifest.id!==connection.wallet.manifest.id||current.wallet.manifest?.features?.signAndSendTransaction!==true||typeof current.wallet.signAndSendTransaction!=='function')throw Error('Wallet account or signing capability changed');
   const started=performance.now(),fresh=await deps.revalidate(i.signer,i.contract,row.id);
   if(fresh.id!==row.id||fresh.owner!==i.signer||!fresh.action_input||Object.keys(requested).some(k=>stable(requested[k as keyof JudgeInput])!==stable(fresh.action_input[k as keyof JudgeInput])))throw Error('Approval preparation does not match the claimed transaction');
   const window=fresh.expiresAt-fresh.serverNow;
   const latest=await deps.connect();
   if(latest.account!==i.signer||latest.wallet.manifest.id!==connection.wallet.manifest.id||latest.wallet.manifest?.features?.signAndSendTransaction!==true||typeof latest.wallet.signAndSendTransaction!=='function')throw Error('Wallet account or signing capability changed');
   const elapsed=performance.now()-started;
   if(!Number.isFinite(window)||window<=elapsed||window>60_000||used||Date.now()>=expiresAt||performance.now()>=monotonicExpiry)throw Error('Approval preparation expired or changed');
   expiresAt=Math.min(expiresAt,Date.now()+window-elapsed);monotonicExpiry=Math.min(monotonicExpiry,performance.now()+window-elapsed);
  },approve:()=>{
   if(used||Date.now()>=expiresAt||performance.now()>=monotonicExpiry)throw Error('Approval preparation expired or changed. This payment remains locked for review; do not submit again.');
   used=true;
   // No promise, network call, or other asynchronous work before this call.
   let response:ReturnType<Wallet['signAndSendTransaction']>;
   try{response=connection.wallet.signAndSendTransaction(action);}catch(error){response=Promise.reject(error);}
   try{deps.onPhase?.('POSSIBLY_BROADCAST');}catch{}
   return (async()=>{let hash:string|undefined;try{
    const outcome=await response;hash=outcome?.transaction?.hash;
    if(!hash||!validTxHash(hash))throw Error('Wallet returned no transaction hash');
    try{deps.onHash?.(row.id,hash);}catch{}
    await deps.update(row.id,'SUBMITTED',hash);return hash;
   }catch(error){
    if(hash&&validTxHash(hash)){try{await deps.update(row.id,'SUBMITTED',hash);}catch{}throw Error(`Submission tracking interrupted. Save original hash ${hash} and reconcile; do not resubmit.`);}
    try{await deps.update(row.id,'UNKNOWN');}catch{}
    const reason=error instanceof Error?error.message:'';
    const guidance=/popup.*block|block.*popup/i.test(reason)?'The wallet reported a blocked popup. ': /reject|denied|cancel/i.test(reason)?'The wallet reported the request was cancelled. ': /locked|unlock/i.test(reason)?'The wallet may be locked. ': /network|testnet/i.test(reason)?'Check that your wallet is on NEAR Testnet. ':'Wallet provider failed or did not return a transaction hash. ';
    throw Error(`${guidance}Outcome UNKNOWN: the wallet may have broadcast. Check wallet activity for the original hash; do not resubmit.`);
   }})();
  }};
 }catch{
  try{await deps.update(row.id,'UNKNOWN');}catch{}
  const reason={snapshot:'Saved payment details did not match.',server:'The server could not complete the preparation check.', 'server-snapshot':'The server preparation did not match the saved payment.', 'server-expiry':'The server preparation time window was invalid or expired.',wallet:'The wallet account, provider, or signing capability could not be verified.',expiry:'Approval preparation expired or could not be constructed.'}[stage];
  throw Error(`${reason} Outcome UNKNOWN: wallet handoff did not start in this session, but the durable intent stays locked for operator review. Do not resubmit.`);
 }
}
export async function submitJudge(input:JudgeInput,deps:Deps):Promise<string>{
 assertInitialSigningLimit(input);
 const before=await deps.connect();
 if(before.account!==input.signer)throw Error('Connected wallet account does not match the preview.');
 if(before.wallet.manifest?.features?.signAndSendTransaction!==true||typeof before.wallet.signAndSendTransaction!=='function')throw Error('This wallet does not advertise Testnet transaction signing. Choose another compatible wallet.');
 let row:Row;
 try{row=await deps.claim(input);}catch{throw Error('Could not confirm whether the intent was claimed. No wallet handoff started in this attempt. Refresh saved intents before taking another action; a claim may still be processing.');}
 let hash:string|undefined,handedOff=false;
 try{
  deps.onPhase?.('PRE_WALLET_HANDOFF');
  const i=row.action_input;
  if(row.status!=='AWAITING_SIGNATURE'||Object.keys(input).some(k=>stable(input[k as keyof JudgeInput])!==stable(i[k as keyof JudgeInput])))throw Error('Claimed transaction does not match preview');
  await deps.revalidate(i.signer,i.contract);
  const connection=await deps.connect();if(connection.account!==i.signer||connection.wallet.manifest.id!==before.wallet.manifest.id||connection.wallet.manifest?.features?.signAndSendTransaction!==true||typeof connection.wallet.signAndSendTransaction!=='function')throw Error('Wallet account or signing capability changed');
  const action=prepareJudgeAction(i);deps.onPhase?.('POSSIBLY_BROADCAST');handedOff=true;
  const outcome=await connection.wallet.signAndSendTransaction(action);hash=outcome?.transaction?.hash;
  if(!hash||!validTxHash(hash))throw Error('Wallet returned no transaction hash');
  // Save a local recovery copy before attempting the durable server update.
  try{deps.onHash?.(row.id,hash);}catch{}
  await deps.update(row.id,'SUBMITTED',hash);return hash;
 }catch(error){
  if(hash&&validTxHash(hash)){try{await deps.update(row.id,'SUBMITTED',hash);}catch{}throw Error(`Submission tracking interrupted. Save original hash ${hash} and reconcile; do not resubmit.`);}
  try{await deps.update(row.id,'UNKNOWN');}catch{}
  const reason=error instanceof Error?error.message:'';
  const guidance=/popup.*block|block.*popup/i.test(reason)?'The wallet reported a blocked popup. ': /reject|denied|cancel/i.test(reason)?'The wallet reported the request was cancelled. ': /locked|unlock/i.test(reason)?'The wallet may be locked. ': /network|testnet/i.test(reason)?'Check that your wallet is on NEAR Testnet. ':'';
  throw Error(handedOff?`${guidance}Outcome UNKNOWN: the wallet may have broadcast. Check wallet activity for the original hash; do not resubmit.`:'Outcome UNKNOWN: wallet handoff did not start in this session, but the durable intent stays locked for operator review. Do not resubmit.');
 }
}
