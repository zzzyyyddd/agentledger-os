import {randomUUID} from 'node:crypto';
import {readTreasury} from '../lib/server/treasury';
import {EXPECTED_OPERATOR,EXPECTED_OWNER,TREASURY_ACCOUNT,formatNear} from '../lib/treasury';

// Public Testnet reads only. No wallet, credentials, database or transaction APIs.
const RPC='https://test.rpc.fastnear.com';
const CANDIDATE_VENDOR='agentledger-demo-user.testnet';
let step='finalized treasury snapshot';
async function rpc(method:string,params:object){const response=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'phase11',method,params}),signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('RPC unavailable');const data=await response.json();if(data.error||!data.result)throw Error('RPC query failed');return data.result;}
async function view(method_name:string,args:object,block_id:number){const data=await rpc('query',{request_type:'call_function',account_id:TREASURY_ACCOUNT,method_name,args_base64:Buffer.from(JSON.stringify(args)).toString('base64'),block_id});if(!Array.isArray(data.result))throw Error('Invalid contract response');return JSON.parse(Buffer.from(data.result).toString('utf8'));}
async function account(account_id:string,block_id:number){const data=await rpc('query',{request_type:'view_account',account_id,block_id});if(typeof data.amount!=='string'||!/^\d+$/.test(data.amount))throw Error('Invalid account response');return {balanceNear:formatNear(data.amount),storageBytes:data.storage_usage};}
async function main(){
 const snapshot=await readTreasury();
 const id=randomUUID(),requestId=`phase11-${id}`,paymentId=`phase11-pay-${id}`;
 step='account, vendor, identifiers and protocol reads';
 const [owner,demo,vendorAllowed,request,payment,protocol]=await Promise.all([
  account(EXPECTED_OWNER,snapshot.blockHeight),account(CANDIDATE_VENDOR,snapshot.blockHeight),
  view('is_vendor_allowed',{vendor:CANDIDATE_VENDOR},snapshot.blockHeight),
  view('get_request',{request_id:requestId},snapshot.blockHeight),view('get_payment_request',{payment_id:paymentId},snapshot.blockHeight),
  rpc('EXPERIMENTAL_protocol_config',{block_id:snapshot.blockHeight})
 ]);
 if(typeof vendorAllowed!=='boolean'||request!==null||payment!==null)throw Error('Preflight returned unexpected vendor or identifier state');
 step='storage and liabilities validation';
 const cost=protocol?.runtime_config?.storage_amount_per_byte;
 if(protocol.chain_id!=='testnet'||typeof cost!=='string'||!/^\d+$/.test(cost)||snapshot.storageYocto===null||snapshot.liabilitiesYocto===null)throw Error('Storage or liability data unavailable');
 const guard=BigInt(snapshot.storageYocto)+2048n*BigInt(cost),required=guard+BigInt(snapshot.liabilitiesYocto);
 console.log(JSON.stringify({network:snapshot.network,blockHeight:snapshot.blockHeight,blockTime:snapshot.blockTime,contract:snapshot.account,code:snapshot.code,roles:snapshot.roles,expectedRolesMatch:snapshot.roles?.owner===EXPECTED_OWNER&&snapshot.roles?.operator===EXPECTED_OPERATOR,treasuryBalanceNear:formatNear(snapshot.balanceYocto),storageBackingNear:formatNear(snapshot.storageYocto),contractStorageGuardNear:formatNear(guard.toString()),liabilitiesNear:formatNear(snapshot.liabilitiesYocto),balanceCoversStorageGuardAndLiabilities:BigInt(snapshot.balanceYocto)>=required,owner,demoUser:demo,candidateVendor:CANDIDATE_VENDOR,candidateVendorAllowed:vendorAllowed,requestId,paymentId,idsAbsentAtSnapshot:true,paymentSigning:'not checked; this script never signs'},null,2));
}
main().catch(()=>{console.error(`Read-only preflight failed at ${step}; no conclusions can be drawn from missing data.`);process.exitCode=1;});
