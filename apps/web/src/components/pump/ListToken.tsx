import { ethers } from "ethers";
import { FormEvent } from "react";

interface ListTokenProps {
  toggleCreate: () => void;
  fee: bigint;
  provider: ethers.BrowserProvider;
  factory: ethers.Contract;
}

export function ListToken({ toggleCreate, fee, provider, factory }: ListTokenProps) {
  async function listHandler(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const ticker = formData.get("ticker") as string;

    if (!name || !ticker) return;

    try {
      const signer = await provider.getSigner();
      const transaction = await (factory.connect(signer) as any).create(name, ticker, { value: fee });
      await transaction.wait();
      toggleCreate();
    } catch (error) {
      console.error("Listing failed", error);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 h-full">
      <div className="bg-[#121212] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl relative">
        <button 
          onClick={toggleCreate}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <h2 className="text-2xl font-bold font-display text-white mb-2">List New Soul Key</h2>
        <p className="text-zinc-500 text-sm mb-6">Set up a new bonding curve for an AI Agent Soul. The baseline fee to list is <span className="text-soul-purple font-mono">{ethers.formatUnits(fee, 18)} ETH</span>.</p>

        <form onSubmit={listHandler} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Soul Name</label>
            <input 
              type="text" 
              name="name" 
              placeholder="e.g. Self-Improving Agent" 
              className="bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-soul-purple transition-colors"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Ticker / Key ID</label>
            <input 
              type="text" 
              name="ticker" 
              placeholder="e.g. SLFIMPRV" 
              className="bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-soul-purple transition-colors font-mono uppercase"
              required
            />
          </div>

          <button 
            type="submit" 
            className="w-full py-3 bg-white text-black font-bold rounded-xl mt-4 hover:bg-zinc-200 transition-colors shadow-lg active:scale-95"
          >
            Create Bonding Curve
          </button>
        </form>
      </div>
    </div>
  );
}
