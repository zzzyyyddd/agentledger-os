import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {db,configured,setQueryForTests,session} from '../lib/server/database';
test('PostgreSQL adapter binds parameters and fails closed on database errors',async()=>{
 const old={...process.env};Object.assign(process.env,{NODE_ENV:'test',V2_DATABASE_URL:'postgresql://test:dummy@ep-quiet-math-a1y04117.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full',APP_ORIGIN:'http://localhost:3000'});
 try{let args:unknown[]=[];setQueryForTests(async(sql,params)=>{assert.match(sql,/\$1/);args=params;return [{owner_account:'owner.testnet'}]});assert.equal(await session(new Request('http://localhost',{headers:{cookie:'al_v2_session=token'}})),'owner.testnet');assert.equal(args.length,1);assert.notEqual(args[0],'token');
 setQueryForTests(async()=>{throw Error('secret database detail')});await assert.rejects(db('SELECT $1',[1]),/^Error: Durable store unavailable$/);delete process.env.V2_DATABASE_URL;assert.equal(configured(),false);await assert.rejects(db('SELECT $1',[1]),/V2_DATABASE_URL/);
 }finally{setQueryForTests();process.env=old;}
});
test('V2 database rejects other branches, pooled endpoints and weak TLS',()=>{
 const old={...process.env};Object.assign(process.env,{APP_ORIGIN:'http://localhost:3000'});
 const url='postgresql://test:dummy@ep-quiet-math-a1y04117.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full';
 try{process.env.V2_DATABASE_URL=url;assert.equal(configured(),true);for(const bad of [url.replace('ep-quiet-math-a1y04117','ep-other'),url.replace('ep-quiet-math-a1y04117.','ep-quiet-math-a1y04117-pooler.'),url.replace('verify-full','require'),url.replace('/neondb','/other'),url+'&host=other']){process.env.V2_DATABASE_URL=bad;assert.equal(configured(),false);}}finally{process.env=old;}
});
