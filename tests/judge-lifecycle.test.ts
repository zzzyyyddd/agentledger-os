import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {intentLabel} from '../app/live-judge-treasury';

test('durable states distinguish pending, verified and uncertain outcomes',()=>{
 assert.equal(intentLabel('AWAITING_SIGNATURE'),'Awaiting wallet approval');
 assert.equal(intentLabel('SUBMITTED'),'Submitted · pending verification');
 assert.equal(intentLabel('UNKNOWN'),'Unknown · recovery required');
 assert.equal(intentLabel('CONFIRMED'),'Confirmed');
 assert.equal(intentLabel('FAILED'),'Failed');
});
