"use client";

import React, { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ethers } from "ethers";
import DotGrid from "@/components/DotGrid";
// ABIs & Config
import Factory from "@/utils/pump/abis/Factory.json";
import config from "@/utils/pump/config.json";

// Mock Markdown Content for testing
const mockReadme = `
## Learning Entry
Append to \`.learnings/LEARNINGS.md\`:

\`\`\`markdown
## [LRN-YYYYMMDD-XXX] category

**Logged**: ISO-8601 timestamp
**Priority**: low | medium | high | critical
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Summary
One-line description of what was learned

### Details
Full context: what happened, what was wrong, what's correct

### Suggested Action
Specific fix or improvement to make

### Metadata
- Source: conversation | error | user_feedback
- Related Files: path/to/file.ext
- Tags: tag1, tag2
- See Also: LRN-20250110-001 (if related to existing entry)
- Pattern-Key: simplify.dead_code | harden.input_validation
- Recurrence-Count: 1 (optional)
- First-Seen: 2025-01-15 (optional)
- Last-Seen: 2025-01-15 (optional)
\`\`\`

## Error Entry
Append to \`.learnings/ERRORS.md\`:

\`\`\`markdown
## [ERR-YYYYMMDD-XXX] skill_or_command_name

**Logged**: ISO-8601 timestamp
**Priority**: high
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Summary
Brief description of what failed
\`\`\`
`;

const mockVersions = [
  { ver: "v3.0.4", date: "2 days ago", active: true },
  { ver: "v3.0.3", date: "1 week ago", active: false },
  { ver: "v3.0.2", date: "2 weeks ago", active: false },
  { ver: "v2.5.0", date: "1 month ago", active: false }
];


