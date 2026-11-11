import {configured,session} from '@/lib/server/database';
export const runtime = 'nodejs';
export async function GET(request:Request){try{return Response.json({configured:configured(),accountId:await session(request),signingEnabled:configured()&&process.env.PAYMENTS_ENABLED==='true'},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({configured:configured(),accountId:null,signingEnabled:false},{headers:{'Cache-Control':'no-store'}});}}
