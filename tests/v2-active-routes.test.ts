import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {existsSync} from 'node:fs';

test('legacy payment and treasury routes are absent',()=>{
 for(const path of ['app/api/intents/route.ts','app/api/intents/claim/route.ts','app/api/intents/update/route.ts','app/api/intents/reconcile/route.ts','app/api/treasury/route.ts','app/api/settlement/route.ts'])assert.equal(existsSync(path),false,path);
});
