/** Fail closed unless Neon management metadata maps this exact direct endpoint to the requested non-default child branch. */
export function verifyV2TestBranch(input:{projectId:string;branchId:string;databaseUrl:string;project:unknown;branch:unknown;parent:unknown;endpoints:unknown}) {
 const {projectId,branchId,databaseUrl}=input;
 if(!/^[a-z0-9-]+$/.test(projectId)||!/^br-[a-z0-9-]+$/.test(branchId))throw Error('Invalid project or branch identifier');
 let url:URL;try{url=new URL(databaseUrl);}catch{throw Error('Invalid test database URL');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.pathname!=='/neondb'||!url.username||!url.password||!url.hostname.endsWith('.neon.tech')||url.hostname.includes('-pooler.')||(url.port&&url.port!=='5432'))throw Error('A direct neondb Neon endpoint is required');
 for(const [key,value] of url.searchParams){if(key!=='sslmode'||value!=='verify-full')throw Error('Only sslmode=verify-full is supported');}
 if(url.searchParams.getAll('sslmode').length!==1)throw Error('sslmode=verify-full is required');
 const p=input.project as {project?:{id?:string;name?:string}},b=input.branch as {branch?:{id?:string;project_id?:string;name?:string;default?:boolean;parent_id?:string}},e=input.endpoints as {endpoints?:Array<{project_id?:string;branch_id?:string;host?:string;type?:string}>};
 if(p?.project?.id!==projectId||p.project.name!=='agentledger-os-db')throw Error('Neon project identity was not verified');
 if(b?.branch?.id!==branchId||b.branch.name!=='agentledger-v2-test'||b.branch.project_id!==projectId)throw Error('Neon test branch ID, name, or project did not match');
 if(b.branch.default!==false)throw Error('Neon test branch default status was not explicitly false');
 const parent=input.parent as {branch?:{id?:string;project_id?:string}};
 if(!b.branch.parent_id||!/^br-[a-z0-9-]+$/.test(b.branch.parent_id)||b.branch.parent_id===branchId||parent?.branch?.id!==b.branch.parent_id||parent.branch.project_id!==projectId)throw Error('Neon parent branch was not verified');
 if(!Array.isArray(e?.endpoints)||!e.endpoints.some(x=>x.project_id===projectId&&x.branch_id===branchId&&x.type==='read_write'&&x.host===url.hostname))throw Error('Database endpoint does not belong to the verified test branch');
 return {host:url.hostname,port:5432,database:'neondb',user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,application_name:'agentledger_v2_rollback_test'};
}
