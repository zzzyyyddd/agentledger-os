import type {prepareAction} from '@/lib/payment';
import type {prepareJudgeAction} from '@/lib/judge-payment';

export const TESTNET_CONTRACT='agentledger-treasury.testnet';
export const WALLET_CHANGED='agentledger:wallet-changed';

// No provider is installed during migration. These interfaces keep the existing
// payment and identity flows testable without enabling wallet operations.
type Wallet={
 manifest:{id?:string;features:{signMessage:boolean;signAndSendTransaction:boolean}};
 signMessage:(input:{message:string;recipient:string;nonce:Uint8Array;network:string;signerId:string})=>Promise<{accountId:string;publicKey:string;signature:string}|undefined>;
 signAndSendTransaction:(action:ReturnType<typeof prepareAction>|ReturnType<typeof prepareJudgeAction>)=>Promise<{transaction?:{hash?:string}}|void>;
};
export async function connectedAccount():Promise<{account:string;wallet:Wallet;accounts:string[]}>{
 throw Error('Wallet integration under migration');
}
