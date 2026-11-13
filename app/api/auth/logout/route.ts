import {assertOrigin,cookie,cookieHeader,db,digest,failure} from '@/lib/server/database';
export const runtime='nodejs';
export async function POST(request:Request){try{assertOrigin(request);const value=cookie(request,'al_v2_session');if(value)await db('DELETE FROM agentledger_v2.wallet_sessions WHERE token_hash = $1',[digest(value)]);return Response.json({ok:true},{headers:{'Set-Cookie':cookieHeader('al_v2_session','',0),'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
