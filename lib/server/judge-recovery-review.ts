import {isTestnetAccountId} from '../near-account';
import {validTxHash} from '../transaction';
import {reconcileJudge} from './judge-reconcile';
import type {JudgeRow} from './judge-intents';

type ReviewTarget={id:string;owner:string;contract:string;requestId:string;hash?:string};
// An existing database row cannot prove that wallet handoff never happened.
// This is a read-only review: even a verified outcome does not release a lock.
export async function reviewJudgeRecovery(row:JudgeRow,target:ReviewTarget,fetcher:typeof fetch=fetch){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.id)||!isTestnetAccountId(target.owner)||!isTestnetAccountId(target.contract)||!/^[a-zA-Z0-9_-]{1,64}$/.test(target.requestId))throw Error('Invalid recovery target');
 const input=row.action_input;
 if(row.id!==target.id||row.owner_account!==target.owner||!input||input.signer!==target.owner||input.contract!==target.contract||input.requestId!==target.requestId||input.operation!=='create_request')throw Error('Recovery target does not match the saved intent');
 if(!['AWAITING_SIGNATURE','UNKNOWN','SUBMITTED'].includes(row.status))throw Error('Intent is not in a recoverable pending state');
 if(target.hash&&!validTxHash(target.hash))throw Error('Invalid transaction hash');
 if(row.transaction_hash&&target.hash&&row.transaction_hash!==target.hash)throw Error('Transaction hash conflicts with saved intent');
 const hash=row.transaction_hash||target.hash;
 if(hash&&!validTxHash(hash))throw Error('Invalid saved transaction hash');
 if(!hash)return {handoff:'POSSIBLY_BROADCAST' as const,outcome:'UNKNOWN' as const,lock:'RETAIN' as const,reason:'No transaction hash: missing history does not establish non-broadcast.'};
 const outcome=await reconcileJudge({...row,transaction_hash:hash},fetcher);
 return {handoff:'POSSIBLY_BROADCAST' as const,outcome,lock:'RETAIN' as const,reason:'Review the original transaction and other possible submissions before any separately approved recovery action.'};
}
