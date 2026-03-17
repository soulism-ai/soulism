"use client";

import Link from "next/link";
import Image from "next/image";
import { UserNav } from "./UserNav";
import { useState, useRef, useEffect } from "react";

export function Navbar() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close search when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus input when open
  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 pointer-events-none">
      <div className="flex items-center gap-12 pointer-events-auto">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative w-8 h-8 rounded-md flex items-center justify-center shadow-[0_0_12px_var(--tw-colors-soul-glow)] transition-all group-hover:shadow-[0_0_20px_var(--tw-colors-soul-glow)] overflow-hidden">
            <Image src="/logo.png" alt="Soulism Logo" fill className="object-cover" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-white drop-shadow-md">Soulism</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <Link href="/souls" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors drop-shadow-md">Souls</Link>
          <Link href="/souls/upload" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors drop-shadow-md">Upload</Link>
          <button className="text-sm font-medium text-zinc-300 hover:text-white transition-colors drop-shadow-md">Import</button>

          {/* Interactive Search Component */}
          <div ref={searchRef} className="relative flex items-center">
            {isSearchOpen ? (
              <div className="flex items-center bg-[#1c1c1c]/90 backdrop-blur-md border border-white/20 rounded-full overflow-hidden transition-all duration-300 w-64 shadow-xl">
                <div className="pl-3 text-zinc-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search souls..."
                  className="w-full bg-transparent border-none text-white px-2 py-1.5 focus:outline-none placeholder:text-zinc-500 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setIsSearchOpen(false);
                    // Add routing logic for "Enter" if needed eventually
                  }}
                />
                <button
                  onClick={() => setIsSearchOpen(false)}
                  className="pr-3 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsSearchOpen(true)}
                className="text-sm font-medium text-zinc-300 hover:text-white transition-colors drop-shadow-md flex items-center gap-1.5"
              >
                Search
              </button>
            )}

            {/* Simulated Search Dropdown Results */}
            {isSearchOpen && searchQuery.length > 0 && (
              <div className="absolute top-10 left-0 w-80 bg-[#1c1c1c] border border-white/10 rounded-xl shadow-2xl py-2 z-50 overflow-hidden">
                <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/5 mb-1">
                  Results for "{searchQuery}"
                </div>
                <div className="max-h-64 overflow-y-auto no-scrollbar">
                  {/* Mock Result 1 */}
                  <div className="px-3 py-2 hover:bg-white/5 cursor-pointer flex items-center gap-3 transition-colors">
                    <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">T</div>
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate">Trello Core</div>
                      <div className="text-xs text-zinc-500 truncate">trello-core • @steipete</div>
                    </div>
                  </div>
                  {/* Mock Result 2 */}
                  <div className="px-3 py-2 hover:bg-white/5 cursor-pointer flex items-center gap-3 transition-colors">
                    <div className="w-8 h-8 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">S</div>
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate">Self-Improving Agent</div>
                      <div className="text-xs text-zinc-500 truncate">self-improving • @pskoett</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 pointer-events-auto">
        <UserNav />
      </div>
    </nav>
  );
}