export default function SoulDetails({ params }: { params: { id: string } }) {
  const [activeTab, setActiveTab] = useState("readme");

  // Web3 State
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [factory, setFactory] = useState<ethers.Contract | null>(null);
  const [tokenInfo, setTokenInfo] = useState<any | null>(null);
  const [cost, setCost] = useState<bigint>(BigInt(0));
  const [target, setTarget] = useState<bigint>(BigInt(0));
  const [limit, setLimit] = useState<bigint>(BigInt(0));
  const [isTrading, setIsTrading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [ownsSoul, setOwnsSoul] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);

  // Follow states
  const [followersCount, setFollowersCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [localToast, setLocalToast] = useState<{msg: string, type: 'error' | 'success'} | null>(null);

  const showToast = (msg: string, type: 'error' | 'success') => {
    setLocalToast({ msg, type });
    setTimeout(() => setLocalToast(null), 3000);
  };

  async function loadTokenData() {
    try {
      let rpcProvider: ethers.Provider;
      let activeChainId = "31337";

      if (typeof window !== "undefined" && typeof (window as any).ethereum !== "undefined") {
        const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
        const network = await browserProvider.getNetwork();
        if ((config as any)[network.chainId.toString()]) {
          rpcProvider = browserProvider;
          activeChainId = network.chainId.toString();
        } else {
          rpcProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        }
      } else {
        rpcProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
      }

      if (rpcProvider instanceof ethers.BrowserProvider) {
        setProvider(rpcProvider);
      }

      const factoryAddress = (config as any)[activeChainId].factory.address;
      const factoryContract = new ethers.Contract(factoryAddress, Factory, rpcProvider);
      setFactory(factoryContract);

      // Fetch the specific token based on the route URL slug (which is now the token address)
      try {
        const tokenSale = await factoryContract.tokenToSale(params.id);
        if (tokenSale && tokenSale.token !== ethers.ZeroAddress) {
          setTokenInfo(tokenSale);

          const currentCost = await factoryContract.getCost(tokenSale.sold);
          setCost(currentCost);
          const targetVal = await factoryContract.TARGET();
          setTarget(targetVal);
          const limitVal = await factoryContract.TOKEN_LIMIT();
          setLimit(limitVal);
        }
      } catch (e) {
        console.error("Token not found or invalid address", e);
      }
    } catch (err) {
      console.error("Failed to load token data", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadFollowData(creatorAddress: string) {
    try {
      const web3Account = typeof window !== "undefined" ? localStorage.getItem("web3Account") || "" : "";
      const res = await fetch(`/api/follow?targetUserId=${creatorAddress}&web3Account=${web3Account}`);
      if (res.ok) {
        const data = await res.json();
        setFollowersCount(data.followersCount || 0);
        setIsFollowing(data.isFollowing || false);
      }
    } catch (e) {
      console.error("Failed to load follow data", e);
    }
  }

  useEffect(() => {
    loadTokenData();
  }, [params.id]);

  useEffect(() => {
    if (tokenInfo?.creator) {
      loadFollowData(tokenInfo.creator);
    }
  }, [tokenInfo]);

  async function toggleFollow() {
    if (!tokenInfo?.creator) return;
    setIsFollowLoading(true);
    try {
      const web3Account = typeof window !== "undefined" ? localStorage.getItem("web3Account") || "" : "";
      const res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: tokenInfo.creator, web3Account })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsFollowing(!isFollowing);
        setFollowersCount(prev => data.action === "followed" ? prev + 1 : prev - 1);
        showToast(data.action === "followed" ? "Followed creator!" : "Unfollowed creator", "success");
      } else {
        showToast(data.error || "Failed to toggle follow", "error");
      }
    } catch (error) {
      showToast("Error toggling follow", "error");
    }
    setIsFollowLoading(false);
  }

  async function handlePurchase() {
    if (!factory || !provider || !tokenInfo) return;

    setIsTrading(true);
    try {
      const signer = await provider.getSigner();

      // MOCK MARKETPLACE BUY:
      // In a real implementation this would call a marketplace contract.
      // Here we simulate the purchase and generate the API key.
      const transaction = await (factory as any).connect(signer).buy(
        tokenInfo.token,
        ethers.parseUnits("1", 18), // buying 1 access token
        { value: cost } // At the mock fixed price
      );
      await transaction.wait();
      
      alert("Successfully purchased Soul Access!");
      
      // MOCK: Generate the API Key locally for the demo
      const randomKey = "sk_live_" + Array.from({length: 32}, () => Math.floor(Math.random()*36).toString(36)).join('');
      setApiKey(randomKey);
      setOwnsSoul(true);

      loadTokenData();
    } catch (error) {
      console.error("Purchase failed", error);
      alert("Purchase failed or user rejected transaction.");
    } finally {
      setIsTrading(false);
    }
  }

  const tokenRaised = tokenInfo ? Number(ethers.formatUnits(tokenInfo.raised, 18)).toFixed(4) : "0.0000";
  const costEth = cost > BigInt(0) ? ethers.formatUnits(cost, 18) : "...";
  const isTargetReached = tokenInfo && (BigInt(tokenInfo.sold) >= limit || BigInt(tokenInfo.raised) >= target);

  return (
    <React.Suspense fallback={<div className="min-h-screen flex items-center justify-center pt-24 text-zinc-500">Loading Souls...</div>}>
      <main className="flex flex-col gap-6">
        <div className="flex flex-col gap-6 max-w-5xl mx-auto py-8 px-4 sm:px-8 pt-24 min-h-screen text-zinc-300">
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





          {/* Top Breadcrumb Nav */}
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-2">
            <Link href="/souls" className="hover:text-white transition-colors">Souls</Link>
            <span>/</span>
            <span className="text-zinc-300">{params.id}</span>
          </div>

          {/* Hero Meta Card */}
          <div className="relative w-full rounded-2xl border border-white/10 bg-[#121212] overflow-hidden">
            {/* Top Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-soul-purple to-pink-500"></div>

            <div className="p-8 flex flex-col md:flex-row gap-8 justify-between items-start">
              
              {/* Image Card addition */}
              <div className="w-full md:w-64 h-64 rounded-xl border border-white/5 bg-zinc-900 overflow-hidden flex-shrink-0 relative shadow-xl">
                 {/* Provide fallback or mock image dependent on params/context, using static mock for display */}
                 <img 
                    src={params.id.includes("MockAgentHack3r") ? "/soul_hacker_agent.png" 
                       : params.id.includes("MockTradingB") ? "/soul_trading_bot.png" 
                       : params.id.includes("MockShiba") ? "/soul_meme_dog.png" 
                       : "https://pump.mypinata.cloud/ipfs/QmZ4ea3wmwzwYwyWnhzs35hyxw4YryWB82TknGY3L5Wbxn"} 
                    alt="Token" 
                    className="w-full h-full object-cover" 
                 />
                 <div className="absolute top-2 left-2 px-2 py-1 bg-emerald-500/90 backdrop-blur text-white text-[10px] font-bold uppercase rounded flex items-center gap-1.5 shadow-lg">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                    LIVE
                 </div>
              </div>

              <div className="flex-1 w-full md:w-auto mt-2 md:mt-0">
                <h1 className="text-3xl font-bold text-white mb-2">{tokenInfo ? tokenInfo.name : params.id}</h1>
                <p className="text-sm text-zinc-400 max-w-2xl mb-6 leading-relaxed">
                  Captures learnings, errors, and corrections to enable continuous improvement. Use when: (1) A command or operation fails unexpectedly, (2) User corrects Claude...
                </p>

                <div className="inline-flex items-center gap-4 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm mb-6">
                  <span className="font-bold text-white">MIT-0</span>
                  <span className="text-zinc-500">Free to use, modify, and redistribute. No attribution required.</span>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono text-zinc-400 mb-4">
                  <span className="flex items-center gap-1 text-amber-400">★ 2.2k</span>
                  <span className="flex items-center gap-1">↓ 237k</span>
                  <span>• 3.7k current installs</span>
                  <span>• 3.8k all-time installs</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-500">by</span>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-orange-900 border border-orange-700 overflow-hidden flex items-center justify-center">
                      <span className="text-[10px] text-white">
                        {tokenInfo ? tokenInfo.creator.substring(2, 4).toUpperCase() : "NA"}
                      </span>
                    </div>
                    <span className="text-sm text-zinc-300 font-medium font-mono">
                      {tokenInfo ? `${tokenInfo.creator.slice(0, 6)}...${tokenInfo.creator.slice(38, 42)}` : "Unknown"}
                    </span>
                    {tokenInfo && (
                      <div className="ml-2 flex items-center gap-2">
                        <span className="text-xs text-zinc-500 font-bold">{followersCount} Followers</span>
                        <button 
                          onClick={toggleFollow}
                          disabled={isFollowLoading}
                          className={`text-xs px-3 py-1 font-bold rounded transition-colors disabled:opacity-50 ${isFollowing ? 'bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700' : 'bg-white text-black hover:bg-zinc-200'}`}
                        >
                          {isFollowLoading ? "..." : isFollowing ? "Unfollow" : "Follow"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {localToast && (
                  <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 text-xs px-4 py-2 rounded-full shadow-lg transition-all ${localToast.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
                      {localToast.msg}
                  </div>
              )}

              <div className="flex flex-col items-center justify-center gap-3 min-w-[260px] bg-black/40 border border-white/5 p-5 rounded-2xl">
                {isLoading ? (
                  <div className="text-zinc-500 text-sm py-4">Checking contract state...</div>
                ) : !tokenInfo ? (
                  <div className="text-zinc-500 text-sm py-4 text-center">Contract <br />not found on this chain.</div>
                ) : (
                  <div className="w-full flex flex-col gap-3">
                    {ownsSoul ? (
                      <div className="w-full flex flex-col gap-4">
                        <div className="bg-[#1c1c1c] p-4 rounded-xl border border-emerald-500/30">
                          <h4 className="text-emerald-400 font-bold mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Access Granted
                          </h4>
                          <p className="text-xs text-zinc-400 mb-3 leading-relaxed">You have purchased access to this Soul. Use the API key below to configure your agent.</p>
                          <div className="bg-black/50 p-3 rounded-lg flex items-center justify-between border border-white/10 group relative">
                            <code className="text-pink-400 font-mono text-xs truncate mr-4">{apiKey}</code>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(apiKey || "");
                                showToast("API Key copied!", "success");
                              }}
                              className="text-zinc-500 hover:text-white transition-colors"
                              title="Copy API Key"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full flex flex-col gap-4">
                        <div className="w-full flex justify-between items-center text-sm mb-2">
                           <span className="text-zinc-400 font-bold">Access Price</span>
                           <span className="text-pink-400 font-mono font-bold text-lg">{costEth} ETH</span>
                        </div>

                        <button
                          onClick={handlePurchase}
                          disabled={isTrading}
                          className="w-full py-4 text-white font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(167,139,250,0.3)] hover:shadow-[0_0_25px_rgba(167,139,250,0.5)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-soul-purple to-pink-500 hover:from-pink-500 hover:to-orange-500"
                        >
                          {isTrading ? "Processing..." : "Purchase Access"}
                        </button>
                        <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
                          Purchasing grants you a custom API key to configure and interact with this AI Agent permanently.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Security Scan Nested Card */}
            <div className="mx-8 mb-8 p-6 rounded-xl border border-white/5 bg-black/40">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Security Scan</div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <span className="font-bold text-white text-sm">VirusTotal</span>
                  </div>
                  <span className="px-2 py-0.5 bg-[#0f2e1a] text-[#4ade80] text-xs font-mono font-bold rounded border border-[#166534]">Benign</span>
                  <a href="#" className="text-xs text-zinc-500 hover:text-zinc-300 ml-auto flex items-center gap-1 transition-colors">
                    View report ↗
                  </a>
                </div>

                <div className="flex flex-col gap-2 relative">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="relative w-4 h-4 rounded-[4px] bg-gradient-to-br from-soul-purple to-pink-500 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-[2px] bg-black"></div>
                      </div>
                      <span className="font-bold text-white text-sm">Soulism<span className="text-zinc-500">Scan</span></span>
                    </div>
                    <span className="px-2 py-0.5 bg-[#0f2e1a] text-[#4ade80] text-xs font-mono font-bold rounded border border-[#166534]">Benign</span>
                    <span className="text-[10px] text-zinc-500 tracking-wider uppercase ml-2">High Confidence</span>
                  </div>

                  <div className="mt-3 pl-6 pr-4 py-3 bg-[#1a1a1a] rounded-lg border-l-2 border-l-soul-purple border-[0.5px] border-white/5 flex items-start gap-3">
                    <p className="text-xs text-zinc-400 leading-relaxed flex-1">
                      The skill's files, scripts, and runtime instructions are coherent with its stated purpose (logging learnings and injecting reminders); it requires no external credentials or network installs, and its hooks/scripts operate locally. Enable them only if you trust the code and the Soulism hook configuration.
                    </p>
                    <button className="text-[10px] text-orange-500 hover:text-orange-400 whitespace-nowrap pt-1">Details ▾</button>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 text-[10px] italic text-zinc-600">
                Security has layers — review code before you run it.
              </div>
            </div>

            {/* Extended License Sub-footer */}
            <div className="mx-8 mb-8">
              <div className="text-sm font-bold text-white mb-2">License</div>
              <div className="p-4 rounded-xl border border-white/5 bg-white/5">
                <div className="w-full bg-[#3f201b] rounded py-1 px-3 mb-3">
                  <span className="text-orange-200 text-xs font-mono font-bold">MIT-0</span>
                </div>
                <p className="text-xs text-zinc-400 mb-2">Free to use, modify, and redistribute. No attribution required.</p>
                <p className="text-xs text-zinc-500">Terms <a href="#" className="text-zinc-400 hover:text-white transition-colors">https://spdx.org/licenses/MIT-0.html</a></p>
              </div>
            </div>
          </div>

          {/* Tabs Layout */}
          <div className="flex border-b border-white/10 mt-4 overflow-x-auto no-scrollbar">
            {["README", "Files", "Compare", "Versions"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab.toLowerCase())}
                className={`px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.toLowerCase()
                  ? "text-white border-b-2 border-soul-purple"
                  : "text-zinc-500 hover:text-white"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Dynamic Tab Content Area */}
          <div className="min-h-[400px] mb-20">

            {/* Markdown Tab (README) */}
            {activeTab === "readme" && (
              <div className="prose prose-invert prose-zinc max-w-none prose-headings:font-display prose-headings:font-bold prose-a:text-soul-purple prose-code:text-orange-200 prose-code:bg-orange-900/20 prose-code:px-1 prose-code:rounded prose-pre:bg-[#13151a] prose-pre:border prose-pre:border-white/5 prose-pre:shadow-xl">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {mockReadme}
                </ReactMarkdown>
              </div>
            )}

            {/* Files Tab */}
            {activeTab === "files" && (
              <div className="rounded-xl border border-white/10 overflow-hidden bg-[#121212]">
                <div className="bg-white/5 px-4 py-2 border-b border-white/10 text-xs font-bold text-zinc-500">
                  EXPLORER
                </div>
                <div className="p-4 text-sm text-zinc-400 font-mono flex flex-col gap-2">
                  <div className="flex items-center gap-2 hover:text-white cursor-pointer"><span className="text-zinc-600">📁</span> assets</div>
                  <div className="flex items-center gap-2 hover:text-white cursor-pointer"><span className="text-zinc-600">📁</span> hooks</div>
                  <div className="flex items-center gap-2 hover:text-white cursor-pointer"><span className="text-zinc-600">📄</span> AGENT.md</div>
                  <div className="flex items-center gap-2 hover:text-white cursor-pointer"><span className="text-zinc-600">📄</span> LEARNINGS.md</div>
                  <div className="flex items-center gap-2 hover:text-white cursor-pointer text-soul-purple"><span className="text-zinc-600">📄</span> package.json</div>
                </div>
              </div>
            )}

            {/* Versions Tab */}
            {activeTab === "versions" && (
              <div className="rounded-xl border border-white/10 bg-[#121212] flex flex-col divide-y divide-white/5">
                {mockVersions.map((v, i) => (
                  <div key={i} className={`p-4 flex items-center justify-between ${v.active ? 'bg-white/5' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className="font-mono text-sm font-bold text-white">{v.ver}</div>
                      {v.active && <span className="px-2 py-0.5 bg-green-900/30 text-green-400 text-[10px] font-bold uppercase rounded border border-green-500/20">Active</span>}
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="text-sm text-zinc-500">{v.date}</span>
                      <button className="text-sm text-soul-purple hover:text-white transition-colors">Install</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Not implemented tabs */}
            {["compare"].includes(activeTab) && (
              <div className="flex flex-col items-center justify-center h-[300px] border border-white/5 border-dashed rounded-xl mt-4">
                <span className="text-3xl mb-4">🚧</span>
                <h3 className="text-lg font-bold text-white">Under Construction</h3>
                <p className="text-sm text-zinc-500 mt-2">The {activeTab} view is coming soon.</p>
              </div>
            )}

          </div>
        </div> </main>
    </React.Suspense>
  );
}
