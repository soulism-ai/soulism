import { ethers } from "ethers";

interface PumpHeaderProps {
  account: string | null;
  setAccount: (account: string) => void;
}

export function PumpHeader({ account, setAccount }: PumpHeaderProps) {
  async function connectHandler() {
    if (typeof window !== "undefined" && typeof window.ethereum !== "undefined") {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const checksumAccount = ethers.getAddress(accounts[0]);
        setAccount(checksumAccount);
      } catch (err) {
        console.error("User rejected connection", err);
      }
    } else {
      alert("Please install MetaMask to trade Soul Keys.");
    }
  }

  return (
    <div className="flex items-center justify-between bg-black/40 border border-white/10 rounded-xl px-6 py-4 mb-8">
      <div className="flex items-center gap-3">
        <span className="text-2xl">⚡️</span>
        <h2 className="text-xl font-bold font-display text-white tracking-tight">Soul Exchange</h2>
      </div>

      {account ? (
        <div className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm font-mono text-zinc-300">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
          {account.slice(0, 6)}...{account.slice(38, 42)}
        </div>
      ) : (
        <button 
          onClick={connectHandler} 
          className="px-6 py-2 bg-soul-purple hover:bg-pink-600 text-white text-sm font-bold rounded-full transition-all shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:shadow-[0_0_25px_rgba(236,72,153,0.5)] flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          Connect Wallet
        </button>
      )}
    </div>
  );
}
