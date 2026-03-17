import { useEffect, useState, FormEvent } from "react";
import { ethers } from "ethers";

interface TradeTokenProps {
  toggleTrade: () => void;
  token: any;
  provider: ethers.BrowserProvider;
  factory: ethers.Contract;
}

export function TradeToken({ toggleTrade, token, provider, factory }: TradeTokenProps) {
  const [target, setTarget] = useState<bigint>(0n);
  const [limit, setLimit] = useState<bigint>(0n);
  const [cost, setCost] = useState<bigint>(0n);
  const [isBuying, setIsBuying] = useState(false);

  async function buyHandler(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsBuying(true);
    const formData = new FormData(e.currentTarget);
    const amountStr = formData.get("amount") as string;
    
    if (!amountStr) {
      setIsBuying(false);
      return;
    }

    try {
      const amount = BigInt(amountStr);
      // Wait, factory.getCost(token.sold) returns a BigInt. 
      // The original JS script used simple multiplication so BigInt math is required.
      const currentCost = await factory.getCost(token.sold);
      const totalCost = currentCost * amount;

      const signer = await provider.getSigner();

      const transaction = await factory.connect(signer).buy(
        token.token,
        ethers.parseUnits(amountStr, 18),
        { value: totalCost }
      );
      await transaction.wait();
      toggleTrade();
    } catch (error) {
      console.error("Trade failed", error);
    } finally {
      setIsBuying(false);
    }
  }

  async function getSaleDetails() {
    try {
      const targetVal = await factory.TARGET();
      setTarget(targetVal);

      const limitVal = await factory.TOKEN_LIMIT();
      setLimit(limitVal);

      const costVal = await factory.getCost(token.sold);
      setCost(costVal);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    getSaleDetails();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl relative flex flex-col items-center">
        <button 
          onClick={toggleTrade}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-soul-purple to-pink-500 shadow-inner flex flex-col items-center justify-center overflow-hidden mb-4 border border-white/10">
           <img src={token.image} alt={token.name} className="w-full h-full object-cover mix-blend-overlay opacity-80" />
        </div>
        
        <h2 className="text-2xl font-bold font-display text-white mb-1">{token.name}</h2>
        <p className="text-zinc-500 text-xs mb-6 font-mono bg-white/5 px-3 py-1 rounded-full border border-white/5">
          creator: {token.creator.slice(0, 6) + '...' + token.creator.slice(38, 42)}
        </p>

        <div className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-zinc-500">Mcap (Raised)</span>
            <span className="text-sm font-mono text-emerald-400 font-bold">{Number(ethers.formatUnits(token.raised, 18)).toFixed(4)} ETH</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-500">Current Key Price</span>
            <span className="text-sm font-mono text-pink-400 font-bold">{cost > 0n ? ethers.formatUnits(cost, 18) : "..."} ETH</span>
          </div>
        </div>

        {BigInt(token.sold) >= limit || BigInt(token.raised) >= target ? (
          <div className="w-full py-3 bg-emerald-900/30 border border-emerald-500/30 text-emerald-400 text-center rounded-xl font-bold">
            Bonding Curve Target Reached!
          </div>
        ) : (
          <form onSubmit={buyHandler} className="w-full flex flex-col gap-3">
            <div className="relative">
              <input 
                type="number" 
                name="amount" 
                min={1} 
                max={10000} 
                placeholder="Amount of Keys" 
                className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-soul-purple transition-colors pr-16"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">KEYS</span>
            </div>
            
            <button 
              type="submit" 
              disabled={isBuying}
              className="w-full py-4 bg-gradient-to-r from-soul-purple to-pink-500 hover:from-pink-500 hover:to-orange-500 text-white font-bold rounded-xl mt-2 transition-all shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:shadow-[0_0_25px_rgba(236,72,153,0.5)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isBuying ? "Trading..." : "Buy Soul Key"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
