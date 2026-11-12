'use client';
import React from 'react';
type Props={onStart:()=>void};
export function JudgeStartButton({onStart}:Props){return <button type="button" className="primary" onClick={onStart}>Explore Interactive Demo →</button>;}
