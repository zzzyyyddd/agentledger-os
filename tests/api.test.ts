import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { POST } from '../app/api/evaluate/route';
import { sample } from '../lib/core';

test('demo review endpoint returns three proposals without authorizing a payment', async () => {
 const response = await POST(new Request('http://localhost/api/evaluate', {method:'POST',body:JSON.stringify(sample)}));
 assert.equal(response.status,200); const body=await response.json();
 assert.equal(body.mode,'DEMO'); assert.equal(body.ranked.length,3); assert.equal(body.winner.vendor,'northstar.testnet'); assert.equal(body.authorized,undefined);
});
test('invalid request is rejected', async () => {
 const response = await POST(new Request('http://localhost/api/evaluate', {method:'POST',body:JSON.stringify({...sample,proposals:[]})})); assert.equal(response.status,400);
});
test('oversized request is rejected before validation', async () => {
 const response = await POST(new Request('http://localhost/api/evaluate', {method:'POST',body:JSON.stringify({...sample,title:'x'.repeat(20000)})})); assert.equal(response.status,400);
});
