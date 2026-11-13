import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {POST as claim} from '../app/api/intents/claim/route';
import {POST as update} from '../app/api/intents/update/route';
test('legacy intent endpoints are retired',async()=>{for(const handler of [claim,update])assert.equal((await handler(new Request('http://localhost',{method:'POST'}))).status,410);});
