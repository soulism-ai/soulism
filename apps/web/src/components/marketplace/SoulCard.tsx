import { ethers } from "ethers";
import Link from "next/link";

interface SoulCardProps {
  token: any;
}

export function SoulCard({ token }: SoulCardProps) {
  // MOCK: Generate a consistent random-looking price based on the token address
  // In a real marketplace, this would be `token.price`
  const mockPrice = token.address ? 
    (0.01 + ((parseInt(token.address.slice(-4), 16) % 100) / 1000)).toFixed(3) : 
    "0.05";

  return (
    <Link href={`/souls/${token.token}`} className="flex flex-col bg-[#121212] border border-white/5 hover:border-white/20 rounded-xl p-4 transition-colors group cursor-pointer relative overflow-hidden text-left h-full w-full">
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
        <div className="flex justify-between items-center text-sm">
          <span className="text-zinc-400 font-bold">List Price</span>
          <span className="text-pink-400 font-mono font-bold">{mockPrice} ETH</span>
        </div>
      </div>
      
      <div className="mt-auto flex items-center justify-between text-xs w-full text-zinc-500 font-mono">
        <span>View Details & Buy</span>
        <span className="text-soul-purple group-hover:text-white transition-colors">→</span >
      </div>
    </Link>
  );
}
