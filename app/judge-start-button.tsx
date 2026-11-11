'use client';
import React from 'react';

type Props={verified:boolean;onStart:()=>void;onVerify:()=>void};

// Opening the wallet never requests a signature; verification remains explicit.
export function JudgeStartButton({verified,onStart,onVerify}:Props){
 return <button type="button" className="primary" onClick={verified?onStart:onVerify} aria-describedby="judge-start-help">Start Judge Demo →</button>;
}
