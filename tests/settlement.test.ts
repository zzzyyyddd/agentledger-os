import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {settlementMatches,SETTLEMENT} from '../lib/settlement';
import {GET} from '../app/api/settlement/route';

const request={status:'Completed',budget:SETTLEMENT.amount,remaining:'0',amount:SETTLEMENT.amount,vendor:SETTLEMENT.vendor,payment_id:SETTLEMENT.payment};
test('historical settlement matches only exact completed state and amounts',()=>{
 assert.equal(settlementMatches(request),true);
 for(const patch of [{status:'Pending'},{remaining:'1'},{amount:'1'},{vendor:'other.testnet'},{payment_id:'other'}]) assert.equal(settlementMatches({...request,...patch}),false);
 assert.equal(settlementMatches(null),false);
});
test('legacy settlement endpoint is retired',async()=>{assert.equal((await GET(new Request('http://localhost'))).status,410);});
