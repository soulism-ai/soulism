"use client";

import { useSession, signOut } from "next-auth/react";
import React, { useState } from "react";
import Link from "next/link";
import { AuthModal } from "./AuthModal";
import { WalletModal } from "./WalletModal";

export function UserNav() {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [web3Account, setWeb3Account] = useState<string | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const connectWeb3 = async () => {
    if (typeof window !== "undefined" && typeof (window as any).ethereum !== "undefined") {
      try {
        const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        localStorage.removeItem("web3_disconnected");
        setWeb3Account(accounts[0]);
      } catch (err) {
        console.error(err);
      }
    } else {
      alert("Please install MetaMask.");
    }
  };

  React.useEffect(() => {
    if (typeof window !== "undefined" && typeof (window as any).ethereum !== "undefined") {
      if (localStorage.getItem("web3_disconnected") !== "true") {
        (window as any).ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
          if (accounts.length > 0) setWeb3Account(accounts[0]);
        });
      }

      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          setWeb3Account(null);
        } else if (localStorage.getItem("web3_disconnected") !== "true") {
          setWeb3Account(accounts[0]);
        }
      };
      (window as any).ethereum.on('accountsChanged', handleAccountsChanged);
      return () => (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
    }
  }, []);

  if (status === "loading") {
    return <div className="text-zinc-500 text-sm">Loading...</div>;
  }

  if (status === "unauthenticated" && !web3Account) {
    return (
      <>
        <button
          onClick={() => setAuthOpen(true)}
          className="px-4 py-2 bg-[#ea580c] hover:bg-[#c2410c] text-white text-sm font-bold rounded-full transition-colors"
        >
          Sign in
        </button>
        <AuthModal
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          onConnectWeb3={connectWeb3}
        />
      </>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 border border-white/10 px-3 py-1.5 rounded-full hover:bg-white/5 transition-colors max-w-[160px] sm:max-w-[200px]"
      >
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 flex flex-shrink-0 items-center justify-center overflow-hidden">
          {session?.user?.image ? (
            <img src={session.user.image} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-white">
              {session?.user?.name?.charAt(0) || "U"}
            </span>
          )}
        </div>
        <span className="text-sm font-medium text-white select-none truncate">
          {session?.user?.name || session?.user?.email || (web3Account ? `${web3Account.slice(0, 6)}...${web3Account.slice(38, 42)}` : "User")}
        </span>
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3 h-3 flex-shrink-0 text-zinc-400 transition-transform ${menuOpen ? "rotate-180" : ""}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl py-1 z-50 overflow-hidden">
          <div className="py-1">
            <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm font-medium text-white hover:bg-white/5 transition-colors">
              <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </Link>
            
            <button 
              onClick={() => { setMenuOpen(false); setWalletModalOpen(true); }} 
              className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm font-medium text-white hover:bg-white/5 transition-colors"
            >
              <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              Wallet
            </button>
            
            <button 
              onClick={() => { 
                if (web3Account) navigator.clipboard.writeText(web3Account); 
                setMenuOpen(false); 
              }} 
              className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm font-medium text-white hover:bg-white/5 transition-colors"
            >
              <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy address
            </button>
            
            <button
              onClick={() => {
                localStorage.setItem("web3_disconnected", "true");
                setWeb3Account(null);
                signOut();
              }}
              className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm font-medium text-white hover:bg-white/5 transition-colors"
            >
              <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}

      <WalletModal 
        isOpen={walletModalOpen} 
        onClose={() => setWalletModalOpen(false)} 
        web3Account={web3Account || session?.user?.name || ""}
        onDisconnect={() => {
          localStorage.setItem("web3_disconnected", "true");
          setWeb3Account(null);
          signOut();
        }}
      />
    </div>
  );
}
