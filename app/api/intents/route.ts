import {configured,failure,session,db} from '@/lib/server/database';
export const runtime = 'nodejs';
export async function GET(request:Request){try{if(!configured())return Response.json({configured:false},{status:503});const owner=await session(request);const rows=await db('SELECT * FROM public.payment_intents WHERE owner_account = $1 ORDER BY created_at DESC LIMIT 100',[owner]);return Response.json({configured:true,intents:rows},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
