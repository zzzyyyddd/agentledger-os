import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import VerifiedLivePayment from '../app/verified-live-payment';

test('historical browser-wallet evidence shows the matching transaction and separate transfer receipt',()=>{
 Object.assign(globalThis,{React});const html=renderToStaticMarkup(React.createElement(VerifiedLivePayment));
 for(const text of ['Verified Live Payment','0.01 NEAR','sadcloud8798.testnet','agentledger-demo-user.testnet','judge.agentledger-owner.testnet','DZzwckAQBtZeKWB3dwD4VTGnGDKgHNqRQYCaEtKxJkH5','DdSTWCTfjK5CPcTBXfWWboEr6ed1xvMMfoJf9vMdgSiH'])assert.ok(html.includes(text),text);
 assert.match(html,/separate transfer receipt/);assert.match(html,/not a payment from your account/);assert.doesNotMatch(html,/CLI/);
});
