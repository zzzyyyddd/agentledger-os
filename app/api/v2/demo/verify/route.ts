import {assertOrigin,session} from '@/lib/server/database';
import {getJudgeRow,judgeConfig,validateDeployment} from '@/lib/server/judge-intents';
import {reconcileJudge} from '@/lib/server/judge-reconcile';

export const runtime='nodejs';

// Reconciliation evidence is read from Testnet. This endpoint never changes an intent.
export async function POST(request:Request){
 try{
  assertOrigin(request);
  const owner=await session(request);
  const {id}=await request.json();
  const row=await getJudgeRow(owner,id);
  const {contract,hash}=judgeConfig();
  await validateDeployment(contract,hash);
  const outcome=await reconcileJudge(row);
  return Response.json({outcome,hash:outcome==='UNKNOWN'?null:row.transaction_hash},{headers:{'Cache-Control':'no-store'}});
 }catch{
  return Response.json({error:'Verification is unavailable. The payment remains unresolved.'},{status:400,headers:{'Cache-Control':'no-store'}});
 }
}
