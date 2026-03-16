export default function DocsIndex() {
  return (
    <div className="prose prose-invert prose-soul max-w-none">
      <h1 className="font-display text-4xl font-bold mb-6">Soulism Documentation</h1>
      <p className="text-xl text-zinc-400 mb-8 leading-relaxed">
        Welcome to the official Soulism documentation. Select a topic from the sidebar to get started.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
        <div className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
          <h3 className="text-lg font-bold mb-2">Getting Started</h3>
          <p className="text-sm text-zinc-400">Learn how to setup and self-host the Soulism AI cognitive assistant stack.</p>
        </div>
        <div className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
          <h3 className="text-lg font-bold mb-2">Architecture</h3>
          <p className="text-sm text-zinc-400">Understand the real service boundaries mapping tools, personas, and memory.</p>
        </div>
      </div>
    </div>
  );
}
