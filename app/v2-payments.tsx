'use client';
import WalletConnection from './wallet';
import LiveJudgeTreasury from './live-judge-treasury';

export default function V2Payments(){
 return <div className="shell"><aside className="sidebar"><div className="brand"><div className="brandmark">◈</div><div><strong>agentledger</strong><small>OPERATING SYSTEM</small></div></div><div className="navlabel">V2 PAYMENTS</div><div className="sidebar-bottom"><div className="network"><span className="dot"/> NEAR TESTNET</div></div></aside><main className="main"><header className="topbar"><div className="topbar-title"><strong>Payments</strong></div><div className="topright"><span className="network-text">Testnet</span><WalletConnection/></div></header><div className="content"><LiveJudgeTreasury/></div></main></div>;
}
