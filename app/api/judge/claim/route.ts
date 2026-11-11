import {assertOrigin,failure,session} from '@/lib/server/database';
import {claimJudge} from '@/lib/server/judge-intents';
export const runtime='nodejs';
export async function POST(request:Request){try{assertOrigin(request);const owner=await session(request);const body=await request.json();return Response.json(await claimJudge(owner,body.input),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
