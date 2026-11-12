import {assertOrigin,failure,session,sessionExpiry} from '@/lib/server/database';
import {getJudgeRow,judgeConfig,preflightJudge,validateDeployment} from '@/lib/server/judge-intents';
export const runtime='nodejs';
// A server-checked snapshot of an already claimed operation. This does not
// sign, broadcast, release the claim, or prove that another broadcast is absent.
export async function POST(request:Request){try{
 assertOrigin(request);const owner=await session(request);const {id}=await request.json();
 const {contract,hash}=judgeConfig(true);const row=await getJudgeRow(owner,id);
 if(row.status!=='AWAITING_SIGNATURE'||row.action_input.signer!==owner||row.action_input.contract!==contract)throw Error('Payment is not awaiting approval');
 await validateDeployment(contract,hash);await preflightJudge(row.action_input);
 const sessionEnds=await sessionExpiry(request,owner);const now=Date.now();
 const requestEnds=row.action_input.operation==='refund'?Number.POSITIVE_INFINITY:Number(BigInt(row.action_input.expiryNs)/1_000_000n);
 const expiresAt=Math.min(now+60_000,sessionEnds,requestEnds);
 if(expiresAt<=now)throw Error('Approval preparation expired');
 return Response.json({id:row.id,owner,action_input:row.action_input,expiresAt},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}}
