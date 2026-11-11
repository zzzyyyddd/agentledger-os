import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {db,configured,setQueryForTests,session} from '../lib/server/database';
test('PostgreSQL adapter binds parameters and fails closed on database errors',async()=>{
 const old={...process.env};Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'postgresql://user:password@localhost/test',APP_ORIGIN:'http://localhost:3000'});
 try{let args:unknown[]=[];setQueryForTests(async(sql,params)=>{assert.match(sql,/\$1/);args=params;return [{owner_account:'owner.testnet'}]});assert.equal(await session(new Request('http://localhost',{headers:{cookie:'al_session=token'}})),'owner.testnet');assert.equal(args.length,1);assert.notEqual(args[0],'token');
 setQueryForTests(async()=>{throw Error('secret database detail')});await assert.rejects(db('SELECT $1',[1]),/^Error: Durable store unavailable$/);delete process.env.DATABASE_URL;assert.equal(configured(),false);await assert.rejects(db('SELECT $1',[1]),/DATABASE_URL/);
 }finally{setQueryForTests();process.env=old;}
});
