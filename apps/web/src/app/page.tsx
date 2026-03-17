'use client'
import { GlowCard } from '@/components/GlowCard';
import { HeavenAnimation } from '@/components/HeavenAnimation';
import { MatrixBackground } from "@/components/matrix-background";
import Link from 'next/link';
const socials = {
  twitter: "https://x.com/azibatoraxr?s=21",
  telegram: "https://t.me/+MnX8_1fqY0A3YTYx",
  discord: "https://discord.gg/psWgGuth",
};
export default function Home() {
  return (
    <main className="h-screen relative flex flex-col pt-24 pb-20 px-6 sm:px-12 max-w-7xl mx-auto">
      {/* <HeavenAnimation /> */}
      <MatrixBackground />
      {/* Hero Section */}
      <div className="flex flex-col items-center text-center mt-16 mb-24 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-soul-purple/10 border border-soul-purple/20 text-soul-purple text-xs font-bold uppercase tracking-widest mb-8">
          <span className="w-2 h-2 rounded-full animate-pulse"></span>
          Open Source
        </div>

        <h1 className="font-display text-5xl sm:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500">
          Cognitive AI,<br />Governed in Code.
        </h1>

        <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mb-10 leading-relaxed">
          Self-host an AI assistant stack with memory, tools, personas, and real service boundaries. Provide your agents with eyes, ears, and absolute boundaries.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link href="/docs" className="px-8 py-4 rounded-full bg-white text-black font-bold hover:bg-zinc-200 transition-transform active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
            Documentation
          </Link>
          <a href="https://github.com/soulism-ai/soulism" className="px-8 py-4 rounded-full bg-transparent border border-white/10 hover:border-white/30 text-white font-bold transition-colors">
            View on GitHub
          </a>
        </div>
      </div>

      {/* Code Snippet */}
      <div className="w-full max-w-3xl mx-auto mb-32">
        <div className="glass-panel p-1 rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-black/80 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-white/5">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              <span className="ml-2 text-xs font-mono text-zinc-500">quickstart.sh</span>
            </div>
            <div className="p-6 font-mono text-sm leading-relaxed overflow-x-auto">
              <div className="flex"><span className="text-zinc-500 mr-4">1</span><span className="text-zinc-400"># Install dependencies</span></div>
              <div className="flex mb-4"><span className="text-zinc-500 mr-4">2</span><span className="text-green-400">$</span><span className="text-white ml-2">pnpm install</span></div>

              <div className="flex"><span className="text-zinc-500 mr-4">3</span><span className="text-zinc-400"># Bring up Gateway, Tools, Persona, and Audit ledgers</span></div>
              <div className="flex mb-4"><span className="text-zinc-500 mr-4">4</span><span className="text-green-400">$</span><span className="text-white ml-2">pnpm oss:up</span></div>

              <div className="flex"><span className="text-zinc-500 mr-4">5</span><span className="text-zinc-400"># Launch the Operator Control Plane</span></div>
              <div className="flex"><span className="text-zinc-500 mr-4">6</span><span className="text-green-400">$</span><span className="text-white ml-2">pnpm --filter web-control-plane dev</span></div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-center">

        <div className="flex space-x-4">
          <a href={socials.twitter} target="_blank" rel="noopener noreferrer" className="text-white">Twitter</a>
          <a href={socials.telegram} target="_blank" rel="noopener noreferrer" className="text-white">Telegram</a>
          <a href={socials.discord} target="_blank" rel="noopener noreferrer" className="text-white">Discord</a>
        </div>
      </div>
    </main>
  );
}
