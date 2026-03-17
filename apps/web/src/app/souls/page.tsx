"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { ethers } from "ethers";
import DotGrid from "@/components/DotGrid";
// Components
import { ListSoul } from "@/components/marketplace/ListSoul";

// ABIs & Config
import Factory from "@/utils/pump/abis/Factory.json";
import config from "@/utils/pump/config.json";

export default function SoulsHub() {
  return (
    <React.Suspense fallback={<div className="min-h-screen flex items-center justify-center pt-24 text-zinc-500">Loading Souls...</div>}>
      <SoulsHubContent />
    </React.Suspense>
  );
}

function SoulsHubContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeFilter, setActiveFilter] = useState("Highlighted");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Web3 State
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [factory, setFactory] = useState<ethers.Contract | null>(null);
  const [fee, setFee] = useState<bigint>(BigInt(0));
  const [showCreate, setShowCreate] = useState(false);
  const [web3Account, setWeb3Account] = useState<string | null>(null);

  // Dynamic Token State
  const [tokens, setTokens] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Simple filter logic for demonstration
  const filteredSouls = tokens.filter(soul =>
    soul.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    soul.token.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function loadBlockchainData() {
    try {
      let rpcProvider: ethers.Provider;
      let activeChainId = "31337"; // default to local hardhat

      // First try to use injected web3 if it's on the right network
      if (typeof window !== "undefined" && typeof (window as any).ethereum !== "undefined") {
        const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
        const network = await browserProvider.getNetwork();
        if ((config as any)[network.chainId.toString()]) {
          rpcProvider = browserProvider;
          activeChainId = network.chainId.toString();
        } else {
          // Fallback to local RPC if metamask is connected to mainnet/other
          rpcProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        }
      } else {
        // Fallback if no metamask installed
        rpcProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
      }

      if (rpcProvider instanceof ethers.BrowserProvider) {
        setProvider(rpcProvider);
      }

      const factoryAddress = (config as any)[activeChainId].factory.address;
      const factoryContract = new ethers.Contract(factoryAddress, Factory, rpcProvider);
      setFactory(factoryContract);

      const fetchedFee = await factoryContract.fee();
      setFee(fetchedFee);

      // Fetch dynamic tokens
      const totalTokens = await factoryContract.totalTokens();
      const fetchedTokens = [];

      const colors = [
        "from-blue-500 to-cyan-500", "from-purple-500 to-pink-500",
        "from-orange-500 to-amber-500", "from-emerald-400 to-teal-500",
        "from-indigo-500 to-blue-600", "from-red-500 to-orange-500"
      ];

      for (let i = 0; i < Number(totalTokens); i++) {
        const tokenSale = await factoryContract.getTokenSale(i);
        fetchedTokens.push({
          token: tokenSale.token,
          name: tokenSale.name,
          creator: tokenSale.creator,
          sold: tokenSale.sold,
          raised: tokenSale.raised,
          isOpen: tokenSale.isOpen,
          avatarColor: colors[i % colors.length]
        });
      }

      const mockTokens = [
        {
          token: "0xMockAgentHack3r000000000000000000",
          name: "NeoHacker",
          creator: "0x1234000000000000000000000000000000005678",
          sold: ethers.parseUnits("500000", 18),
          raised: ethers.parseUnits("0.45", 18),
          isOpen: true,
          avatarColor: "from-blue-500 to-cyan-500",
          imageSrc: "/soul_hacker_agent.png"
        },
        {
          token: "0xMockTradingB0t0000000000000000000",
          name: "AutoSwapBot",
          creator: "0x8765000000000000000000000000000000004321",
          sold: ethers.parseUnits("1500000", 18),
          raised: ethers.parseUnits("1.25", 18),
          isOpen: true,
          avatarColor: "from-purple-500 to-pink-500",
          imageSrc: "/soul_trading_bot.png"
        },
        {
          token: "0xMockShibaD0g300000000000000000000",
          name: "CyberDoge",
          creator: "0x9999000000000000000000000000000000001111",
          sold: ethers.parseUnits("3500000", 18),
          raised: ethers.parseUnits("4.20", 18),
          isOpen: true,
          avatarColor: "from-green-500 to-emerald-500",
          imageSrc: "/soul_meme_dog.png"
        }
      ];

      setTokens([...fetchedTokens.reverse(), ...mockTokens]);

    } catch (err) {
      console.error("Failed to load blockchain data", err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadBlockchainData();
  }, [showCreate]);

  // Handle auto-connect listener for Create ability locally
  useEffect(() => {
    if (typeof window !== "undefined" && typeof (window as any).ethereum !== "undefined") {
      (window as any).ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) setWeb3Account(accounts[0]);
      });
    }
  }, []);

  return (
    <div className="flex flex-col gap-6 max-w-[1400px] mx-auto py-8 px-4 sm:px-8 pt-24 min-h-screen">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <DotGrid
            dotSize={5}
            gap={18}
            baseColor="#232323"
            activeColor="#ffffff"
            proximity={110}
            shockRadius={220}
            shockStrength={2.2}
            resistance={780}
            returnDuration={1.35}
          />
        </div>
      </div>
      {/* Header and Search Section */}
      <section className="flex flex-col gap-6 mb-2">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight">Souls</h1>
            <span className="text-zinc-500 font-mono text-sm">(25,589)</span>
          </div>

        </div>

        {/* Search Bar - ClawHub Style */}
        <div className="relative group">
          <div className="absolute inset-0 bg-soul-purple/20 blur-md rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
          <div className="relative flex items-center bg-[#1c1c1c] border border-white/10 rounded-xl overflow-hidden focus-within:border-soul-purple/50 transition-colors">
            <div className="pl-4 text-zinc-500">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input
              type="text"
              placeholder="Filter by name, slug, or summary..."
              className="w-full bg-transparent border-none text-white px-4 py-4 focus:outline-none placeholder:text-zinc-600 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Filters - Pump.fun / ClawHub Style */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {[
              "Highlighted", "● Live", "🔥 Trending", "New", 
              "|",
              "Agents", "🤖 Bots", "🎭 Persona", "🧠 AI", 
              "|",
              "Trade", "💰 DeFi", "🎮 Gaming", "🎨 Art", "🌐 Social", "⚡ Skills",
              "|",
              "Hide suspicious"
            ].map((filter, i) => {
              if (filter === "|") return <div key={i} className="w-px h-6 bg-white/10 mx-1 flex-shrink-0 self-center"></div>;

              // Extract actual value and icon for styling if we combined them (like '🔥 Trending')
              const isLive = filter.includes("Live");
              const isHighlighted = filter.includes("Highlighted");
              
              return (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border shadow-sm flex items-center gap-1.5 ${activeFilter === filter
                  ? "bg-soul-purple text-white border-soul-purple/50 shadow-[0_0_10px_rgba(167,139,250,0.5)]"
                  : "bg-[#1c1c1c] text-zinc-400 border-white/10 hover:bg-white/10 hover:text-white"
                  }`}
              >
                {isHighlighted && <span className="text-yellow-500">★</span>}
                {isLive ? <span className="text-emerald-500 animate-pulse">●</span> : null}
                {filter.replace("● ", "").replace("★ ", "")}
              </button>
            )})}
          </div>
          <div className="flex items-center gap-2 relative">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-1.5 border rounded text-xs transition-colors ${showFilters ? "bg-white/10 text-white border-white/20" : "bg-[#1c1c1c] border-white/10 text-zinc-300 hover:bg-white/5"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              Filter
            </button>
            {showFilters && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-[#1c1c1c] border border-white/10 rounded-xl shadow-2xl p-4 z-50">
                <div className="mb-4">
                  <div className="flex justify-between text-xs font-bold text-zinc-400 mb-2">
                    <span>Mcap</span>
                    <span className="text-emerald-400">$1.0K - $50.0M+</span>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded-full mt-2"><div className="w-full h-full bg-emerald-500 rounded-full"></div></div>
                  <div className="flex gap-2 mt-3 text-xs">
                    <input type="text" placeholder="Minimum (e.g. 10k)" className="w-1/2 bg-black/50 border border-white/10 rounded px-2 py-1 text-white focus:outline-none focus:border-soul-purple" />
                    <input type="text" placeholder="Maximum (e.g. 1m)" className="w-1/2 bg-black/50 border border-white/10 rounded px-2 py-1 text-white focus:outline-none focus:border-soul-purple" />
                  </div>
                </div>
                <div className="mb-4">
                  <div className="flex justify-between text-xs font-bold text-zinc-400 mb-2">
                    <span>24h Vol</span>
                    <span className="text-emerald-400">$0 - $500.0K+</span>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded-full mt-2"><div className="w-full h-full bg-emerald-500 rounded-full"></div></div>
                  <div className="flex gap-2 mt-3 text-xs">
                    <input type="text" placeholder="Minimum" className="w-1/2 bg-black/50 border border-white/10 rounded px-2 py-1 text-white focus:outline-none focus:border-soul-purple" />
                    <input type="text" placeholder="Maximum" className="w-1/2 bg-black/50 border border-white/10 rounded px-2 py-1 text-white focus:outline-none focus:border-soul-purple" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowFilters(false)} className="flex-1 py-1.5 border border-white/10 rounded text-xs font-medium text-white hover:bg-white/5 transition-colors">Clear</button>
                  <button onClick={() => setShowFilters(false)} className="flex-1 py-1.5 bg-emerald-600 rounded text-xs font-medium text-white hover:bg-emerald-500 transition-colors">Apply</button>
                </div>
              </div>
            )}
            {/* View Mode Toggle Controls */}
            <div className="flex items-center gap-1 bg-[#121212] border border-white/10 rounded-lg p-1">
              <button 
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${viewMode === "grid" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                Grid
              </button>
              <button 
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${viewMode === "table" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                Table
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Grid Section - Pump.fun Style Densest Grid */}
      <section>
        {filteredSouls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-white/5 rounded-xl bg-black/50">
            <span className="text-4xl mb-4">👻</span>
            <h3 className="text-xl font-bold text-white mb-2">No souls found</h3>
            <p className="text-zinc-500">Try adjusting your filters or search query.</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredSouls.map((soul, idx) => {
              const raisedEth = Number(ethers.formatUnits(soul.raised || 0, 18));
              const mcapEth = Math.max(raisedEth, 0.001);
              const usagePercent = Math.min((raisedEth / 5) * 100, 100);

              const defaultImages = [
                "https://pump.mypinata.cloud/ipfs/QmZ4ea3wmwzwYwyWnhzs35hyxw4YryWB82TknGY3L5Wbxn",
                "https://pump.mypinata.cloud/ipfs/QmfFEKp9zFzTmcDjHLXi5H6E5dnKn8NjeaT5ZN2yenFfUR",
                "/soul_hacker_agent.png",
                "/soul_trading_bot.png",
                "/soul_meme_dog.png"
              ];
              const displayImage = soul.imageSrc || defaultImages[idx % defaultImages.length];
              const favorited = idx % 3 === 0;

              return (
                <Link href={`/souls/${soul.token}`} key={idx} className="flex flex-col bg-[#121212] border border-white/5 hover:border-white/20 rounded-2xl overflow-hidden transition-all group cursor-pointer shadow-lg hover:shadow-2xl hover:-translate-y-1">
                  <div className="relative aspect-square w-full bg-zinc-900 overflow-hidden">
                    <img src={displayImage} alt={soul.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                    {soul.isOpen && (
                      <div className="absolute top-3 left-3 px-2 py-1 bg-emerald-500/90 backdrop-blur text-white text-[10px] font-bold uppercase rounded-md flex items-center gap-1.5 shadow-lg">
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                        LIVE
                      </div>
                    )}
                    <div className="absolute top-3 right-3 flex gap-2">
                       <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="w-8 h-8 rounded-full bg-black/60 shadow hover:bg-black/80 flex items-center justify-center transition-colors group/btn">
                         <svg className={`w-4 h-4 ${favorited ? "text-yellow-400 fill-yellow-400" : "text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                       </button>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#121212] to-transparent pointer-events-none"></div>
                  </div>
                  <div className="px-4 pb-4 pt-1 flex-1 flex flex-col relative z-10">
                    <div className="flex items-start justify-between mb-2">
                       <div className="min-w-0 pr-3">
                         <h3 className="font-bold text-lg text-white truncate group-hover:text-emerald-400 transition-colors">{soul.name}</h3>
                         <div className="flex items-center gap-1.5 mt-0.5 text-xs text-zinc-400 font-mono">
                           <span className="truncate max-w-[80px] text-zinc-300">{soul.creator.slice(0, 6) || "0x..."}</span>
                         </div>
                       </div>
                       <div className="text-right flex-shrink-0">
                         <div className="text-sm font-bold text-emerald-400">${(mcapEth * 3000).toLocaleString('en-US', {maximumFractionDigits: 1})}</div>
                         <div className="text-[10px] text-zinc-500 uppercase mt-0.5 tracking-wider font-semibold">MCAP</div>
                       </div>
                    </div>
                    <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed mb-4 flex-1">
                      Custom AI Soul token persona {soul.name}.
                    </p>
                    <div className="flex flex-col gap-1.5 mt-auto pt-4 border-t border-white/5">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-zinc-500">MARKETPLACE PRICE</span>
                        <span className="text-pink-400 font-semibold">{mcapEth.toFixed(3)} ETH</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="w-full bg-[#121212] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[#1c1c1c] border-b border-white/10 text-[10px] sm:text-xs text-zinc-500 font-mono uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4 font-bold">Soul / Token</th>
                    <th className="px-6 py-4 font-bold text-pink-400">Price (ETH)</th>
                    <th className="px-6 py-4 font-bold hidden md:table-cell">Sales</th>
                    <th className="px-6 py-4 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredSouls.map((soul, idx) => {
                    const raisedEth = Number(ethers.formatUnits(soul.raised || 0, 18));
                    const mcapEth = Math.max(raisedEth, 0.001);
                    
                    const defaultImages = [
                      "https://pump.mypinata.cloud/ipfs/QmZ4ea3wmwzwYwyWnhzs35hyxw4YryWB82TknGY3L5Wbxn",
                      "https://pump.mypinata.cloud/ipfs/QmfFEKp9zFzTmcDjHLXi5H6E5dnKn8NjeaT5ZN2yenFfUR",
                      "/soul_hacker_agent.png",
                      "/soul_trading_bot.png",
                      "/soul_meme_dog.png"
                    ];
                    const displayImage = soul.imageSrc || defaultImages[idx % defaultImages.length];

                    return (
                      <tr key={idx} className="hover:bg-white/5 transition-colors cursor-pointer group" onClick={() => window.location.href = `/souls/${soul.token}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="relative w-10 h-10 rounded border border-white/10 overflow-hidden flex-shrink-0">
                              <img src={displayImage} alt={soul.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                              {soul.isOpen && <div className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border border-black shadow-[0_0_5px_rgba(16,185,129,1)]"></div>}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-white group-hover:text-emerald-400 transition-colors text-base">{soul.name}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">By {soul.creator.slice(0,6)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-pink-400">{mcapEth.toFixed(3)}</td>
                        <td className="px-6 py-4 font-mono text-zinc-400 hidden md:table-cell">{Math.floor(Math.random() * 500)}</td>
                        <td className="px-6 py-4 text-right">
                          <Link href={`/souls/${soul.token}`} className="text-xs px-4 py-2 bg-white/10 hover:bg-soul-purple group-hover:text-white font-bold rounded text-zinc-300 transition-colors">Trade</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Authentication CTA if logged out */}
      {(!session && !web3Account) && (
        <section className="col-span-full dashboard-card text-center py-10 mt-6 border border-white/10 bg-[#121212]">
          <h3 className="text-lg font-bold mb-2">Ready to collect and list your own souls?</h3>
          <p className="text-zinc-500 text-sm mb-6 max-w-sm mx-auto">Use the Sign in button in the top right to authenticate via Socials or connect your Web3 wallet instantly.</p>
        </section>
      )}

      {/* Web3 Marketplace Listing Modal */}
      {showCreate && factory && provider && (
        <ListSoul toggleCreate={() => setShowCreate(false)} fee={fee} provider={provider} factory={factory} />
      )}
    </div>
  );
}


