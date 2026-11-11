import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {advanceSandbox} from '../lib/judge-sandbox';

test('isolated simulation requires permission and advances only in order',()=>{
 assert.equal(advanceSandbox('none','fund',false),'none');
 assert.equal(advanceSandbox('none','settle',true),'none');
 assert.equal(advanceSandbox('none','fund',true),'funded');
 assert.equal(advanceSandbox('funded','authorize',false),'funded');
 assert.equal(advanceSandbox('funded','authorize',true),'authorized');
 assert.equal(advanceSandbox('authorized','settle',true),'completed');
 assert.equal(advanceSandbox('completed','settle',true),'completed');
});
