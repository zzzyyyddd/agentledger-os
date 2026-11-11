import {assertOrigin,failure,session} from '@/lib/server/database';
import {getIntent,transition} from '@/lib/server/intents';
export const runtime = 'nodejs';
export async function POST(request:Request){try{assertOrigin(request);const owner=await session(request);const {id,status,hash}=await request.json();if(!['SUBMITTED','UNKNOWN'].includes(status))throw Error('Only submission and unknown outcomes may be recorded by a wallet');const row=await getIntent(owner,id);return Response.json(await transition(row,status,hash),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
