"use client";

import Link from "next/link";
import Image from "next/image";
import { UserNav } from "./UserNav";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4">
      <div className="flex items-center gap-12">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative w-8 h-8 rounded-md flex items-center justify-center shadow-[0_0_12px_var(--tw-colors-soul-glow)] transition-all group-hover:shadow-[0_0_20px_var(--tw-colors-soul-glow)] overflow-hidden">
            <Image src="/logo.png" alt="Soulism Logo" fill className="object-cover" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">Soulism</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <Link href="/souls" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Souls</Link>
          <Link href="/souls/upload" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Upload</Link>
          <button className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Import</button>
          <button className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Search</button>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <UserNav />
      </div>
    </nav>
  );
}
