import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JudgeStartButton} from '../app/judge-start-button';

test('interactive demo starts directly without a wallet',()=>{
 let started=0;const button=JudgeStartButton({onStart:()=>{started++;}});
 const html=renderToStaticMarkup(createElement(JudgeStartButton,{onStart:()=>{}}));
 assert.match(html,/Explore Interactive Demo/);assert.doesNotMatch(html,/disabled/);
 button.props.onClick();assert.equal(started,1);
});
