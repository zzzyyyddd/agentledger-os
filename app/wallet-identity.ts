import {decodeChallengeNonce} from '@/lib/challenge-nonce';
import {connectedAccount} from './wallet-migration';

type WalletConnection=Awaited<ReturnType<typeof connectedAccount>>;
type Dependencies={connect:()=>Promise<WalletConnection>;request:typeof fetch};
const defaults:Dependencies={connect:connectedAccount,request:(...args)=>fetch(...args)};
async function json(request:typeof fetch,url:string,body?:unknown){const response=await request(url,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Identity service unavailable');return data;}
export type IdentityState={account:string|null;verified:boolean;configured:boolean;signingEnabled:boolean;messageSigningSupported:boolean};

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
 return {account,verified,configured:session.configured===true,signingEnabled:verified&&!!session.signingEnabled,messageSigningSupported:connection?.wallet.manifest.features.signMessage===true};
}

// Only called by the explicit Verify identity button.
export async function verifyWalletIdentity(deps:Dependencies=defaults):Promise<string>{
 const {wallet,account}=await deps.connect();
 if(!wallet.manifest.features.signMessage)throw Error('This wallet does not support NEP-413 message signing. Switch to a compatible wallet.');
 const walletId=wallet.manifest.id;
 const challenge=await json(deps.request,'/api/auth/challenge',{});
 let signed:Awaited<ReturnType<typeof wallet.signMessage>>;
 try{signed=await wallet.signMessage({message:challenge.message,recipient:challenge.recipient,nonce:decodeChallengeNonce(challenge.nonce),network:'testnet',signerId:account});}
 catch(error){if(error instanceof Error&&/not supported|unsupported|not implemented|signMessage is not a function/i.test(error.message))throw Error('This wallet cannot sign NEP-413 messages. Switch to a compatible wallet.');throw error;}
 const current=await deps.connect();
 if(!signed||signed.accountId!==account||current.account!==account||current.wallet.manifest.id!==walletId)throw Error('Wallet or account changed. Reconnect and try a new challenge.');
 await json(deps.request,'/api/auth/verify',{id:challenge.id,...signed});
 // If the wallet changes during server verification, revoke the newly issued session.
 const after=await deps.connect().catch(()=>null);
 if(after?.account!==account||after.wallet.manifest.id!==walletId){await json(deps.request,'/api/auth/logout',{});throw Error('Wallet or account changed. Reconnect and try a new challenge.');}
 return account;
}
