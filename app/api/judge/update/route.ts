import {assertOrigin,failure,session} from '@/lib/server/database';
import {getJudgeRow,transitionJudge} from '@/lib/server/judge-intents';
export const runtime='nodejs';
export async function POST(request:Request){try{assertOrigin(request);const owner=await session(request);const {id,status,hash}=await request.json();if(!['SUBMITTED','UNKNOWN'].includes(status))throw Error('Invalid status');const row=await getJudgeRow(owner,id);if(row.status===status&&((status==='UNKNOWN'&&!hash)||(status==='SUBMITTED'&&hash===row.transaction_hash)))return Response.json(row,{headers:{'Cache-Control':'no-store'}});return Response.json(await transitionJudge(row,status,hash),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
