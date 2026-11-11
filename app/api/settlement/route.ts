import {SETTLEMENT,settlementMatches} from '@/lib/settlement';
export const dynamic='force-dynamic';
export async function GET(){
 try {
  const response=await fetch('https://test.rpc.fastnear.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'settlement',method:'query',params:{request_type:'call_function',finality:'final',account_id:SETTLEMENT.contract,method_name:'get_request',args_base64:Buffer.from(JSON.stringify({request_id:SETTLEMENT.request})).toString('base64')}}),cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error();
  const body=await response.json(),bytes=body?.result?.result;
  if(!Array.isArray(bytes)||bytes.length>10000||!bytes.every((v:unknown)=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=255))throw Error();
  const request=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(bytes)));
  return Response.json({matches:settlementMatches(request),blockHeight:body.result.block_height,observedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 } catch {return Response.json({error:'Finalized request state unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
