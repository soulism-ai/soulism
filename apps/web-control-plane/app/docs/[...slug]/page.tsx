import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SiteChrome } from '../../../src/components/SiteChrome';
import { getDoc, getDocs, getDocsBySection, normalizeDocHref } from '../../../src/docs';

type PageProps = {
  params: Promise<{ slug: string[] }>;
};

export async function generateStaticParams() {
  const docs = await getDocs();
  return docs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getDoc(slug);
  if (!doc) {
    return {
      title: 'Docs not found'
    };
  }
  return {
    title: `${doc.title} | Cognitive AI Docs`,
    description: doc.summary
  };
}

export default async function DocDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = await getDoc(slug);
  if (!doc) notFound();

  const docsBySection = await getDocsBySection();
  const relatedDocs = (docsBySection[doc.section] ?? []).slice(0, 8);

  return (
    <SiteChrome>
      <main className="docs-shell docs-shell-detail">
        <aside className="docs-sidebar">
          <Link href="/docs" className="docs-backlink">
            All documentation
          </Link>
          <h2>{doc.section}</h2>
          <nav className="docs-nav">
            {relatedDocs.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                className={entry.href === doc.href ? 'docs-nav-link docs-nav-link-active' : 'docs-nav-link'}
              >
                {entry.title}
              </Link>
            ))}
          </nav>
        </aside>

        <article className="docs-article">
          <div className="docs-article-meta">
            <span className="docs-section-chip">{doc.section}</span>
            <span>{doc.filePath}</span>
          </div>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              pre: ({ children }) => <>{children}</>,
              a: ({ href, children }) => {
                const normalized = normalizeDocHref(doc.slug, href);
                if (normalized?.startsWith('/')) {
                  return <Link href={normalized}>{children}</Link>;
                }
                return (
                  <a href={normalized} target={normalized?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                    {children}
                  </a>
                );
              },
              code: ({ className, children, ...props }) => {
                const content = String(children).replace(/\n$/, '');
                const isInline = !className;
                if (isInline) {
                  return (
                    <code className="docs-inline-code" {...props}>
                      {content}
                    </code>
                  );
                }
                return (
                  <pre className="docs-code-block">
                    <code {...props}>{content}</code>
                  </pre>
                );
              }
            }}
          >
            {doc.body}
          </ReactMarkdown>
        </article>
      </main>
    </SiteChrome>
  );
}
