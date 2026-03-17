"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectWeb3: () => Promise<void>;
}

export function AuthModal({ isOpen, onClose, onConnectWeb3 }: AuthModalProps) {
  const [view, setView] = useState<"main" | "social">("main");
  const [email, setEmail] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-sm bg-[#111111] border border-white/10 rounded-2xl shadow-2xl overflow-y-auto max-h-[85vh] flex flex-col items-center p-6 animate-in zoom-in-95 duration-200 no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-white rounded-full flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        {view === "main" ? (
          <>
            <h2 className="text-lg font-bold text-white mb-6">Connect or create wallet</h2>

            <div className="mb-8 w-16 h-16 bg-gradient-to-br from-emerald-400 to-green-600 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-12 outline outline-2 outline-white/10 outline-offset-[6px]">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            </div>

            <div className="w-full flex flex-col gap-3">
              <button
                onClick={() => setView("social")}
                className="w-full relative flex items-center justify-between px-5 py-4 bg-transparent border border-white/10 hover:border-white/30 rounded-xl transition-colors group text-left"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  <div>
                    <div className="text-sm font-medium text-white mb-0.5">Login with email or socials</div>
                    <div className="text-xs text-zinc-500">Zero confirmation trading</div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>

              <div className="flex items-center gap-4 my-2 opacity-60">
                <div className="h-px bg-white/10 flex-1"></div>
                <span className="text-xs text-zinc-500 uppercase tracking-widest font-medium">or</span>
                <div className="h-px bg-white/10 flex-1"></div>
              </div>

              {[
                { name: "Phantom", icon: <div className="w-6 h-6 rounded bg-purple-500 flex items-center justify-center text-[10px] text-white font-bold">P</div> },
                { name: "Solflare", icon: <div className="w-6 h-6 rounded bg-yellow-500 flex items-center justify-center text-[10px] text-white font-bold">S</div> },
                { name: "Torus", icon: <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center text-[10px] text-white font-bold">T</div> },
                { name: "MetaMask", icon: <div className="w-6 h-6 rounded bg-orange-500 flex items-center justify-center text-[10px] text-white font-bold">M</div> }
              ].map((wallet) => (
                <button
                  key={wallet.name}
                  onClick={async () => {
                    await onConnectWeb3();
                    onClose();
                  }}
                  className="w-full flex items-center gap-4 px-5 py-3.5 bg-transparent border border-white/10 hover:border-white/30 rounded-xl transition-colors text-left"
                >
                  {wallet.icon}
                  <span className="text-sm font-medium text-white">{wallet.name}</span>
                </button>
              ))}

              <button className="w-full flex items-center gap-4 px-5 py-3.5 bg-transparent border border-white/10 hover:border-white/30 rounded-xl transition-colors text-left">
                <div className="w-6 h-6 flex items-center justify-center text-zinc-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                </div>
                <span className="text-sm font-medium text-white">More wallets</span>
              </button>

            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-white mb-6">Log in or sign up</h2>

            <div className="mb-8 w-16 h-16 bg-gradient-to-br from-emerald-400 to-green-600 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-12 outline outline-2 outline-white/10 outline-offset-[6px]">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            </div>

            <div className="w-full flex flex-col gap-3">
              {/* Email Form */}
              <form onSubmit={(e) => { e.preventDefault(); alert("Email Magic Links not fully implemented in demo."); }} className="relative mb-2">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  className="w-full bg-transparent border border-white/20 hover:border-white/40 focus:border-soul-purple focus:outline-none rounded-xl pl-12 pr-20 py-3.5 text-sm text-white placeholder:text-zinc-600 transition-colors"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={!email}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-500 hover:text-white disabled:opacity-50 disabled:hover:text-zinc-500 transition-colors px-2 py-1"
                >
                  Submit
                </button>
              </form>

              <button
                onClick={() => signIn("google")}
                className="w-full flex items-center gap-4 px-4 py-3.5 bg-transparent border border-white/10 hover:border-white/30 rounded-xl transition-colors text-left"
              >
                <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center p-1">
                  {/* Minimal G logo representation */}
                  <span className="text-[12px] font-bold text-red-500">G</span>
                </div>
                <span className="text-sm font-medium text-white">Google / GitHub</span>
              </button>

              <button
                className="w-full flex items-center gap-4 px-4 py-3.5 bg-transparent border border-white/10 hover:border-white/30 rounded-xl transition-colors text-left"
              >
                <div className="w-6 h-6 flex items-center justify-center text-white">
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </div>
                <span className="text-sm font-medium text-white">Twitter</span>
              </button>

              <button
                className="w-full flex items-center gap-4 px-4 py-3.5 bg-transparent border border-white/10 hover:border-white/30 rounded-xl transition-colors text-left"
              >
                <div className="w-6 h-6 flex items-center justify-center text-white">
                  <svg viewBox="0 0 384 512" className="w-5 h-5" fill="currentColor"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" /></svg>
                </div>
                <span className="text-sm font-medium text-white">Apple</span>
              </button>

              <button
                onClick={() => setView("main")}
                className="w-full mt-2 relative flex items-center justify-between px-5 py-3.5 bg-transparent border border-white/10 hover:border-white/30 rounded-xl transition-colors group text-left"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                  <span className="text-sm font-medium text-white">Continue with a wallet</span>
                </div>
                <svg className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
