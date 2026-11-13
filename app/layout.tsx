import './globals.css';
import '@near-wallet-selector/modal-ui/styles.css';
export const metadata={title:'AgentLedger OS',description:'A controlled treasury for autonomous work.'};
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
