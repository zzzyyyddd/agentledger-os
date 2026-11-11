import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JudgeStartButton} from '../app/judge-start-button';

test('unverified judge can activate the button to open verification, never start the sandbox',()=>{
 let started=0,opened=0;
 const props={verified:false,onStart:()=>{started++;},onVerify:()=>{opened++;}};
 const button=JudgeStartButton(props);
 const html=renderToStaticMarkup(createElement(JudgeStartButton,props));
 assert.match(html,/Start Judge Demo/);
 assert.doesNotMatch(html,/disabled/);
 assert.match(html,/aria-describedby="judge-start-help"/);
 button.props.onClick();
 assert.equal(opened,1);assert.equal(started,0);
});

test('verified judge activates the same button to start the sandbox',()=>{
 let started=0,opened=0;
 const button=JudgeStartButton({verified:true,onStart:()=>{started++;},onVerify:()=>{opened++;}});
 button.props.onClick();
 assert.equal(started,1);assert.equal(opened,0);
});
