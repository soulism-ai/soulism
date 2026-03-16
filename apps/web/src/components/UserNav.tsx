"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import React, { useState } from "react";

export function UserNav() {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (status === "loading") {
    return <div className="text-zinc-500 text-sm">Loading...</div>;
  }

  if (status === "unauthenticated") {
    return (
      <button 
        onClick={() => signIn("github")}
        className="px-4 py-2 bg-[#ea580c] hover:bg-[#c2410c] text-white text-sm font-bold rounded-full transition-colors"
      >
        Sign in with GitHub
      </button>
    );
  }

  return (
    <div className="relative">
      <button 
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 border border-white/10 px-3 py-1.5 rounded-full hover:bg-white/5 transition-colors"
      >
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center overflow-hidden">
          {session?.user?.image ? (
            <img src={session.user.image} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-white">
              {session?.user?.name?.charAt(0) || "U"}
            </span>
          )}
        </div>
        <span className="text-sm font-medium text-white select-none">
          {session?.user?.name || session?.user?.email}
        </span>
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3 h-3 text-zinc-400 transition-transform ${menuOpen ? "rotate-180" : ""}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-xl py-1 z-50">
          <div className="px-4 py-2 border-b border-white/5">
            <p className="text-xs text-zinc-500">Signed in as</p>
            <p className="text-sm font-bold text-white truncate">{session?.user?.email}</p>
          </div>
          <div className="py-1">
            <a href="/dashboard" className="block px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors">Account / Dashboard</a>
            <a href="/settings" className="block px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors">Settings</a>
          </div>
          <div className="py-1 border-t border-white/5">
            <button 
              onClick={() => signOut()}
              className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
