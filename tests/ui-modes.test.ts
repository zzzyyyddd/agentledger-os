import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Home from '../app/home';

test('overview distinguishes unavailable live data from the simulated demo',()=>{
 Object.assign(globalThis,{React});
 const html=renderToStaticMarkup(React.createElement(Home,{}));
 assert.match(html,/NEAR TESTNET/);assert.match(html,/WALLET BALANCE/);
 assert.match(html,/guided purchase/);
 assert.match(html,/Explore the demo/);
});
