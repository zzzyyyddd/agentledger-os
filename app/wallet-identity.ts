import {decodeChallengeNonce} from '@/lib/challenge-nonce';
import {connectedAccount} from './wallet-selector';

type WalletConnection=Awaited<ReturnType<typeof connectedAccount>>;
type Dependencies={connect:()=>Promise<WalletConnection>;request:typeof fetch};
const defaults:Dependencies={connect:connectedAccount,request:(...args)=>fetch(...args)};
async function json(request:typeof fetch,url:string,body?:unknown){const response=await request(url,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Identity service unavailable');return data;}
export type IdentityState={account:string|null;verified:boolean;configured:boolean;signingEnabled:boolean};

// A bearer session belongs only to the currently connected wallet. End it when
// the wallet changes or disconnects; never display an unmatched session as verified.
export async function readWalletIdentity(deps:Dependencies=defaults,isCurrent:()=>boolean=()=>true):Promise<IdentityState>{
 const session=await json(deps.request,'/api/auth/session');
 let connection:WalletConnection|null;
 try{connection=await deps.connect();}catch(error){
  const message=error instanceof Error?error.message:'';
  if(!/no wallet selected|no accounts found|wallet is not supported|switch your wallet to near testnet/i.test(message))throw error;
  connection=null;
 }
 const account=connection?.account??null;
 if(session.accountId&&session.accountId!==account&&isCurrent())await json(deps.request,'/api/auth/logout',{});
 const verified=!!account&&session.accountId===account;
 return {account,verified,configured:!!session.configured,signingEnabled:verified&&!!session.signingEnabled};
}

// Only called by the explicit Verify identity button.
export async function verifyWalletIdentity(deps:Dependencies=defaults):Promise<string>{
 const {wallet,account}=await deps.connect();
 if(!wallet.manifest.features.signMessage)throw Error('This wallet does not support message signing');
 const challenge=await json(deps.request,'/api/auth/challenge',{});
 const signed=await wallet.signMessage({message:challenge.message,recipient:challenge.recipient,nonce:decodeChallengeNonce(challenge.nonce),network:'testnet',signerId:account});
 if(!signed||signed.accountId!==account||(await deps.connect()).account!==account)throw Error('Wallet account changed. Reconnect and try a new challenge.');
 await json(deps.request,'/api/auth/verify',{id:challenge.id,...signed});
 // If the wallet changes during server verification, revoke the newly issued session.
 if((await deps.connect().catch(()=>null))?.account!==account){await json(deps.request,'/api/auth/logout',{});throw Error('Wallet account changed. Reconnect and try a new challenge.');}
 return account;
}
