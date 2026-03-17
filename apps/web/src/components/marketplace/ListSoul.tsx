import { ethers } from "ethers";
import { FormEvent } from "react";

interface ListSoulProps {
  toggleCreate: () => void;
  fee: bigint;
  provider: ethers.BrowserProvider;
  factory: ethers.Contract;
}

export function ListSoul({ toggleCreate, fee, provider, factory }: ListSoulProps) {
  async function listHandler(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const priceStr = formData.get("price") as string;

    if (!name || !description || !priceStr) return;

    try {
      const signer = await provider.getSigner();
      
      // MOCK MARKETPLACE LISTING:
      // Since we are mocking the marketplace, we still call the existing contract for demo purposes, 
      // but the UI presents it as a fixed-price listing.
      // In a real implementation, you'd call the new Marketplace contract here.
      const transaction = await (factory.connect(signer) as any).create(name, description, { value: fee });
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

        <h2 className="text-2xl font-bold font-display text-white mb-2">List AI Agent Soul</h2>
        <p className="text-zinc-500 text-sm mb-6">Create a new listing for your AI Agent. The listing gas fee is <span className="text-soul-purple font-mono">{ethers.formatUnits(fee, 18)} ETH</span>.</p>

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
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Description</label>
            <textarea 
              name="description" 
              placeholder="A brief description of this AI agent's capabilities..." 
              className="bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-soul-purple transition-colors min-h-[100px] resize-none"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Price (ETH)</label>
            <input 
              type="number" 
              name="price" 
              min="0.001"
              step="0.001"
              placeholder="e.g. 0.05" 
              className="bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-soul-purple transition-colors font-mono"
              required
            />
          </div>

          <button 
            type="submit" 
            className="w-full py-3 bg-white text-black font-bold rounded-xl mt-4 hover:bg-zinc-200 transition-colors shadow-lg active:scale-95"
          >
            Create Listing
          </button>
        </form>
      </div>
    </div>
  );
}
