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
    <div className="min-h-screen bg-white text-black flex flex-col pt-24 pb-20 px-6 sm:px-12  mx-auto">

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
