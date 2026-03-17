"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [web3Account, setWeb3Account] = useState<string | null>(null);
  const [isCheckingWeb3, setIsCheckingWeb3] = useState(true);

  useEffect(() => {
    const checkWeb3 = async () => {
      if (typeof window !== "undefined" && typeof (window as any).ethereum !== "undefined") {
        if (localStorage.getItem("web3_disconnected") !== "true") {
          try {
            const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) setWeb3Account(accounts[0]);
          } catch (err) {
            console.error(err);
          }
        }
      }
      setIsCheckingWeb3(false);
    };
    checkWeb3();
  }, []);

  useEffect(() => {
    if (status === "unauthenticated" && !isCheckingWeb3 && !web3Account) {
      router.push("/");
    }
  }, [status, isCheckingWeb3, web3Account, router]);

  const [activeTab, setActiveTab] = useState("Bought Souls");
  const [dashboardData, setDashboardData] = useState<any>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (status !== "unauthenticated" || web3Account) {
        try {
          const res = await fetch(`/api/dashboard?web3Account=${web3Account || ""}`);
          if (res.ok) {
            const data = await res.json();
            setDashboardData(data);
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    fetchDashboardData();
  }, [status, web3Account]);

  if (status === "loading" || isCheckingWeb3) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading...</div>;
  }

  // Use the GitHub username or email as a fallback
  const username = session?.user?.name || session?.user?.email?.split('@')[0] || (web3Account ? `@${web3Account.slice(0, 6)}...${web3Account.slice(38, 42)}` : "User");
  const userImage = session?.user?.image || "";

  const tabs = ["Bought Souls", "Created Souls", "Selling", "Favorites", "Revenue", "Replies", "Notifications"];

  return (
    <main className="min-h-screen pt-24 pb-20 px-6 sm:px-12 max-w-5xl mx-auto">
      {/* Profile Header section imitating Pump.fun */}
      <div className="mb-12">
        <Link href="/" className="inline-flex items-center text-zinc-400 hover:text-white mb-8 transition-colors">
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </Link>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/10 pb-8">
          <div className="flex items-center gap-6">
            {userImage ? (
              <img src={userImage} alt={username} className="w-24 h-24 rounded-full border-2 border-soul-purple shadow-[0_0_15px_rgba(234,88,12,0.5)]" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-zinc-800 border-2 border-soul-purple flex items-center justify-center text-2xl font-bold p-1">
                <div className="w-full h-full rounded-full bg-zinc-700 flex items-center justify-center">
                  {username.charAt(0).toUpperCase()}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold flex items-center gap-3">
                {username}
                <button className="text-xs px-3 py-1 bg-white/10 hover:bg-white/20 rounded font-medium transition-colors">edit</button>
              </h1>

              <div className="flex items-center gap-2 text-sm text-zinc-500 font-mono">
                <span className="truncate max-w-[120px]">4X7Y6...5sce</span>
                <button className="hover:text-white"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg></button>
                <a href="#" className="hover:text-white ml-2 flex items-center gap-1">View on solscan <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></a>
              </div>

              <div className="flex items-center gap-6 mt-2 text-sm">
                <div className="flex flex-col"><span className="font-bold text-white text-lg">0</span><span className="text-zinc-500">Followers</span></div>
                <div className="flex flex-col"><span className="font-bold text-white text-lg">0</span><span className="text-zinc-500">Following</span></div>
                <div className="flex flex-col"><span className="font-bold text-white text-lg">0</span><span className="text-zinc-500">Created souls</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-6 border-b border-white/5 mt-6 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab
                  ? "text-white border-b-2 border-soul-purple"
                  : "text-zinc-500 hover:text-white"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area based on Active Tab */}
      <div className="min-h-[400px]">
        {activeTab === "Bought Souls" ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-6">
                <span className="text-zinc-500 text-sm font-medium tracking-wide">Total Portfolio Value</span>
                <div className="text-4xl font-bold font-mono text-white mt-2">{dashboardData?.portfolioValue || "0.000"} <span className="text-xl text-zinc-500">ETH</span></div>
              </div>
              <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-6">
                <span className="text-zinc-500 text-sm font-medium tracking-wide">Realized PnL</span>
                <div className="text-4xl font-bold font-mono text-emerald-400 mt-2">{Number(dashboardData?.realizedPnl || 0) >= 0 ? "+" : ""}{dashboardData?.realizedPnl || "0.000"} <span className="text-xl text-zinc-500">ETH</span></div>
              </div>
            </div>

            <div className="w-full bg-[#121212] border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 border-b border-white/10 text-xs text-zinc-500 font-mono uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Token / Soul</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4 hidden sm:table-cell">Price (ETH)</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(dashboardData?.boughtSouls || []).map((trade: any, i: number) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-bold text-white flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-soul-purple flex items-center justify-center text-xs">{trade.slug || "UNKN"}</div>
                        {trade.soul_name}
                      </td>
                      <td className="px-6 py-4 font-mono text-zinc-300">{Number(trade.amount).toFixed(4)}</td>
                      <td className="px-6 py-4 font-mono text-zinc-400 hidden sm:table-cell">{Number(trade.price_eth).toFixed(3)}</td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/souls/${trade.slug?.toLowerCase()}`} className="text-xs px-3 py-1.5 bg-soul-purple hover:bg-pink-600 font-bold rounded text-white transition-colors">Trade</Link>
                      </td>
                    </tr>
                  ))}
                  {!(dashboardData?.boughtSouls?.length) && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">No souls bought yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === "Created Souls" ? (
          <div className="flex flex-col border border-white/10 rounded-2xl bg-[#1d1513] p-12 text-center items-center justify-center h-[350px]">
            <div className="w-12 h-12 mb-4 bg-white/5 rounded flex items-center justify-center text-zinc-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-2">No souls yet</h3>
            <p className="text-zinc-400 mb-8 max-w-sm mx-auto">Upload your first soul to share it with the community.</p>
            <Link href="/souls/upload" className="px-6 py-3 bg-[#c2410c] hover:bg-[#9a3412] text-white font-bold rounded-lg transition-colors flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload a Soul
            </Link>
          </div>
        ) : activeTab === "Favorites" ? (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold font-display px-2">Your Favorited Souls</h2>
            <div className="w-full bg-[#121212] border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 border-b border-white/10 text-xs text-zinc-500 font-mono uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Soul</th>
                    <th className="px-6 py-4">Market Cap</th>
                    <th className="px-6 py-4 hidden sm:table-cell">24h Vol</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-bold text-white flex items-center gap-3">
                      <div className="w-8 h-8 rounded border border-white/10 overflow-hidden"><img src="/soul_hacker_agent.png" alt="Soul" className="w-full h-full object-cover" /></div>
                      NeoHacker Agent
                    </td>
                    <td className="px-6 py-4 font-mono text-emerald-400">$1,350</td>
                    <td className="px-6 py-4 font-mono text-zinc-400 hidden sm:table-cell">$420.50</td>
                    <td className="px-6 py-4 text-right">
                      <Link href="/souls/neohacker" className="text-xs px-3 py-1.5 bg-soul-purple hover:bg-pink-600 font-bold rounded text-white transition-colors">Trade</Link>
                    </td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-bold text-white flex items-center gap-3">
                      <div className="w-8 h-8 rounded border border-white/10 overflow-hidden"><img src="/soul_meme_dog.png" alt="Soul" className="w-full h-full object-cover" /></div>
                      CyberDoge
                    </td>
                    <td className="px-6 py-4 font-mono text-emerald-400">$12,600</td>
                    <td className="px-6 py-4 font-mono text-zinc-400 hidden sm:table-cell">$1,200.00</td>
                    <td className="px-6 py-4 text-right">
                      <Link href="/souls/cyberdoge" className="text-xs px-3 py-1.5 bg-soul-purple hover:bg-pink-600 font-bold rounded text-white transition-colors">Trade</Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === "Selling" ? (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold font-display px-2">Active Limit/Sell Orders</h2>
            <div className="w-full bg-[#121212] border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 border-b border-white/10 text-xs text-zinc-500 font-mono uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Soul</th>
                    <th className="px-6 py-4">Selling Amount</th>
                    <th className="px-6 py-4 hidden sm:table-cell">List Price (ETH)</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-bold text-white flex items-center gap-3">
                      <div className="w-8 h-8 rounded border border-white/10 overflow-hidden bg-purple-500 flex items-center justify-center text-xs">TR</div>
                      Trello Core
                    </td>
                    <td className="px-6 py-4 font-mono text-zinc-300">5.0000</td>
                    <td className="px-6 py-4 font-mono text-zinc-400 hidden sm:table-cell">0.05 / token</td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-xs px-3 py-1.5 border border-red-500 hover:bg-red-500 hover:text-white text-red-500 font-bold rounded transition-colors">Cancel</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === "Revenue" ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="flex-1 bg-gradient-to-br from-emerald-900/30 to-[#121212] border border-emerald-500/20 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z" /></svg></div>
                <span className="text-emerald-400/80 text-sm font-medium tracking-wide">Total Protocol Revenue</span>
                <div className="text-4xl font-bold font-mono text-emerald-400 mt-2">{dashboardData?.totalRevenue || "0.000"} <span className="text-lg text-emerald-500/60">ETH</span></div>
                <p className="text-xs text-zinc-500 mt-2">Earned from trading fees on Created Souls.</p>
              </div>
              <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-6">
                <span className="text-zinc-500 text-sm font-medium tracking-wide">Pending Claim</span>
                <div className="text-3xl font-bold font-mono text-white mt-2">0.000 <span className="text-lg text-zinc-500">ETH</span></div>
                <button className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-sm transition-colors w-full">Claim Rewards</button>
              </div>
            </div>

            <h2 className="text-lg font-bold font-display px-2 mt-4">Revenue Breakdown (Recent Trades)</h2>
            <div className="w-full bg-[#121212] border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 border-b border-white/10 text-xs text-zinc-500 font-mono uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Soul</th>
                    <th className="px-6 py-4">Trade Action</th>
                    <th className="px-6 py-4 text-right">Fee Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(dashboardData?.trades || []).slice(0, 5).map((trade: any, i: number) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-bold text-white">{trade.soul_name}</td>
                      <td className="px-6 py-4 font-mono text-zinc-400 uppercase">{trade.trade_type}</td>
                      <td className="px-6 py-4 font-mono text-emerald-400 text-right">{Number(trade.fee_eth).toFixed(4)} ETH</td>
                    </tr>
                  ))}
                  {!(dashboardData?.trades?.length) && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-zinc-500">No trading activity yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-zinc-500 h-[200px]">
            {activeTab} content goes here
          </div>
        )}
      </div>

    </main>
  );
}
