import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {formatNear,isTreasuryStale,TREASURY_ACCOUNT} from '../lib/treasury';
import {readTreasury,TreasuryError} from '../lib/server/treasury';
import {TreasuryDashboard,TreasuryDetails} from '../app/treasury-dashboard';
import {GET as treasuryRoute} from '../app/api/treasury/route';

const hash='11111111111111111111111111111112';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes:Buffer){let n=BigInt('0x'+bytes.toString('hex')),s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const b of bytes){if(b)break;s='1'+s;}return s;}
const wasm=Buffer.from('sandbox-contract-code'),codeHash=base58(createHash('sha256').update(wasm).digest());
const bytes=(value:unknown)=>[...Buffer.from(JSON.stringify(value))];
type Options={missing?:boolean;wrongNetwork?:boolean;badBalance?:boolean;rolesFail?:boolean;liabilitiesBad?:boolean;codeFail?:boolean;codeMismatch?:boolean;protocolFail?:boolean;wrongBlock?:boolean;timeout?:boolean;noCode?:boolean};
function mock(options:Options={}){
 const seen:{method:string;params:Record<string,unknown>}[]=[];
 const fetcher:typeof fetch=async(_url,init)=>{
  assert.equal(init?.method,'POST');assert(init?.signal);assert.equal(init?.cache,'no-store');
  if(options.timeout)throw Error('timeout');
  const {method,params}=JSON.parse(String(init?.body));seen.push({method,params});
  const ok=(result:unknown)=>Response.json({jsonrpc:'2.0',result,id:'treasury-read'});
  const fail=(name='INTERNAL_ERROR')=>Response.json({jsonrpc:'2.0',error:{cause:{name}},id:'treasury-read'});
  if(method==='status')return ok({chain_id:options.wrongNetwork?'mainnet':'testnet'});
  if(method==='block')return ok({header:{hash,height:123,timestamp_nanosec:String(BigInt(Date.now())*1000000n)}});
  if(method==='EXPERIMENTAL_protocol_config'){assert.equal(params.block_id,hash);return options.protocolFail?fail():ok({chain_id:'testnet',runtime_config:{storage_amount_per_byte:'10000000000000000000'}});}
  assert.equal(method,'query');assert.equal(params.account_id,TREASURY_ACCOUNT);assert.equal(params.block_id,hash);
  const block_hash=options.wrongBlock?'11111111111111111111111111111113':hash;
  if(params.request_type==='view_account')return options.missing?fail('UNKNOWN_ACCOUNT'):ok({block_hash,amount:options.badBalance?1:'10000000000000000000000000',storage_usage:100,code_hash:options.noCode?'11111111111111111111111111111111':codeHash});
  if(params.request_type==='view_code')return options.codeFail?fail():ok({block_hash,hash:options.codeMismatch?'11111111111111111111111111111113':codeHash,code_base64:wasm.toString('base64')});
  if(params.method_name==='get_roles')return options.rolesFail?fail():ok({block_hash,result:bytes(['agentledger-owner.testnet','agentledger-operator.testnet'])});
  if(params.method_name==='get_liabilities')return ok({block_hash,result:bytes(options.liabilitiesBad?10:'500000000000000000000000')});
  throw Error('Unexpected RPC method');
 };
 return {fetcher,seen};
}
test('formats yoctoNEAR exactly without floating point',()=>{assert.equal(formatNear('0'),'0');assert.equal(formatNear('1'),'0.000000000000000000000001');assert.equal(formatNear('123456789012345678901234567890123456789'),'123,456,789,012,345.678901234567890123456789');assert.throws(()=>formatNear('-1'));assert.throws(()=>formatNear('1e24'));});
test('reads only finalized Testnet data and verifies code bytes against account hash',async()=>{const {fetcher,seen}=mock();const snapshot=await readTreasury(fetcher);assert.equal(snapshot.blockHeight,123);assert.equal(snapshot.balanceYocto,'10000000000000000000000000');assert.equal(snapshot.storageYocto,'1000000000000000000000');assert.equal(snapshot.liabilitiesYocto,'500000000000000000000000');assert.equal(snapshot.roles?.owner,'agentledger-owner.testnet');assert.equal(snapshot.code.status,'mismatch');assert.equal(snapshot.code.sha256,createHash('sha256').update(wasm).digest('hex'));assert.deepEqual(seen.map(x=>x.method).sort(),['EXPERIMENTAL_protocol_config','block','query','query','query','query','status'].sort());});
test('missing account, wrong network, timeout and malformed account fail safely',async()=>{for(const [options,code] of [[{missing:true},'ACCOUNT_MISSING'],[{wrongNetwork:true},'WRONG_NETWORK'],[{timeout:true},'RPC_UNAVAILABLE'],[{badBalance:true},'MALFORMED_RESPONSE'],[{wrongBlock:true},'MALFORMED_RESPONSE']] as const){await assert.rejects(readTreasury(mock(options).fetcher),(e:unknown)=>e instanceof TreasuryError&&e.code===code);}});
test('view, code and protocol failures never fabricate live values',async()=>{const data=await readTreasury(mock({rolesFail:true,liabilitiesBad:true,codeFail:true,protocolFail:true}).fetcher);assert.equal(data.roles,null);assert.equal(data.liabilitiesYocto,null);assert.equal(data.storageYocto,null);assert.deepEqual(data.code,{status:'unverified',sha256:null});const mismatched=await readTreasury(mock({codeMismatch:true}).fetcher);assert.deepEqual(mismatched.code,{status:'unverified',sha256:null});const missing=await readTreasury(mock({noCode:true}).fetcher);assert.equal(missing.code.status,'missing');assert.equal(missing.roles,null);assert.equal(missing.liabilitiesYocto,null);});
test('initial rendering shows a loading state and no fabricated balance',()=>{const html=renderToStaticMarkup(createElement(TreasuryDashboard));assert.match(html,/Loading finalized treasury data/);assert.doesNotMatch(html,/10 NEAR|verified expected WASM/);});
test('partial snapshot rendering labels unavailable fields and does not claim code verification',async()=>{const data=await readTreasury(mock({rolesFail:true,liabilitiesBad:true,codeFail:true,protocolFail:true}).fetcher);const html=renderToStaticMarkup(createElement(TreasuryDetails,{data}));assert.match(html,/Unverified/);assert((html.match(/Unavailable/g)||[]).length>=4);assert.match(html,/not a spendable balance/);assert.doesNotMatch(html,/verified expected WASM/);});
test('stale status covers failed refresh and old finalized blocks',async()=>{const data=await readTreasury(mock().fetcher);const now=Date.parse(data.observedAt);assert.equal(isTreasuryStale(data,now,false),false);assert.equal(isTreasuryStale(data,now,true),true);assert.equal(isTreasuryStale({...data,blockTime:new Date(now-121000).toISOString()},now,false),true);assert.equal(isTreasuryStale(data,now+121000,false),true);});
test('legacy treasury endpoint is retired',async()=>{assert.equal((await treasuryRoute(new Request('http://localhost'))).status,410);});
