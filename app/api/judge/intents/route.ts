import {db,failure,session} from '@/lib/server/database';
import {judgeConfig} from '@/lib/server/judge-intents';
export const runtime='nodejs';
export async function GET(request:Request){try{const {contract}=judgeConfig();const owner=await session(request);const raw=new URL(request.url).searchParams.get('offset')||'0';if(!/^\d{1,5}$/.test(raw)||Number(raw)>10000)throw Error('Invalid offset');const rows=await db('SELECT * FROM agentledger_v2.payment_intents WHERE owner_account = $1 AND contract_account = $2 ORDER BY created_at DESC, id DESC LIMIT 100 OFFSET $3',[owner,contract,Number(raw)]);return Response.json({owner,contract,enabled:false,intents:rows},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
