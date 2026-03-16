"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";

// Expanded mock data to fill out a grid
const allSouls = [
  {
    name: "Trello Core",
    slug: "trello-core",
    description: "Manage Trello boards, lists, and cards via the Trello REST API. Built for complex agent orchestration.",
    author: "@steipete",
    stars: 106,
    downloads: "26.1k",
    status: "healthy",
    avatarColor: "from-blue-500 to-cyan-500",
    timeAgo: "2h ago",
    usage: 85
  },
  {
    name: "Slack Connect",
    slug: "slack-connect",
    description: "Control Slack from Soulbot via the slack tool, including reacting to messages and managing channels.",
    author: "@steipete",
    stars: 92,
    downloads: "28k",
    status: "healthy",
    avatarColor: "from-purple-500 to-pink-500",
    timeAgo: "5h ago",
    usage: 92
  },
  {
    name: "CalDAV Calendar",
    slug: "caldav",
    description: "Sync and query CalDAV calendars (iCloud, Google, Fastmail) using the gateway protocol directly.",
    author: "@Asleep123",
    stars: 173,
    downloads: "19.7k",
    status: "optimal",
    avatarColor: "from-orange-500 to-amber-500",
    timeAgo: "1d ago",
    usage: 65
  },
  {
    name: "Answer Overflow",
    slug: "answer-overflow",
    description: "Search indexed Discord community discussions via Answer Overflow. Find solutions instantly.",
    author: "@RhysSullivan",
    stars: 123,
    downloads: "12.4k",
    status: "healthy",
    avatarColor: "from-indigo-500 to-blue-600",
    timeAgo: "3d ago",
    usage: 45
  },
  {
    name: "Agent Browser",
    slug: "agent-browser",
    description: "A fast Rust-based headless browser automation CLI that enables AI agents to navigate and snapshot.",
    author: "@TheSethRose",
    stars: 599,
    downloads: "138k",
    status: "optimal",
    avatarColor: "from-red-500 to-orange-500",
    timeAgo: "12h ago",
    usage: 98
  },
  {
    name: "Self-Improving Agent",
    slug: "self-improving",
    description: "Captures learnings, errors, and corrections to enable continuous improvement upon operation failures.",
    author: "@pskoett",
    stars: 220,
    downloads: "237k",
    status: "healthy",
    avatarColor: "from-emerald-400 to-teal-500",
    timeAgo: "4h ago",
    usage: 88
  },
  {
    name: "GitHub Automation",
    slug: "github-auto",
    description: "Interact with GitHub using the 'gh' CLI. Use 'gh issue', 'gh pr', 'gh run', and 'gh api'.",
    author: "@steipete",
    stars: 377,
    downloads: "115k",
    status: "optimal",
    avatarColor: "from-zinc-400 to-zinc-600",
    timeAgo: "1w ago",
    usage: 75
  },
  {
    name: "Stripe Billing Ops",
    slug: "stripe-ops",
    description: "Manage subscriptions, generate payment links, and handle refunds securely with bounded permissions.",
    author: "@iioiioiioii",
    stars: 45,
    downloads: "3.2k",
    status: "healthy",
    avatarColor: "from-violet-500 to-purple-600",
    timeAgo: "30m ago",
    usage: 20
  },
  {
    name: "Linear Sync",
    slug: "linear-sync",
    description: "Bi-directional sync with Linear. Create issues, update states, and assign points autonomously.",
    author: "@linear",
    stars: 890,
    downloads: "450k",
    status: "optimal",
    avatarColor: "from-slate-600 to-slate-800",
    timeAgo: "2w ago",
    usage: 95
  },
  {
    name: "PostgreSQL DBA",
    slug: "pg-dba",
    description: "Automated DBA persona that can analyze slow queries, recommend indexes, and monitor health.",
    author: "@dbmaster",
    stars: 156,
    downloads: "18.9k",
    status: "warning",
    avatarColor: "from-sky-400 to-blue-500",
    timeAgo: "1m ago",
    usage: 12
  },
  {
    name: "Notion Brain",
    slug: "notion-brain",
    description: "Connect your agent to a Notion workspace for long-term memory retrieval and documentation.",
    author: "@notionhq",
    stars: 432,
    downloads: "88k",
    status: "healthy",
    avatarColor: "from-stone-300 to-stone-500",
    timeAgo: "5d ago",
    usage: 68
  },
  {
    name: "Twitter Persona",
    slug: "twitter-persona",
    description: "A governed persona for drafting, reviewing, and publishing tweets with human-in-the-loop gates.",
    author: "@socialbot",
    stars: 78,
    downloads: "9.5k",
    status: "healthy",
    avatarColor: "from-blue-400 to-cyan-300",
    timeAgo: "8h ago",
    usage: 42
  }
];

