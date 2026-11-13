import {judgeConfig} from '@/lib/server/judge-intents';
export const runtime='nodejs';
export async function GET(){try{const {contract}=judgeConfig();return Response.json({contract},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'V2 treasury is not configured'},{status:503,headers:{'Cache-Control':'no-store'}});}}
