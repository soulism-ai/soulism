import { ethers } from "ethers";

interface TokenCardProps {
  toggleTrade: (token: any) => void;
  token: any;
}

export function TokenCard({ toggleTrade, token }: TokenCardProps) {
  return (
    <button onClick={() => toggleTrade(token)} className="flex flex-col bg-[#121212] border border-white/5 hover:border-white/20 rounded-xl p-4 transition-colors group cursor-pointer relative overflow-hidden text-left h-full w-full">
      <div className="flex items-start gap-3 mb-3 w-full">
        <div className="w-14 h-14 rounded-lg flex-shrink-0 bg-gradient-to-br from-soul-purple to-pink-500 shadow-inner flex items-center justify-center overflow-hidden">
          <img src={token.image} alt={token.name} className="w-full h-full object-cover mix-blend-overlay opacity-80" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm text-white truncate group-hover:text-soul-purple transition-colors">
            {token.name}
          </h3>
          <p className="text-xs text-zinc-500 truncate mt-1">
            creator: {token.creator.slice(0, 6) + '...' + token.creator.slice(38, 42)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1 mb-3 pt-3 border-t border-white/5 w-full">
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-zinc-500 font-mono">SOUL VALUE (MCAP)</span>
          <span className="text-emerald-400 font-mono font-bold">{Number(ethers.formatUnits(token.raised, 18)).toFixed(4)} ETH</span>
        </div>
        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full" 
            style={{ width: `${Math.min((Number(ethers.formatUnits(token.raised, 18)) / 10) * 100, 100)}%` }} // Arbitrary visual scaling for demo
          ></div>
        </div>
      </div>
      
      <div className="mt-auto pt-3 flex items-center justify-between text-xs w-full text-zinc-500 font-mono">
        <span>Trade Key</span>
        <span className="text-soul-purple group-hover:text-white transition-colors">→</span >
      </div>
    </button>
  );
}
