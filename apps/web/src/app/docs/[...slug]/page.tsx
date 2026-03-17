import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import docManifest from '../../../generated/docs.generated.json';
import Link from 'next/link';
import { Metadata } from 'next';

type Props = {
  params: { slug: string[] };
};

export function generateStaticParams() {
  return docManifest.map((doc) => ({
    slug: doc.slug,
  }));
}

export function generateMetadata({ params }: Props): Metadata {
  const doc = docManifest.find((d) => d.slug.join('/') === params.slug.join('/'));

  if (!doc) {
    return { title: 'Not Found | Soulism Docs' };
  }

  return {
    title: `${doc.title} | Soulism Docs`,
    description: doc.summary,
  };
}

export default function DocPage({ params }: Props) {
  const slugPath = params.slug.join('/');
  const doc = docManifest.find((d) => d.slug.join('/') === slugPath);

  if (!doc) {
    notFound();
  }

  return (
    <article className="prose prose-invert prose-soul max-w-none">
      <div className="flex items-center gap-2 text-sm text-zinc-500 mb-8 pb-4 border-b border-white/10">
        <span className="uppercase tracking-wider">{doc.section}</span>
        <span>•</span>
        <span>{doc.title}</span>
      </div>

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => <h1 className="font-display text-4xl font-bold mb-6" {...props} />,
          h2: ({ node, ...props }) => <h2 className="font-display text-2xl font-bold mt-12 mb-4 text-white" {...props} />,
          h3: ({ node, ...props }) => <h3 className="font-display text-xl font-bold mt-8 mb-4 text-white" {...props} />,
          p: ({ node, ...props }) => <p className="text-zinc-300 leading-relaxed mb-6" {...props} />,
          a: ({ node, href, ...props }) => {
            const isInternal = href?.startsWith('/') || href?.startsWith('#');
            if (isInternal) {
              return <Link href={href as string} className="text-soul-purple hover:text-white underline decoration-soul-purple/30 underline-offset-4 transition-colors" {...props} />;
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-soul-purple hover:text-white underline decoration-soul-purple/30 underline-offset-4 transition-colors" {...props} />;
          },
          ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-6 mb-6 space-y-2 text-zinc-300 placeholder:marker:text-zinc-600" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-6 mb-6 space-y-2 text-zinc-300 marker:text-zinc-600" {...props} />,
          li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
              return <code className="bg-white/10 text-soul-purple px-1.5 py-0.5 rounded-md font-mono text-sm" {...props}>{children}</code>;
            }
            return (
              <div className="my-6 rounded-xl overflow-hidden glass-panel p-1">
                <div className="bg-white/80 rounded-lg p-4 overflow-x-auto">
                  <code className="font-mono text-sm text-zinc-300 leading-relaxed" {...props}>{children}</code>
                </div>
              </div>
            );
          },
          pre: ({ node, ...props }) => <pre className="m-0 p-0 bg-transparent" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-soul-purple/50 bg-soul-purple/5 pl-6 py-3 my-6 rounded-r-lg" {...props} />
          ),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-8 border border-white/10 rounded-xl">
              <table className="w-full text-left border-collapse" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => <th className="p-4 bg-white/5 font-bold border-b border-white/10" {...props} />,
          td: ({ node, ...props }) => <td className="p-4 border-b border-white/5 text-zinc-300" {...props} />,
        }}
      >
        {doc.body}
      </ReactMarkdown>
    </article>
  );
}
