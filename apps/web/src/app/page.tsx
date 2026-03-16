import { GlowCard } from '@/components/GlowCard';
import { HeavenAnimation } from '@/components/HeavenAnimation';

export default function Home() {
  return (
    <main className="min-h-screen relative flex flex-col pt-24 pb-20 px-6 sm:px-12 max-w-7xl mx-auto">
      <HeavenAnimation />

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
          <a href="http://localhost:3000" className="px-8 py-4 rounded-full bg-white text-black font-bold hover:bg-zinc-200 transition-transform active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
            Launch Control Plane
          </a>
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

      {/* Feature Grid */}
      <div className="w-full max-w-5xl mx-auto">
        <h2 className="font-display text-3xl font-bold mb-10 text-center">Engineered for Reality</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          <GlowCard
            title="Real Service Boundaries"
            description="Gateway, policy, budgets, audit, personas, and memory are exposed as actual deployable microservices, not just a script."
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            }
          />

          <GlowCard
            title="Policy Gate & Budgets"
            description="Tools aren't executed blindly by the model. Every proxy action runs through a policy gate assessing constraints, limits, and human-in-the-loop requirement."
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            }
          />

          <GlowCard
            title="Immutable Audit Ledger"
            description="Externally impactful actions produce append-only, tamper-evident audit records. Understand exactly what your agent did and why."
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            }
          />

          <GlowCard
            title="Signed Personas"
            description="A persona is not 'prompt vibes'. It is a governed, signed configuration dictating reasoning boundaries, tool access, and memory retention policy."
            icon={
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            }
          />
        </div>
      </div>
    </main>
  );
}
