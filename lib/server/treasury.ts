import {createHash} from 'node:crypto';
import {EXPECTED_WASM_SHA256,TREASURY_ACCOUNT,type TreasuryErrorCode,type TreasurySnapshot} from '../treasury';
const RPC='https://test.rpc.fastnear.com';
const EMPTY_CODE='11111111111111111111111111111111';
const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export class TreasuryError extends Error{constructor(public code:TreasuryErrorCode){super(code);}}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new TreasuryError('MALFORMED_RESPONSE');return value as Record<string,unknown>;}
function digits(value:unknown):string{if(typeof value!=='string'||!/^(0|[1-9]\d{0,38})$/.test(value))throw new TreasuryError('MALFORMED_RESPONSE');return value;}
function hash58(bytes:Buffer){let n=BigInt(`0x${bytes.toString('hex')}`),out='';while(n>0n){out=ALPHABET[Number(n%58n)]+out;n/=58n;}for(const b of bytes){if(b!==0)break;out='1'+out;}return out;}
async function rpc(method:string,params:unknown,fetcher:typeof fetch):Promise<unknown>{
 const signal=AbortSignal.timeout(8000);
 let response:Response;try{response=await fetcher(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'treasury-read',method,params}),cache:'no-store',signal});}catch{throw new TreasuryError('RPC_UNAVAILABLE');}
 if(!response.ok)throw new TreasuryError('RPC_UNAVAILABLE');
 let body:Record<string,unknown>;try{const text=await response.text();if(text.length>8_000_000)throw Error();body=record(JSON.parse(text));}catch{throw new TreasuryError(signal.aborted?'RPC_UNAVAILABLE':'MALFORMED_RESPONSE');}
 if(body.error){const error=record(body.error);const cause=error.cause&&typeof error.cause==='object'?record(error.cause):{};if(cause.name==='UNKNOWN_ACCOUNT')throw new TreasuryError('ACCOUNT_MISSING');throw new TreasuryError('RPC_UNAVAILABLE');}
 if(!('result' in body))throw new TreasuryError('MALFORMED_RESPONSE');return body.result;
}
function atBlock(value:unknown,hash:string){const result=record(value);if(result.block_hash!==hash)throw new TreasuryError('MALFORMED_RESPONSE');return result;}
function viewValue(value:unknown,hash:string){const result=atBlock(value,hash);if(!Array.isArray(result.result)||result.result.length>10000||!result.result.every((v:unknown)=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=255))throw new TreasuryError('MALFORMED_RESPONSE');try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(result.result as number[])));}catch{throw new TreasuryError('MALFORMED_RESPONSE');}}
const query=(request_type:string,hash:string,extra:Record<string,unknown>={})=>({request_type,account_id:TREASURY_ACCOUNT,block_id:hash,...extra});
export async function readTreasury(fetcher:typeof fetch=fetch):Promise<TreasurySnapshot>{
 const [status,block]=await Promise.all([rpc('status',[],fetcher),rpc('block',{finality:'final'},fetcher)]);
 if(record(status).chain_id!=='testnet')throw new TreasuryError('WRONG_NETWORK');
 const header=record(record(block).header),hash=header.hash,height=header.height;
 if(typeof hash!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(hash)||!Number.isSafeInteger(height)||Number(height)<0)throw new TreasuryError('MALFORMED_RESPONSE');
 const blockMillis=BigInt(digits(header.timestamp_nanosec))/1000000n;
 if(blockMillis>8640000000000000n)throw new TreasuryError('MALFORMED_RESPONSE');
 const blockTime=new Date(Number(blockMillis)).toISOString();
 const account=atBlock(await rpc('query',query('view_account',hash),fetcher),hash);
 const balance=digits(account.amount),storageBytes=account.storage_usage,codeHash=account.code_hash;
 if(!Number.isSafeInteger(storageBytes)||Number(storageBytes)<0||typeof codeHash!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(codeHash))throw new TreasuryError('MALFORMED_RESPONSE');
 const view=(method_name:string)=>rpc('query',query('call_function',hash,{method_name,args_base64:'e30='}),fetcher);
 const [rolesResult,liabilitiesResult,codeResult,protocolResult]=await Promise.allSettled([
  view('get_roles'),view('get_liabilities'),rpc('query',query('view_code',hash),fetcher),rpc('EXPERIMENTAL_protocol_config',{block_id:hash},fetcher)
 ]);
 let roles:TreasurySnapshot['roles']=null,liabilitiesYocto:string|null=null,storageYocto:string|null=null;
 let code:TreasurySnapshot['code']={status:codeHash===EMPTY_CODE?'missing':'unverified',sha256:null};
 if(codeHash!==EMPTY_CODE&&rolesResult.status==='fulfilled')try{const value=viewValue(rolesResult.value,hash);if(Array.isArray(value)&&value.length===2&&value.every(v=>typeof v==='string'&&v.length>=2&&v.length<=64&&/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(v)))roles={owner:value[0],operator:value[1]};}catch{}
 if(codeHash!==EMPTY_CODE&&liabilitiesResult.status==='fulfilled')try{liabilitiesYocto=digits(viewValue(liabilitiesResult.value,hash));}catch{}
 if(protocolResult.status==='fulfilled')try{const config=record(protocolResult.value);if(config.chain_id==='testnet'){const cost=digits(record(config.runtime_config).storage_amount_per_byte);storageYocto=(BigInt(Number(storageBytes))*BigInt(cost)).toString();}}catch{}
 if(codeHash!==EMPTY_CODE&&codeResult.status==='fulfilled')try{
  const data=atBlock(codeResult.value,hash),encoded=data.code_base64;
  if(typeof encoded!=='string'||encoded.length>6_000_000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)||!encoded.length)throw Error();
  const digest=createHash('sha256').update(Buffer.from(encoded,'base64')).digest();const actual=digest.toString('hex');
  if(data.hash===codeHash&&hash58(digest)===codeHash)code={status:actual===EXPECTED_WASM_SHA256?'match':'mismatch',sha256:actual};
 }catch{}
 return {account:TREASURY_ACCOUNT,network:'testnet',blockHeight:Number(height),blockTime,observedAt:new Date().toISOString(),balanceYocto:balance,storageYocto,roles,liabilitiesYocto,code};
}
