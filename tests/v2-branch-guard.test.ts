import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {spawnSync} from 'node:child_process';
import {verifyV2TestBranch} from '../lib/server/v2-test-branch-guard';
const valid={projectId:'project-123',branchId:'br-test-123',databaseUrl:'postgresql://app:example@ep-test.us-east-2.aws.neon.tech/neondb?sslmode=verify-full',project:{project:{id:'project-123',name:'agentledger-os-db'}},branch:{branch:{id:'br-test-123',project_id:'project-123',name:'agentledger-v2-test',default:false,parent_id:'br-parent'}},parent:{branch:{id:'br-parent',project_id:'project-123'}},endpoints:{endpoints:[{project_id:'project-123',branch_id:'br-test-123',host:'ep-test.us-east-2.aws.neon.tech',type:'read_write'}]}};
test('rollback-only validation requires Neon proof of the exact non-default direct test endpoint',()=>{
 const config=verifyV2TestBranch(valid);assert.equal(config.host,'ep-test.us-east-2.aws.neon.tech');assert.equal(config.database,'neondb');assert.equal(config.ssl.rejectUnauthorized,true);
 assert.throws(()=>verifyV2TestBranch({...valid,branch:{branch:{...valid.branch.branch,default:true}}}),/default status/);
 assert.throws(()=>verifyV2TestBranch({...valid,branch:{branch:{...valid.branch.branch,name:'main'}}}),/branch ID/);
 assert.throws(()=>verifyV2TestBranch({...valid,branch:{branch:{...valid.branch.branch,default:undefined}}}),/default status/);
 assert.throws(()=>verifyV2TestBranch({...valid,parent:{branch:{id:'br-wrong',project_id:'project-123'}}}),/parent branch/);
 assert.throws(()=>verifyV2TestBranch({...valid,endpoints:{endpoints:[{...valid.endpoints.endpoints[0],host:'ep-other.us-east-2.aws.neon.tech'}]}}),/endpoint/);
 assert.throws(()=>verifyV2TestBranch({...valid,endpoints:{endpoints:[{...valid.endpoints.endpoints[0],branch_id:'br-production'}]}}),/endpoint/);
 assert.throws(()=>verifyV2TestBranch({...valid,project:{project:{...valid.project.project,name:'another-project'}}}),/project identity/);
 assert.throws(()=>verifyV2TestBranch({...valid,databaseUrl:valid.databaseUrl.replace('ep-test.','ep-test-pooler.')}),/direct/);
 assert.throws(()=>verifyV2TestBranch({...valid,databaseUrl:valid.databaseUrl.replace('verify-full','require')}),/sslmode/);
 assert.throws(()=>verifyV2TestBranch({...valid,databaseUrl:valid.databaseUrl+'&host=production.example'}),/Only sslmode/);
 assert.throws(()=>verifyV2TestBranch({...valid,databaseUrl:valid.databaseUrl.replace('/neondb','/other')}),/neondb/);
});

test('database validation fails before connecting when test credentials are missing',()=>{
 const env={...process.env};for(const key of ['NEON_API_KEY','NEON_PROJECT_ID','NEON_BRANCH_ID','NEON_V2_APP_ROLE','NEON_V2_TEST_DATABASE_URL'])delete env[key];
 const run=spawnSync(process.execPath,['--import','tsx','scripts/validate-v2-test-branch.ts'],{env,encoding:'utf8',timeout:10000});assert.equal(run.status,1);assert.match(run.stderr,/No connection was attempted/);assert.equal(run.stdout,'');
});
