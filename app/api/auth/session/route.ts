import {configured,session} from '@/lib/server/database';
export const runtime = 'nodejs';
export async function GET(request:Request){
 try{return Response.json({configured:configured(),accountId:await session(request),signingEnabled:false},{headers:{'Cache-Control':'no-store'}});}
 catch(error){
  if(error instanceof Error&&error.message==='Authentication required')return Response.json({configured:configured(),accountId:null,signingEnabled:false},{headers:{'Cache-Control':'no-store'}});
  return Response.json({error:'Identity service unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
