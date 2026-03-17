"use client";

import Link from "next/link";
import Image from "next/image";
import { UserNav } from "./UserNav";
import { useState, useRef, useEffect } from "react";
import { ethers } from "ethers";

export function Navbar() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fee, setFee] = useState<bigint>(BigInt(0));
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [factory, setFactory] = useState<ethers.Contract | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [web3Account, setWeb3Account] = useState<string | null>(null);

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

  // Check for Web3 Account
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
    };
    checkWeb3();
  }, []);
  // Focus input when open
  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Handle Scroll
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 transition-all duration-300 ${isScrolled ? "bg-black/80 backdrop-blur-md border-b border-white/5 pointer-events-auto shadow-2xl" : "bg-transparent border-b border-transparent pointer-events-none"}`}>
      <div className="flex items-center gap-12 pointer-events-auto">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative w-8 h-8 rounded-md flex items-center justify-center shadow-[0_0_12px_var(--tw-colors-soul-glow)] transition-all group-hover:shadow-[0_0_20px_var(--tw-colors-soul-glow)] overflow-hidden">
            <Image src="/logo.png" alt="Soulism Logo" fill className="object-cover animate-[spin_10s_linear_infinite]" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-white drop-shadow-md">Soulism</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <Link href="/souls" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors drop-shadow-md">Souls</Link>
          <Link href="/docs" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors drop-shadow-md">Docs</Link>
          <button 
            onClick={() => window.dispatchEvent(new Event("toggle-support"))}
            className="text-sm font-medium text-zinc-300 hover:text-white transition-colors drop-shadow-md"
          >
            Support
          </button>
        </div>
      </div>

      <div className="flex items-center gap-6 pointer-events-auto">
        <Link 
          href="/souls/upload" 
          className="px-4 py-2 bg-green-500 border border-white/10 hover:bg-[#c2410c] text-white text-sm font-bold rounded-md transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Create
        </Link>
        <UserNav />
      </div>
    </nav>
  );
}
