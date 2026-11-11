import {readTreasury,TreasuryError} from '@/lib/server/treasury';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await readTreasury(),{headers:{'Cache-Control':'no-store'}});}catch(error){const code=error instanceof TreasuryError?error.code:'RPC_UNAVAILABLE';return Response.json({error:code},{status:code==='ACCOUNT_MISSING'?404:503,headers:{'Cache-Control':'no-store'}});}}
