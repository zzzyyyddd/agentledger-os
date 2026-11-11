import {createHash} from 'node:crypto';
import {PublicKey} from '@near-js/crypto';
export const AUTH_MESSAGE='Sign in to AgentLedger OS on NEAR Testnet. This does not submit a transaction.';
const str=(s:string)=>{const b=Buffer.from(s,'utf8');const n=Buffer.alloc(4);n.writeUInt32LE(b.length);return Buffer.concat([n,b]);};
export function authDigest(nonce:string,recipient:string,callbackUrl:string){const n=Buffer.from(nonce,'base64url');if(n.length!==32)throw Error('Invalid challenge');const tag=Buffer.alloc(4);tag.writeUInt32LE(2147484061);return createHash('sha256').update(Buffer.concat([tag,str(AUTH_MESSAGE),n,str(recipient),Buffer.from([1]),str(callbackUrl)])).digest();}
export async function verifySignature(account:string,publicKey:string,signature:string,nonce:string,fetcher:typeof fetch=fetch){
 if(!/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(account)||account.length>64||!publicKey.startsWith('ed25519:'))throw Error('Invalid wallet identity');
 const origin=new URL(process.env.APP_ORIGIN!).origin; const sig=Buffer.from(signature,'base64');if(sig.length!==64||!PublicKey.fromString(publicKey).verify(authDigest(nonce,new URL(origin).host,`${origin}/`),sig))throw Error('Invalid wallet signature');
 const response=await fetcher('https://test.rpc.fastnear.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'auth',method:'query',params:{request_type:'view_access_key',finality:'final',account_id:account,public_key:publicKey}}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Unable to verify access key');const data=await response.json();if(data.error||data.result?.permission!=='FullAccess')throw Error('A current full-access key is required');
}
