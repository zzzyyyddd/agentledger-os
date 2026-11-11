import {assertOrigin,failure,session} from '@/lib/server/database';
import {claim} from '@/lib/server/intents';
export const runtime = 'nodejs';
export async function POST(request:Request){try{assertOrigin(request);if(process.env.PAYMENTS_ENABLED!=='true')throw Error('Payment signing is disabled');const owner=await session(request);const data=await request.json();return Response.json(await claim(owner,data.input),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
