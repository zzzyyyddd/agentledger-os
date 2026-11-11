import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {digest,setQueryForTests} from '../lib/server/database';
import {POST as claim} from '../app/api/intents/claim/route';
import {POST as update} from '../app/api/intents/update/route';
const owner='owner.testnet', id='00000000-0000-4000-8000-000000000001';
const input={operation:'create_request',contract:'treasury.testnet',signer:owner,requestId:'request-1',expiryNs:'2000000000000000000',amount:'100'};
const request=(url:string,body:unknown,session='token')=>new Request(`http://localhost:3000${url}`,{method:'POST',headers:{origin:'http://localhost:3000',cookie:`al_session=${session}`,'content-type':'application/json'},body:JSON.stringify(body)});
test('API integration: concurrent claims, ownership and timeout recovery remain locked',async()=>{const oldFetch=globalThis.fetch,old={...process.env};Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'postgresql://user:pass@localhost/test',APP_ORIGIN:'http://localhost:3000',PAYMENTS_ENABLED:'true'});let record:Record<string,unknown>|undefined;
 globalThis.fetch=async (_url,init)=>{const q=JSON.parse(String(init?.body));const value=q.params.method_name==='get_roles'?[owner,owner]:null;return Response.json({result:{result:[...Buffer.from(JSON.stringify(value))]}})};
 setQueryForTests(async (sql,p)=>{
 if(sql.includes('wallet_sessions'))return [{owner_account:p[0]===digest('token')?owner:'attacker.testnet'}];
 if(sql.includes('claim_payment_intent')){if(record)return [];record={id,owner_account:p[0],business_key:p[1],status:'AWAITING_SIGNATURE',version:1,transaction_hash:null,action_input:JSON.parse(String(p[7]))};return [record];}
 if(sql.includes('FROM public.payment_intents'))return record&&p[1]===owner?[record]:[];
 if(sql.includes('transition_payment_intent')){if(!record||record.version!==p[2]||record.status!==p[3])return [];record={...record,status:p[4],version:Number(record.version)+1,transaction_hash:p[5]};return [record];}throw Error('Unexpected query');});
 try{const results=await Promise.all([claim(request('/api/intents/claim',{input})),claim(request('/api/intents/claim',{input}))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);const attack=await update(request('/api/intents/update',{id,status:'UNKNOWN'},'attacker'));assert.equal(attack.status,400);const timeout=await update(request('/api/intents/update',{id,status:'UNKNOWN'}));assert.equal(timeout.status,200);assert.equal(record?.status,'UNKNOWN');const duplicate=await claim(request('/api/intents/claim',{input}));assert.equal(duplicate.status,400);}finally{setQueryForTests();globalThis.fetch=oldFetch;process.env=old;}});
