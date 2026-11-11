import pg from 'pg';
import {randomUUID} from 'node:crypto';

// Opt-in, scoped fixtures only. This script does not apply migrations.
if(process.argv.length!==3||process.argv[2]!=='--run')throw Error('Use --run to execute the isolated live judge-intent test.');
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is unavailable.');
const namespace=randomUUID(),owner=`judgecheck-${namespace}.testnet`,contract=`judgecontract-${namespace}.testnet`;
const clients=[new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000}),new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000})];
let failed=false,connected=[];
try{
 for(const client of clients){await client.connect();connected.push(client);}
 const exists=await clients[0].query("SELECT to_regprocedure('public.claim_judge_intent(text,text,text,text,text,text,text,jsonb)') IS NOT NULL AS present");
 if(!exists.rows[0].present)throw Error('Judge intent migration has not been applied.');
 const claim=async(client,key,request)=>{await client.query('BEGIN');try{const result=await client.query('SELECT id FROM public.claim_judge_intent($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[owner,key,contract,request,owner,'1','create_request',JSON.stringify({request})]);await client.query('COMMIT');return result.rowCount;}catch(e){await client.query('ROLLBACK');throw e;}};
 const counts=await Promise.all([claim(clients[0],`${namespace}-a`,'request-a'),claim(clients[1],`${namespace}-b`,'request-b')]);
 if(counts.sort().join(',')!=='0,1')throw Error('Concurrent claims were not serialized.');
 await clients[0].query("UPDATE public.payment_intents SET status='UNKNOWN' WHERE owner_account=$1 AND contract_account=$2",[owner,contract]);
 if(await claim(clients[0],`${namespace}-c`,'request-c')!==0)throw Error('UNKNOWN did not block another request.');
 console.log('PASS distinct-connection claims serialize per owner');console.log('PASS UNKNOWN blocks a new request');
}catch{failed=true;console.error('FAIL live judge intent test (database details suppressed)');}
finally{
 if(connected.length){try{await connected[0].query('BEGIN');await connected[0].query('DELETE FROM public.payment_intents WHERE owner_account=$1 AND contract_account=$2',[owner,contract]);await connected[0].query('COMMIT');console.log('PASS cleanup of this run’s isolated fixtures');}catch{failed=true;try{await connected[0].query('ROLLBACK');}catch{}console.error(`FAIL fixture cleanup; investigate namespace ${namespace}`);}}
 await Promise.allSettled(connected.map(client=>client.end()));
}
if(failed)process.exitCode=1;
