/** Rollback-only V2 database tests. Never accepts a database target without Neon API verification. */
import {randomBytes} from 'node:crypto';
import {writeSync} from 'node:fs';
import {Client} from 'pg';
import {verifyV2TestBranch} from '../lib/server/v2-test-branch-guard';

const apiKey=process.env.NEON_API_KEY, projectId=process.env.NEON_PROJECT_ID, branchId=process.env.NEON_BRANCH_ID, databaseUrl=process.env.NEON_V2_TEST_DATABASE_URL, appRole=process.env.NEON_V2_APP_ROLE;
if(!apiKey||!projectId||!branchId||!databaseUrl||!appRole){writeSync(2,'FAIL: NEON_API_KEY, NEON_PROJECT_ID, NEON_BRANCH_ID, NEON_V2_APP_ROLE, and NEON_V2_TEST_DATABASE_URL are required. No connection was attempted.\n');process.exit(1);}
if(!/^[a-z0-9-]+$/.test(projectId)||!/^br-[a-z0-9-]+$/.test(branchId)){writeSync(2,'FAIL: invalid Neon project or branch ID. No connection was attempted.\n');process.exit(1);}
async function neon(path:string){
 const response=await fetch(`https://console.neon.tech/api/v2${path}`,{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)throw Error('Neon management API rejected a metadata request');
 const result:unknown=await response.json();if(!result||typeof result!=='object')throw Error('Neon management metadata was invalid');return result;
}
class ValidationError extends Error {}
const check=(value:unknown,message:string)=>{if(!value)throw new ValidationError(message);};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const base=`/projects/${encodeURIComponent(projectId!)}`;
 const [project,branch,endpoints]=await Promise.all([neon(base),neon(`${base}/branches/${encodeURIComponent(branchId!)}`),neon(`${base}/endpoints`)]);
 const parentId=(branch as {branch?:{parent_id?:unknown}})?.branch?.parent_id;
 if(typeof parentId!=='string'||!/^br-[a-z0-9-]+$/.test(parentId)||parentId===branchId)throw new ValidationError('Neon parent branch ID is missing or invalid');
 const parent=await neon(`${base}/branches/${encodeURIComponent(parentId)}`);
 let config:ReturnType<typeof verifyV2TestBranch>;try{config=verifyV2TestBranch({projectId:projectId!,branchId:branchId!,databaseUrl:databaseUrl!,project,branch,parent,endpoints});}catch(error){throw new ValidationError(error instanceof Error?error.message:'Neon metadata could not be verified');}
 console.log('PASS: Neon API verified agentledger-os-db / agentledger-v2-test / direct neondb endpoint');
 const a=new Client(config),b=new Client(config);let connectedA=false,connectedB=false;let blocked:Promise<{rows?:unknown[];error?:unknown}>|undefined;
 const suffix=randomBytes(12).toString('hex'),owner=`v2-test-${suffix}.testnet`,contract=`v2-contract-${suffix}.testnet`,browser=`browser-${suffix}`,nonce=`nonce-${suffix}`,hash='11111111111111111111111111111111';
 const args=(key:string,ref:string,operation='create_request')=>[owner,key,contract,ref,'recipient.testnet','100',operation,JSON.stringify({signer:owner,contract,requestId:ref,paymentId:`v2-jp-${suffix}`,operation})];
 const claim=(client:Client,key:string,ref:string,operation='create_request')=>client.query('SELECT id,status,version FROM agentledger_v2.claim_judge_intent($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',args(key,ref,operation));
 try{
  await a.connect();connectedA=true;await b.connect();connectedB=true;
  const identity=await a.query('SELECT current_database() AS db,current_user AS role');check(identity.rows[0]?.db==='neondb'&&identity.rows[0]?.role===appRole,'Database name or application role did not match');
  const privileges=await a.query(`SELECT has_schema_privilege(current_user,'agentledger_v2','USAGE') AS schema_usage,
   has_table_privilege(current_user,'agentledger_v2.payment_intents','SELECT') AND has_table_privilege(current_user,'agentledger_v2.payment_intents','INSERT') AND has_table_privilege(current_user,'agentledger_v2.payment_intents','UPDATE') AS intents,
   has_table_privilege(current_user,'agentledger_v2.wallet_challenges','SELECT') AND has_table_privilege(current_user,'agentledger_v2.wallet_challenges','INSERT') AND has_table_privilege(current_user,'agentledger_v2.wallet_challenges','UPDATE') AS challenges,
   has_table_privilege(current_user,'agentledger_v2.wallet_sessions','SELECT') AND has_table_privilege(current_user,'agentledger_v2.wallet_sessions','INSERT') AND has_table_privilege(current_user,'agentledger_v2.wallet_sessions','DELETE') AS sessions,
   COALESCE(has_function_privilege(current_user,to_regprocedure('agentledger_v2.claim_judge_intent(text,text,text,text,text,text,text,jsonb)'),'EXECUTE'),false) AS judge_claim,
   COALESCE(has_function_privilege(current_user,to_regprocedure('agentledger_v2.claim_payment_intent(text,text,text,text,text,text,text,jsonb)'),'EXECUTE'),false) AS base_claim,
   COALESCE(has_function_privilege(current_user,to_regprocedure('agentledger_v2.transition_payment_intent(uuid,text,integer,text,text,text)'),'EXECUTE'),false) AS transition,
   COALESCE(has_function_privilege(current_user,to_regprocedure('agentledger_v2.consume_wallet_challenge(uuid,text)'),'EXECUTE'),false) AS consume`);
  check(Object.values(privileges.rows[0]||{}).every(x=>x===true),'Application-role V2 privileges are incomplete');console.log('PASS: application-role table, schema and function privileges');
  await a.query('BEGIN');await b.query('BEGIN');await a.query("SET LOCAL statement_timeout = '12s'");await b.query("SET LOCAL statement_timeout = '12s'");
  const first=await claim(a,`v2-first-${suffix}`,`v2-ref-${suffix}`);check(first.rows.length===1&&first.rows[0].status==='AWAITING_SIGNATURE','First claim failed');
  const pid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  blocked=claim(b,`v2-second-${suffix}`,`v2-other-${suffix}`).then(result=>({rows:result.rows}),error=>({error}));
  let waiting=false;for(let i=0;i<30;i++){const state=await a.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid]);if(state.rows[0]?.wait_event_type==='Lock'){waiting=true;break;}await pause(100);}
  check(waiting,'Concurrent claim did not wait on the transaction lock');
  const firstRow=first.rows[0];const wrong=await a.query('SELECT * FROM agentledger_v2.transition_payment_intent($1,$2,$3,$4,$5,$6)',[firstRow.id,`other-${suffix}.testnet`,firstRow.version,'AWAITING_SIGNATURE','UNKNOWN',null]);check(wrong.rows.length===0,'Another owner changed the intent');
  const unknown=await a.query('SELECT * FROM agentledger_v2.transition_payment_intent($1,$2,$3,$4,$5,$6)',[firstRow.id,owner,firstRow.version,'AWAITING_SIGNATURE','UNKNOWN',null]);check(unknown.rows.length===1,'UNKNOWN transition failed');check((await claim(a,`v2-third-${suffix}`,`v2-third-${suffix}`)).rows.length===0,'UNKNOWN did not block another claim');
  await a.query('ROLLBACK');const afterRollback=await blocked;blocked=undefined;check(!afterRollback.error&&afterRollback.rows?.length===1,'Waiting claim did not proceed after rollback');console.log('PASS: concurrent claims serialize; UNKNOWN blocks another claim; a mismatched owner parameter cannot transition');
  const second=(afterRollback.rows as Array<{id:string;version:number}>)[0];check((await claim(b,`v2-fourth-${suffix}`,`v2-fourth-${suffix}`)).rows.length===0,'Awaiting signature did not block another claim');
  const pending=await b.query('SELECT * FROM agentledger_v2.transition_payment_intent($1,$2,$3,$4,$5,$6)',[second.id,owner,second.version,'AWAITING_SIGNATURE','UNKNOWN',null]);check(pending.rows.length===1,'Second UNKNOWN transition failed');
  const saved=await b.query('SELECT * FROM agentledger_v2.transition_payment_intent($1,$2,$3,$4,$5,$6)',[second.id,owner,pending.rows[0].version,'UNKNOWN','SUBMITTED',hash]);check(saved.rows.length===1&&saved.rows[0].transaction_hash===hash,'Original hash was not retained');
  const altered=await b.query('SELECT * FROM agentledger_v2.transition_payment_intent($1,$2,$3,$4,$5,$6)',[second.id,owner,saved.rows[0].version,'SUBMITTED','CONFIRMED','22222222222222222222222222222222']);check(altered.rows.length===0,'A different hash replaced the original');
  const confirmed=await b.query('SELECT * FROM agentledger_v2.transition_payment_intent($1,$2,$3,$4,$5,$6)',[second.id,owner,saved.rows[0].version,'SUBMITTED','CONFIRMED',hash]);check(confirmed.rows.length===1,'Recovery transition failed');
  check((await claim(b,`v2-second-${suffix}`,`v2-other-${suffix}`)).rows.length===0,'Duplicate business key was claimed again');
  const ref=`v2-auth-${suffix}`;check((await claim(b,`v2-auth-key-${suffix}`,ref,'authorize')).rows.length===1,'Authorization claim failed');
  const duplicate=await b.query(`INSERT INTO agentledger_v2.payment_intents (business_key,owner_account,contract_account,payment_reference,operation,action_input) VALUES ($1,$2,$3,$4,'authorize','{}'::jsonb) ON CONFLICT DO NOTHING RETURNING id`,[`v2-duplicate-${suffix}`,owner,contract,ref]);check(duplicate.rows.length===0,'Duplicate authorization reference was inserted');
  const otherOwner=`v2-other-${suffix}.testnet`,otherKey=`v2-other-key-${suffix}`,otherRef=`v2-other-ref-${suffix}`;
  const recoveredCreate=await b.query('SELECT * FROM agentledger_v2.claim_judge_intent($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[otherOwner,otherKey,contract,otherRef,'recipient.testnet','100','create_request',JSON.stringify({operation:'create_request',requestId:otherRef})]);check(recoveredCreate.rows.length===1,'Synthetic recovery claim failed');
  const unknownCreate=await b.query('SELECT * FROM agentledger_v2.transition_payment_intent($1,$2,$3,$4,$5,$6)',[recoveredCreate.rows[0].id,otherOwner,recoveredCreate.rows[0].version,'AWAITING_SIGNATURE','UNKNOWN',null]);
  check(unknownCreate.rows.length===1,'Synthetic recovery UNKNOWN transition failed');
  const finalCreate=await b.query('SELECT * FROM agentledger_v2.transition_payment_intent($1,$2,$3,$4,$5,$6)',[unknownCreate.rows[0].id,otherOwner,unknownCreate.rows[0].version,'UNKNOWN','CONFIRMED',null]);
  check(finalCreate.rows.length===1,'Synthetic hashless recovery transition failed');
  console.log('PASS: recovery transitions retain the original hash; duplicate business keys and authorization references are rejected');
  const challenge=await b.query("INSERT INTO agentledger_v2.wallet_challenges(nonce,browser_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes') RETURNING id",[nonce,browser]);const duplicateChallenge=await b.query("INSERT INTO agentledger_v2.wallet_challenges(nonce,browser_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes') ON CONFLICT DO NOTHING RETURNING id",[nonce,browser]);check(duplicateChallenge.rows.length===0,'Duplicate challenge nonce was inserted');
  const challengeId=challenge.rows[0].id;check((await b.query('SELECT * FROM agentledger_v2.consume_wallet_challenge($1,$2)',[challengeId,'wrong-browser'])).rows.length===0,'Another browser consumed the challenge');check((await b.query('SELECT * FROM agentledger_v2.consume_wallet_challenge($1,$2)',[challengeId,browser])).rows.length===1,'Challenge could not be consumed');check((await b.query('SELECT * FROM agentledger_v2.consume_wallet_challenge($1,$2)',[challengeId,browser])).rows.length===0,'Challenge was reused');
  const token=`token-${suffix}`;await b.query("INSERT INTO agentledger_v2.wallet_sessions(token_hash,owner_account,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[token,owner]);const session=await b.query('SELECT owner_account FROM agentledger_v2.wallet_sessions WHERE token_hash=$1 AND expires_at>now()',[token]);check(session.rows.length===1&&session.rows[0].owner_account===owner,'Session owner mismatch');console.log('PASS: challenge uniqueness and single use; session binds its stored owner');
  console.log('NOTE: tests use synthetic intents only. PostgreSQL transitions do not verify blockchain results; backend recovery tests remain required.');
 }finally{
  if(connectedA)await a.query('ROLLBACK').catch(()=>{});
  if(blocked)await blocked.catch(()=>{});
  if(connectedB)await b.query('ROLLBACK').catch(()=>{});
  if(connectedA)await a.end().catch(()=>{});
  if(connectedB)await b.end().catch(()=>{});
 }
}
main().catch((error:unknown)=>{console.error(error instanceof ValidationError?`FAIL: ${error.message}`:'FAIL: Neon metadata, database connection or SQL validation failed. No connection details are printed.');process.exitCode=1;});
