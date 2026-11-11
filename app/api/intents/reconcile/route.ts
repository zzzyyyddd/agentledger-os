import {assertOrigin,failure,session} from '@/lib/server/database';
import {getIntent,transition} from '@/lib/server/intents';
import {verifyTransaction} from '@/lib/server/reconcile';
export const runtime = 'nodejs';
export async function POST(request:Request){try{assertOrigin(request);const owner=await session(request);const {id}=await request.json();const row=await getIntent(owner,id);if(!['SUBMITTED','UNKNOWN'].includes(row.status))throw Error('Record a transaction hash before reconciling');const outcome=await verifyTransaction(row);if(outcome==='UNKNOWN')return Response.json({intent:row,outcome});const updated=await transition(row,outcome);return Response.json({intent:updated,outcome});}catch(e){return failure(e);}}
