import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Home from '../app/home';

test('overview distinguishes unavailable live data from the simulated demo',()=>{
 Object.assign(globalThis,{React});
 const html=renderToStaticMarkup(React.createElement(Home,{}));
 assert.match(html,/NEAR TESTNET/);assert.match(html,/Unavailable/);
 assert.match(html,/DEMO MODE/);assert.match(html,/No funds are moved/);
 assert.match(html,/Try AgentLedger/);
});
