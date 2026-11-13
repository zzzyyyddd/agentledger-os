import {actionCreators} from '@near-js/transactions';
import {isTestnetAccountId} from './near-account';

export const JUDGE_STORAGE_FEE=30_000_000_000_000_000_000_000n;
export const JUDGE_MAX_BUDGET=100_000_000_000_000_000_000_000n;
export const JUDGE_INITIAL_MAX_BUDGET=10_000_000_000_000_000_000_000n;
export const JUDGE_INITIAL_MAX_DEPOSIT=JUDGE_INITIAL_MAX_BUDGET+JUDGE_STORAGE_FEE;
export type JudgeOperation='create_request'|'authorize'|'execute'|'refund';
export type JudgeReview={title:string;expectedRevenue:string};
export type JudgeInput={operation:JudgeOperation;contract:string;signer:string;requestId:string;paymentId:string;vendor:string;amount:string;expiryNs:string;review:JudgeReview};
const id=(v:string)=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(v))throw Error('Invalid request or payment ID');return v;};
const amount=(v:string,max=(1n<<128n)-1n)=>{if(typeof v!=='string'||!/^[1-9]\d*$/.test(v)||BigInt(v)>max)throw Error('Invalid amount');return BigInt(v);};
export function prepareJudgeAction(i:JudgeInput){
 if(!i||!['create_request','authorize','execute','refund'].includes(i.operation))throw Error('Invalid operation');
 if(!isTestnetAccountId(i.contract)||!isTestnetAccountId(i.signer)||!isTestnetAccountId(i.vendor))throw Error('Invalid Testnet account');
 id(i.requestId);id(i.paymentId);const budget=amount(i.amount,JUDGE_MAX_BUDGET);amount(i.expiryNs,(1n<<64n)-1n);
 if(!i.review||typeof i.review.title!=='string'||!i.review.title.trim()||i.review.title.length>120)throw Error('A purchase description is required');
 amount(i.review.expectedRevenue,10n**31n);
 let args:object;let deposit=0n;
 switch(i.operation){
 case 'create_request':args={request_id:i.requestId,payment_id:i.paymentId,expiry_ns:i.expiryNs,vendor:i.vendor,budget:i.amount};deposit=budget+JUDGE_STORAGE_FEE;break;
 case 'authorize':args={request_id:i.requestId,payment_id:i.paymentId,vendor:i.vendor,amount:i.amount};break;
 default:args={request_id:i.requestId};
 }
 return {receiverId:i.contract,signerId:i.signer,actions:[actionCreators.functionCall(i.operation,args,100_000_000_000_000n,deposit)]};
}

// Applies to new wallet handoffs, while historical verification retains the
// contract's wider original limit so older transactions can be reconciled.
export function assertInitialSigningLimit(i:JudgeInput){
 const action=prepareJudgeAction(i).actions[0].functionCall!;
 if(i.operation==='create_request'&&(BigInt(i.amount)>JUDGE_INITIAL_MAX_BUDGET||action.deposit!==BigInt(i.amount)+JUDGE_STORAGE_FEE||action.deposit>JUDGE_INITIAL_MAX_DEPOSIT))throw Error('Initial payment exceeds the 0.01 NEAR amount or 0.04 NEAR deposit limit');
 if(i.operation!=='create_request'&&action.deposit!==0n)throw Error('Unexpected attached deposit');
}

// Deterministic advisory analysis. Contract-enforced constraints remain separate.
export function judgeAssessment(i:JudgeInput){
 prepareJudgeAction(i);
 const revenue=BigInt(i.review.expectedRevenue),cost=BigInt(i.amount);
 return {purchase:i.review.title.trim(),recommendedVendor:i.vendor,amount:i.amount,expectedRevenue:i.review.expectedRevenue,marginBasisPoints:((revenue-cost)*10000n/revenue).toString(),guardian:{recipientBound:true,amountWithinContractCap:true,ownerApprovalRequired:true,expiryRecheckedOnchain:true},advisory:true};
}
