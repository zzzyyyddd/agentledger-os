import pg from 'pg';
import {readFileSync} from 'node:fs';
const {Client}=pg;
(async()=>{
 if(process.argv[2]!=='--confirm-empty-database' || process.argv.length!==3) throw Error('Use --confirm-empty-database only after verifying DATABASE_URL points to a new, dedicated empty database.');
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required.');
 let url;try{url=new URL(process.env.DATABASE_URL);}catch{throw Error('DATABASE_URL must be a PostgreSQL URL.');}
 if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('DATABASE_URL must be a PostgreSQL URL.');
 const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
 try{await client.connect();await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('agentledger_initial_migration'))");
 const {rows}=await client.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S') LIMIT 1");
 if(rows.length)throw Error('Public schema is not empty; refusing to migrate.');
 await client.query(readFileSync(new URL('../db/migrations/202611110001_payment_intents.sql',import.meta.url),'utf8'));await client.query('COMMIT');console.log('Initial migration applied.');
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{await client.end();}
})().catch(e=>{console.error('Migration failed:',e.message);process.exitCode=1;});
