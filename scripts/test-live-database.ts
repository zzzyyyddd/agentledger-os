import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {digest, session} from '../lib/server/database';
import {POST as updateIntent} from '../app/api/intents/update/route';
import {diagnostic} from './live-database-diagnostics';

// Deliberately excluded from the default test suite: this writes isolated fixtures to a real database.
async function main() {
 if (!process.env.DATABASE_URL) { console.error('FAIL DATABASE_URL is required'); process.exitCode=1; return; }
 if (process.env.PAYMENTS_ENABLED === 'true') { console.error('FAIL PAYMENTS_ENABLED must remain false'); process.exitCode=1; return; }
 process.env.APP_ORIGIN = 'http://localhost:3000';
 const namespace = `agentledger-live-${randomUUID()}`;
 const owner = `${namespace}-owner`, attacker = `${namespace}-attacker`;
 const nonce = `${namespace}-nonce`, browser = `${namespace}-browser`;
 const ownerToken = `${namespace}-owner-token`, attackerToken = `${namespace}-attacker-token`, expiredToken = `${namespace}-expired-token`;
 const clients = [new Client({connectionString:process.env.DATABASE_URL, connectionTimeoutMillis:10000}), new Client({connectionString:process.env.DATABASE_URL, connectionTimeoutMillis:10000})];
 let connected = false;
 let step = 'connect to PostgreSQL';
 const check = (name:string) => { console.log(`PASS ${name}`); };
 const expectCode = async (query:Promise<unknown>, code:string) => {
  try { await query; } catch (error) { if ((error as {code?:string})?.code === code) return; throw error; }
  throw new assert.AssertionError({message:'Expected PostgreSQL error was not raised'});
 };
 try {
  await Promise.all(clients.map(c => c.connect())); connected = true;
  const [a,b] = clients;
  step = 'verify distinct database connections';
  const backends = await Promise.all(clients.map(c => c.query('SELECT pg_backend_pid() AS pid, pg_sleep(0.2)')));
  assert.notEqual(backends[0].rows[0].pid,backends[1].rows[0].pid);
  step = 'inspect schema';
  const schema = await a.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name, ordinal_position", [['payment_intents','wallet_challenges','wallet_sessions']]);
  for (const [table, columns] of Object.entries({payment_intents:['id','business_key','owner_account','status','version'],wallet_challenges:['id','nonce','browser_hash','expires_at','used_at'],wallet_sessions:['token_hash','owner_account','expires_at']})) {
   for (const column of columns) assert(schema.rows.some(row => row.table_name === table && row.column_name === column), `Missing ${table}.${column}`);
  }
  console.log('Connected to PostgreSQL; inspected required public table columns.'); check('schema');
  step = 'challenge uniqueness and replay prevention';
  const challenge = await a.query("INSERT INTO public.wallet_challenges(nonce,browser_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes') RETURNING id",[nonce,browser]);
  await expectCode(a.query("INSERT INTO public.wallet_challenges(nonce,browser_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[nonce,browser]), '23505');
  assert.equal((await a.query('SELECT * FROM public.consume_wallet_challenge($1,$2)',[challenge.rows[0].id,`${browser}-wrong`])).rowCount,0);
  const consumed = await Promise.all(clients.map(c => c.query('SELECT * FROM public.consume_wallet_challenge($1,$2)',[challenge.rows[0].id,browser])));
  assert.deepEqual(consumed.map(r=>r.rowCount).sort(),[0,1]); check('challenge uniqueness and concurrent single-use replay prevention');
  step = 'session ownership and expiry through adapter';
  await a.query("INSERT INTO public.wallet_sessions(token_hash,owner_account,expires_at) VALUES ($1,$2,now()+interval '5 minutes'),($3,$4,now()+interval '5 minutes'),($5,$2,now()-interval '1 second')",[digest(ownerToken),owner,digest(attackerToken),attacker,digest(expiredToken)]);
  const request = (token:string) => new Request('http://localhost:3000/api/intents/update',{method:'POST',headers:{origin:'http://localhost:3000',cookie:`al_session=${token}`,'content-type':'application/json'},body:JSON.stringify({id:intentId,status:'UNKNOWN'})});
  assert.equal(await session(new Request('http://localhost',{headers:{cookie:`al_session=${ownerToken}`}})),owner);
  assert.equal(await session(new Request('http://localhost',{headers:{cookie:`al_session=${attackerToken}`}})),attacker);
  await assert.rejects(session(new Request('http://localhost',{headers:{cookie:`al_session=${expiredToken}`}})),/Authentication required/); check('session ownership and expiry through adapter');
  step = 'atomic claim: concurrent claim_payment_intent calls';
  const input = JSON.stringify({test:namespace});
  const args = [owner,`${namespace}-business`,`${namespace}-contract`,`${namespace}-reference`,null,null,'authorize',input];
  const claimSql = 'SELECT * FROM public.claim_payment_intent($1,$2,$3,$4,$5,$6,$7,$8::jsonb)';
  const results = await Promise.allSettled(clients.map(c=>c.query(claimSql,args)));
  const failed = results.find(result => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  const claims = results.map(result => { if (result.status === 'fulfilled') return result.value; throw Error('Unreachable'); });
  step = 'atomic claim: result counts';
  assert.deepEqual(claims.map(r=>r.rowCount).sort(),[0,1]);
  const claimed = claims.find(r=>r.rowCount===1)!.rows[0]; const intentId:string = claimed.id;
  step = 'atomic claim: returned state and version';
  assert.equal(claimed.status,'AWAITING_SIGNATURE'); assert.equal(claimed.version,1); check('atomic claim across distinct connections');
  step = 'payment intent unique constraints';
  await expectCode(a.query('INSERT INTO public.payment_intents(business_key,owner_account,contract_account,payment_reference,operation,action_input) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[args[1],owner,`${namespace}-other-contract`,`${namespace}-other-reference`,'authorize',input]),'23505');
  await expectCode(a.query('INSERT INTO public.payment_intents(business_key,owner_account,contract_account,payment_reference,operation,action_input) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[`${namespace}-other-business`,owner,args[2],args[3],'authorize',input]),'23505'); check('business key and authorization reference unique constraints');
  step = 'application API owner isolation';
  const attack = await updateIntent(request(attackerToken)); assert.equal(attack.status,400);
  assert.equal((await a.query('SELECT status,version FROM public.payment_intents WHERE id=$1 AND owner_account=$2',[intentId,owner])).rows[0].status,'AWAITING_SIGNATURE'); check('application API rejects another owner’s mutation');
  step = 'transition validity and optimistic concurrency';
  const transition = 'SELECT * FROM public.transition_payment_intent($1,$2,$3,$4,$5,$6)';
  await expectCode(a.query(transition,[intentId,owner,1,'AWAITING_SIGNATURE','CONFIRMED',null]),'P0001');
  await expectCode(a.query(transition,[intentId,owner,1,'AWAITING_SIGNATURE','SUBMITTED',null]),'P0001');
  assert.equal((await a.query(transition,[intentId,attacker,1,'AWAITING_SIGNATURE','UNKNOWN',null])).rowCount,0);
  const updated=await a.query(transition,[intentId,owner,1,'AWAITING_SIGNATURE','UNKNOWN',null]); assert.equal(updated.rowCount,1); assert.equal(updated.rows[0].version,2);
  assert.equal((await b.query(transition,[intentId,owner,1,'AWAITING_SIGNATURE','UNKNOWN',null])).rowCount,0); check('valid transitions, ownership and optimistic concurrency');
  step = 'UNKNOWN blocks duplicate claim';
  assert.equal((await b.query(claimSql,args)).rowCount,0);
  const current=await a.query('SELECT status,version FROM public.payment_intents WHERE id=$1 AND owner_account=$2',[intentId,owner]); assert.deepEqual(current.rows[0],{status:'UNKNOWN',version:2}); check('UNKNOWN blocks duplicate claim');
 } catch (error) {
  console.error(`FAIL ${step}: ${diagnostic(error)}`);
  process.exitCode=1;
 } finally {
  if (connected) {
   const c=clients[0];
   try {
    await c.query('BEGIN');
    await c.query('DELETE FROM public.payment_intents WHERE owner_account = $1 AND business_key = ANY($2::text[])',[owner,[`${namespace}-business`,`${namespace}-other-business`]]);
    await c.query('DELETE FROM public.wallet_challenges WHERE nonce = $1',[nonce]);
    await c.query('DELETE FROM public.wallet_sessions WHERE token_hash = ANY($1::text[]) AND owner_account = ANY($2::text[])',[[digest(ownerToken),digest(attackerToken),digest(expiredToken)],[owner,attacker]]);
    await c.query('COMMIT'); console.log('PASS transactional cleanup of this run’s fixtures');
   } catch (error) { await c.query('ROLLBACK').catch(()=>{}); console.error(`FAIL transactional cleanup: ${diagnostic(error)}; fixture namespace: ${namespace}`); process.exitCode=1; }
  }
  await Promise.allSettled(clients.map(c=>c.end()));
 }
}
main().catch(()=>{console.error('FAIL live database test (details suppressed to protect connection credentials)');process.exitCode=1;});
