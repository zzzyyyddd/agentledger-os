import {createHash, randomBytes} from 'node:crypto';
import {Pool} from 'pg';
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
function config(){
 const connectionString=process.env.V2_DATABASE_URL, origin=process.env.APP_ORIGIN;
 if(!connectionString||!origin)throw Error('V2_DATABASE_URL and APP_ORIGIN are required for durable payments');
 let url:URL, app:URL;try{url=new URL(connectionString);app=new URL(origin);}catch{throw Error('V2_DATABASE_URL or APP_ORIGIN is invalid');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='ep-quiet-math-a1y04117.ap-southeast-1.aws.neon.tech'||url.pathname!=='/neondb'||!url.username||!url.password||(url.port&&url.port!=='5432')||url.search!=='?sslmode=verify-full')throw Error('V2_DATABASE_URL must identify the isolated V2 branch with verified TLS');
 if(!['http:','https:'].includes(app.protocol)||app.origin!==origin||app.username||app.password)throw Error('APP_ORIGIN must be an exact HTTP(S) origin');
 if(process.env.NODE_ENV==='production' && app.protocol!=='https:')throw Error('APP_ORIGIN must use HTTPS in production');
 return connectionString;
}
export function configured(){try{config();return true;}catch{return false;}}
type Query=(sql:string,params:unknown[])=>Promise<unknown[]>;
let pool:Pool|undefined;let poolUrl:string|undefined;let mockQuery:Query|undefined;
// Test-only injection; never accepts a mock in a deployed runtime.
export function setQueryForTests(query?:Query){if(process.env.NODE_ENV!=='test')throw Error('Test only');mockQuery=query;}
export async function db(sql:string,params:unknown[]=[]):Promise<unknown[]>{
 const url=config();
 try{if(mockQuery&&process.env.NODE_ENV==='test')return await mockQuery(sql,params);
 if(!pool||poolUrl!==url){pool=new Pool({connectionString:url,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:10000});poolUrl=url;}
 return (await pool.query(sql,params)).rows;
 }catch{throw Error('Durable store unavailable');}
}
export function assertOrigin(request:Request){config();if(request.headers.get('origin')!==process.env.APP_ORIGIN)throw Error('Invalid request origin');}
export function cookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1);}
export async function session(request:Request){const t=cookie(request,'al_v2_session');if(!t)throw Error('Authentication required');const rows=await db('SELECT owner_account FROM agentledger_v2.wallet_sessions WHERE token_hash = $1 AND expires_at > now()',[digest(t)]) as {owner_account:string}[];if(rows.length!==1)throw Error('Authentication required');return rows[0].owner_account;}
export async function sessionExpiry(request:Request,owner:string){const t=cookie(request,'al_v2_session');if(!t)throw Error('Authentication required');const rows=await db('SELECT owner_account, expires_at FROM agentledger_v2.wallet_sessions WHERE token_hash = $1 AND expires_at > now()',[digest(t)]) as {owner_account:string;expires_at:Date|string}[];const expiry=rows.length===1?new Date(rows[0].expires_at).getTime():NaN;if(rows.length!==1||rows[0].owner_account!==owner||!Number.isFinite(expiry)||expiry<=Date.now())throw Error('Authentication required');return expiry;}
export function cookieHeader(name:string,value:string,maxAge:number){return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;}
export function failure(error:unknown){return Response.json({error:error instanceof Error?error.message:'Request failed'},{status:400,headers:{'Cache-Control':'no-store'}});}
