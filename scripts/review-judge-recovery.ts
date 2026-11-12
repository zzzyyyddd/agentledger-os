// Read-only operator review. Never changes an intent or applies a migration.
import {Pool} from 'pg';
import {reviewJudgeRecovery} from '../lib/server/judge-recovery-review';
import type {JudgeRow} from '../lib/server/judge-intents';

async function main(){
 const args=process.argv.slice(2);const names=['id','owner','contract','request'];const values:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){const name=args[i];if(!name?.startsWith('--')||!args[i+1]||values[name.slice(2)]!==undefined)throw Error('Supply --id, --owner, --contract, --request and optional --hash');values[name.slice(2)]=args[i+1];}
 if(names.some(name=>!values[name])||Object.keys(values).some(name=>![...names,'hash'].includes(name)))throw Error('Supply --id, --owner, --contract, --request and optional --hash');
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
 try{
  const client=await pool.connect();
  try{
   await client.query('BEGIN READ ONLY');
   const result=await client.query('SELECT id,owner_account,status,version,transaction_hash,action_input FROM public.payment_intents WHERE id=$1 AND owner_account=$2 AND contract_account=$3 AND operation=$4 AND payment_reference=$5',[values.id,values.owner,values.contract,'create_request',values.request]);
   if(result.rows.length!==1)throw Error('Intent not found for the exact target');
   const review=await reviewJudgeRecovery(result.rows[0] as JudgeRow,{id:values.id,owner:values.owner,contract:values.contract,requestId:values.request,hash:values.hash});
   console.log(JSON.stringify({id:values.id,owner:values.owner,contract:values.contract,requestId:values.request,status:result.rows[0].status,version:result.rows[0].version,...review},null,2));
   await client.query('COMMIT');
  }finally{client.release();}
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Recovery review failed. Verify the target, read-only database access, and RPC availability. No changes were made.');process.exitCode=1;});