export default function SoulsHub() {
  const { data: session } = useSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("Highlighted");

  // Simple filter logic for demonstration
  const filteredSouls = allSouls.filter(soul => 
    soul.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    soul.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 max-w-[1400px] mx-auto py-8 px-4 sm:px-8 pt-24 min-h-screen">
      
      {/* Header and Search Section */}
      <section className="flex flex-col gap-6 mb-2">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight">Souls</h1>
            <span className="text-zinc-500 font-mono text-sm">(25,589)</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/souls/upload" className="px-4 py-2 bg-[#ea580c] hover:bg-[#c2410c] text-white text-sm font-bold rounded-md transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Create
            </Link>
            {!session && (
              <button onClick={() => signIn("github")} className="px-4 py-2 bg-[#2ea043] hover:bg-[#238636] text-white text-sm font-bold rounded-md transition-colors">
                Sign in
              </button>
            )}
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
            {["Highlighted", "Agents", "Live", "New", "Trending", "Hide suspicious"].map((filter) => (
              <button 
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors border ${
                  activeFilter === filter 
                    ? "bg-white/10 text-white border-white/20" 
                    : "bg-transparent text-zinc-400 border-transparent hover:bg-white/5"
                }`}
              >
                {filter === "Highlighted" && <span className="mr-1.5 text-yellow-500">★</span>}
                {filter === "Live" && <span className="mr-1.5 text-red-500">●</span>}
                {filter === "Trending" && <span className="mr-1.5 text-orange-500">🔥</span>}
                {filter}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
             <button className="flex items-center gap-2 px-3 py-1.5 bg-[#1c1c1c] border border-white/10 rounded text-xs text-zinc-300 hover:bg-white/5 transition-colors">
               <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
               Filter
             </button>
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredSouls.map((soul, idx) => (
              <div key={idx} className="flex flex-col bg-[#121212] border border-white/5 hover:border-white/20 rounded-xl p-4 transition-colors group cursor-pointer relative overflow-hidden">
                
                {/* Top Row: Avatar Context */}
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-14 h-14 rounded-lg flex-shrink-0 bg-gradient-to-br ${soul.avatarColor} shadow-inner flex items-center justify-center`}>
                    <span className="text-white font-bold text-xl drop-shadow-md">
                      {soul.name.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-white truncate group-hover:text-soul-purple transition-colors">{soul.name}</h3>
                    <p className="text-xs text-zinc-500 truncate">{soul.slug}</p>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-zinc-400">
                       <img src="/logo.png" className="w-3 h-3 opacity-50 grayscale" alt="author" />
                       <span className="truncate">{soul.author}</span>
                       <span className="mx-1">•</span>
                       <span>{soul.timeAgo}</span>
                    </div>
                  </div>
                </div>

                {/* Status / "Market Cap" Bar mimicking Pump.fun */}
                <div className="flex flex-col gap-1 mb-3">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-500 font-mono">USAGE</span>
                    <span className="text-emerald-400 font-mono font-bold">↑ {soul.usage}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full" 
                      style={{ width: `${soul.usage}%` }}
                    ></div>
                  </div>
                </div>

                {/* Description Snippet */}
                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-4 flex-1">
                  {soul.description}
                </p>

                {/* Footer Stats */}
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 mt-auto pt-3 border-t border-white/5">
                  <span className="flex items-center gap-1 group-hover:text-amber-400 transition-colors">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    {soul.stars}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    {soul.downloads}
                  </span>
                </div>

              </div>
            ))}
          </div>
        )}
      </section>

      {/* Authentication CTA if logged out */}
      {!session && (
        <section className="col-span-full dashboard-card text-center py-10 mt-6 border border-white/10 bg-[#121212]">
          <h3 className="text-lg font-bold mb-2">Want to list your own souls?</h3>
          <p className="text-zinc-500 text-sm mb-6 max-w-sm mx-auto">Sign in with your GitHub account to sync, list, and govern your custom personas and tools.</p>
          <button 
            onClick={() => signIn("github")}
            className="px-6 py-2.5 bg-white text-black text-sm font-bold rounded-full hover:bg-zinc-200 transition-colors inline-flex items-center gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
            </svg>
            Sign in with GitHub
          </button>
        </section>
      )}
    </div>
  );
}
