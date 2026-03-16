"use client";

import React from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";

const highlightedSouls = [
  {
    name: "Trello Core",
    description: "Manage Trello boards, lists, and cards via the Trello REST API.",
    author: "@steipete",
    stars: 106,
    downloads: "26.1k",
    status: "healthy"
  },
  {
    name: "Slack Connect",
    description: "Use when you need to control Slack from Soulbot via the slack tool, including reacting to messages.",
    author: "@steipete",
    stars: 92,
    downloads: "28k",
    status: "healthy"
  },
  {
    name: "CalDAV Calendar",
    description: "Sync and query CalDAV calendars (iCloud, Google, Fastmail, Nextcloud, etc.) using the gateway.",
    author: "@Asleep123",
    stars: 173,
    downloads: "19.7k",
    status: "optimal"
  },
  {
    name: "Answer Overflow",
    description: "Search indexed Discord community discussions via Answer Overflow. Find solutions instantly.",
    author: "@RhysSullivan",
    stars: 123,
    downloads: "12.4k",
    status: "healthy"
  }
];

export default function SoulsHub() {
  const { data: session } = useSession();

  return (
    <div className="flex flex-col gap-12 max-w-5xl mx-auto py-8">
      {/* Hero Section */}
      <section className="flex flex-col md:flex-row gap-12 items-center">
        <div className="flex-1">
          <div className="inline-block px-3 py-1 bg-soul-purple/20 border border-soul-purple/30 rounded-full text-xs font-bold text-soul-purple mb-6">
            Soulism-Native. Agent-Ready.
          </div>
          <h1 className="font-display text-5xl font-bold tracking-tight mb-6">
            Souls Hub, the skill dock for <span className="text-soul-purple">sharp agents.</span>
          </h1>
          <p className="text-lg text-zinc-400 mb-8 leading-relaxed max-w-lg">
            Upload Persona & Tool bundles, version them like npm, and make them searchable with vectors. No gatekeeping, just signal.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/souls/upload" className="px-6 py-3 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold rounded-full transition-transform active:scale-95">
              Publish a soul
            </Link>
            <button className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-full transition-colors">
              Browse souls
            </button>
          </div>
        </div>
        
        {/* Terminal/Command Snippet */}
        <div className="flex-1 w-full relative">
           <div className="absolute inset-0 bg-soul-purple/20 blur-[100px] rounded-full z-0 pointer-events-none"></div>
           <div className="dashboard-card relative z-10 glow-border p-6 shadow-2xl bg-black/80 backdrop-blur-xl">
             <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-4">
               <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Install CLI via</span>
               <div className="flex gap-2 ml-4">
                 <span className="px-2 py-1 bg-soul-purple/20 text-soul-purple rounded text-xs font-mono">npm</span>
                 <span className="px-2 py-1 bg-white/5 text-zinc-400 rounded text-xs font-mono">pnpm</span>
                 <span className="px-2 py-1 bg-white/5 text-zinc-400 rounded text-xs font-mono">bun</span>
               </div>
             </div>
             <div className="bg-black/50 border border-white/10 rounded-lg p-4 font-mono text-sm text-zinc-300">
                <span className="text-zinc-600 mr-2">$</span> npx soulhub@latest install trello-core
             </div>
           </div>
        </div>
      </section>

      {/* Highlighted section */}
      <section>
        <div className="mb-6 border-b border-white/10 pb-4">
          <h2 className="text-2xl font-display font-bold">Highlighted souls</h2>
          <p className="text-zinc-500 text-sm mt-1">Curated signal — highlighted for quick trust.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {highlightedSouls.map((soul, idx) => (
            <div key={idx} className="dashboard-card flex flex-col justify-between hover:border-soul-purple/50 transition-colors group cursor-pointer">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className={`pill ${soul.status === 'optimal' ? 'pill-healthy' : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'}`}>
                    Highlighted
                  </span>
                </div>
                <h3 className="font-bold text-lg mb-2">{soul.name}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed mb-6">{soul.description}</p>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-white/5 pt-4 mt-auto group-hover:border-soul-purple/20 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center">
                    <span className="text-[10px] uppercase">{soul.author.charAt(1)}</span>
                  </div>
                  <span>{soul.author}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 group-hover:text-amber-400 transition-colors">
                    ★ {soul.stars}
                  </span>
                  <span className="flex items-center gap-1">
                    ↓ {soul.downloads}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Authentication CTA if logged out */}
      {!session && (
        <section className="dashboard-card text-center py-12 border-dashed border-white/20 mt-8">
          <h3 className="text-xl font-bold mb-3">Want to upload your own souls?</h3>
          <p className="text-zinc-400 mb-6">Sign in with your GitHub account to sync, list, and govern your personas.</p>
          <button 
            onClick={() => signIn("github")}
            className="px-6 py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-colors inline-flex items-center gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
            </svg>
            Sign in with GitHub
          </button>
        </section>
      )}
    </div>
  );
}
