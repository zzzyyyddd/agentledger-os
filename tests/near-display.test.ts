import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {formatNear,formatNearDisplay} from '../lib/v2-view';

test('display amounts round precisely without changing exact amounts',()=>{
 assert.equal(formatNearDisplay('3498000000000000000000000'),'3.4980');
 assert.equal(formatNearDisplay('1000000000000000000000000'),'1.0000');
 assert.equal(formatNearDisplay('999999999999999999999999'),'≈1.0000');
 assert.equal(formatNearDisplay('1'),'≈0.0000');
 assert.equal(formatNearDisplay('1234567890000000000000000000'),'≈1,234.5679');
 assert.equal(formatNear('1'),'0.000000000000000000000001');
 assert.throws(()=>formatNearDisplay('-1'));
});
