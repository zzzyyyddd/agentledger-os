export type TransactionState = 'UNKNOWN'|'PENDING'|'FINAL_SUCCESS'|'FINAL_FAILURE';
export function classifyTransaction(value: unknown): TransactionState {
 if (!value || typeof value !== 'object') return 'UNKNOWN';
 const result=value as {final_execution_status?:unknown; status?:unknown};
 if (result.final_execution_status !== 'FINAL') return 'PENDING';
 if (!result.status || typeof result.status !== 'object') return 'UNKNOWN';
 if ('Failure' in result.status) return 'FINAL_FAILURE';
 if ('SuccessValue' in result.status) return 'FINAL_SUCCESS';
 return 'UNKNOWN';
}
export function validTxHash(hash:string):boolean {return /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(hash);}
export async function transactionStatus(hash:string,sender:string, fetcher:typeof fetch=fetch):Promise<TransactionState>{
 if (!validTxHash(hash) || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(sender)) throw new Error('Enter a valid hash and testnet sender.');
 try { const response=await fetcher('https://test.rpc.fastnear.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'agentledger',method:'tx',params:{tx_hash:hash,sender_account_id:sender,wait_until:'FINAL'}}),signal:AbortSignal.timeout(12000)});
  if(!response.ok) return 'UNKNOWN'; const data=await response.json(); return data.error?'UNKNOWN':classifyTransaction(data.result);
 } catch { return 'UNKNOWN'; }
}
