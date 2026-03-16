import Link from 'next/link';
import docManifest from '../../generated/docs.generated.json';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  // Group documents by section
  const sections = docManifest.reduce((acc, doc) => {
    if (!acc[doc.section]) acc[doc.section] = [];
    acc[doc.section].push(doc);
    return acc;
  }, {} as Record<string, typeof docManifest>);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col pt-24 pb-20 px-6 sm:px-12 max-w-7xl mx-auto">
      {/* Navbar Placeholder */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 bg-soul-dark/60 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3 w-1/4">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-soul-purple to-blue-500 font-bold flex items-center justify-center shadow-[0_0_12px_var(--tw-colors-soul-glow)]">S</div>
          <span className="font-display font-bold text-xl tracking-tight">Soulism Docs</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Home</Link>
          <a href="http://localhost:3000" className="text-sm font-bold bg-white text-black px-4 py-2 rounded-full hover:bg-zinc-200 transition-colors">Open Control Plane</a>
        </div>
      </nav>

      <div className="flex flex-1 mt-8 gap-12">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 border-r border-white/10 pr-6 overflow-y-auto max-h-[calc(100vh-10rem)] sticky top-32">
          {Object.entries(sections).map(([sectionName, docs]) => (
            <div key={sectionName} className="mb-8">
              <h3 className="font-display font-bold text-sm uppercase tracking-wider text-soul-purple mb-4">
                {sectionName}
              </h3>
              <ul className="space-y-2">
                {docs.map((doc) => (
                  <li key={doc.href}>
                    <Link href={doc.href} className="text-sm text-zinc-400 hover:text-white transition-colors block py-1">
                      {doc.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 max-w-3xl">
          {children}
        </main>
      </div>
    </div>
  );
}
