"use client";

import React from "react";
import Image from "next/image";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  web3Account: string | null;
  onDisconnect: () => void;
}

export function WalletModal({ isOpen, onClose, web3Account, onDisconnect }: WalletModalProps) {
  if (!isOpen) return null;

  const handleCopy = () => {
    if (web3Account) {
      navigator.clipboard.writeText(web3Account);
    }
  };

  const displayAccount = web3Account 
    ? `${web3Account.slice(0, 4)}...${web3Account.slice(-4)}`
    : "Not connected";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-sm bg-[#111111] border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col items-center animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-6 h-6 bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-white rounded-full flex items-center justify-center transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-medium text-white mb-1">
          @q948wprewq
        </h2>
        <p className="text-sm text-zinc-400 mb-4">ummmm</p>

        <button className="flex items-center gap-2 px-3 py-1.5 border border-white/20 rounded-lg hover:bg-white/5 transition-colors mb-6">
          <span className="text-sm font-medium text-white text-shadow-sm">Edit profile</span>
          <svg className="w-3.5 h-3.5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>

        <div className="flex items-center gap-3 mb-6 relative">
          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-transparent bg-gradient-to-r from-blue-400 to-pink-500 p-[2px]">
            <div className="w-full h-full bg-[#111] rounded-full overflow-hidden relative">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4" alt="Avatar" className="w-full h-full object-cover" />
            </div>
          </div>
          <span className="text-xl font-medium text-white">0</span>
        </div>

        <div className="flex items-center gap-2 mb-6 cursor-pointer hover:opacity-80 transition-opacity" onClick={handleCopy}>
          <span className="text-sm font-medium text-zinc-200">{displayAccount}</span>
          <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>

        <div className="w-full mb-6">
          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-between cursor-pointer hover:bg-white/[0.04] transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-transparent flex items-center justify-center">
                <svg className="w-6 h-6 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-white">transfer from wallet</span>
                <span className="text-xs text-zinc-400">no limits • instant</span>
              </div>
            </div>
            <div className="w-6 h-6 bg-indigo-400 rounded-md flex items-center justify-center" style={{ borderRadius: '4px' }}>
               <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5zm4 4h-2v-2h2v2zm0-4h-2V7h2v5z"/>
               </svg>
            </div>
          </div>
        </div>

        <div className="w-full flex items-center gap-4 mb-6 opacity-60">
          <div className="h-px bg-white/20 flex-1"></div>
          <span className="text-sm text-zinc-500 font-medium">or</span>
          <div className="h-px bg-white/20 flex-1"></div>
        </div>

        <div className="w-full flex flex-col gap-3">
          <button className="w-full py-3.5 bg-emerald-300 hover:bg-emerald-400 text-black text-sm font-bold rounded-xl transition-colors">
            Withdraw
          </button>
          
          <button className="w-full py-3.5 bg-emerald-300 hover:bg-emerald-400 text-black text-sm font-bold rounded-xl transition-colors">
            Export wallet
          </button>
          
          <button onClick={() => { onDisconnect(); onClose(); }} className="w-full py-3.5 bg-[#3a3a41] hover:bg-[#4a4a51] text-white text-sm font-bold rounded-xl transition-colors">
            Disconnect wallet
          </button>
        </div>
      </div>
    </div>
  );
}
