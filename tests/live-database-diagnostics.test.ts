import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {diagnostic} from '../scripts/live-database-diagnostics';

test('live database diagnostics preserve safe SQLSTATE and known constraints only',()=>{
 const text=diagnostic({code:'23505',constraint:'payment_intents_authorize_reference',message:'secret postgresql://user:password@host/db',detail:'private wallet'});
 assert.match(text,/SQLSTATE=23505/);
 assert.match(text,/constraint=payment_intents_authorize_reference/);
 assert.doesNotMatch(text,/secret|password|private|postgresql/);
 assert.match(diagnostic({code:'secret',constraint:'private_wallet'}),/SQLSTATE=unavailable constraint=redacted/);
 assert.match(diagnostic(new assert.AssertionError({message:'sensitive fixture'})),/assertion failed \(values suppressed\)/);
});
