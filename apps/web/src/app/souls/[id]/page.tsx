"use client";

import React, { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto py-8 px-4 sm:px-8 pt-24 min-h-screen text-zinc-300">
      
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
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white mb-2">{params.id}</h1>
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
                     <span className="text-[10px] text-white">PS</span>
                  </div>
                  <span className="text-sm text-zinc-300 font-medium">@pskoett</span>
               </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3 min-w-[200px]">
            <div className="w-full flex flex-col items-center bg-white/5 border border-white/10 rounded-xl p-3 mb-2">
               <span className="text-[10px] uppercase text-zinc-500 font-bold tracking-widest mb-1">Current Version</span>
               <span className="text-lg font-bold text-white">v3.0.4</span>
            </div>
            <button className="w-full px-6 py-3 bg-[#c2410c] hover:bg-[#9a3412] text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-center">
              Download zip
            </button>
            <button className="w-full px-4 py-2 mt-4 bg-transparent border border-white/10 hover:border-white/30 text-zinc-400 hover:text-white rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              <span className="text-amber-500">★</span> Report
            </button>
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
             Like a lobster shell, security has layers — review code before you run it.
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
            className={`px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.toLowerCase()
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
    </div>
  );
}
