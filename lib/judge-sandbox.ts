export type SandboxEscrow='none'|'funded'|'authorized'|'completed';
export function advanceSandbox(state:SandboxEscrow, action:'fund'|'authorize'|'settle', permitted:boolean):SandboxEscrow {
 if(!permitted)return state;
 if(state==='none'&&action==='fund')return 'funded';
 if(state==='funded'&&action==='authorize')return 'authorized';
 if(state==='authorized'&&action==='settle')return 'completed';
 return state;
}
