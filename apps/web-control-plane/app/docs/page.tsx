import Link from 'next/link';
import { getDocsBySection } from '../../src/docs';
import { SiteChrome } from '../../src/components/SiteChrome';

export default async function DocsIndexPage() {
  const docsBySection = await getDocsBySection();
  const sections = Object.entries(docsBySection).sort(([left], [right]) => left.localeCompare(right));
  const totalDocs = sections.reduce((count, [, docs]) => count + docs.length, 0);

  return (
    <SiteChrome>
      <main className="docs-shell">
        <section className="docs-hero">
          <p className="hero-eyebrow">Documentation</p>
          <h1>Docs that read like a product surface and stay tied to the repo.</h1>
          <p className="hero-lead">
            {totalDocs} documents across {sections.length} sections, published from the markdown already maintained for architecture, APIs, runbooks, ADRs, and compliance.
          </p>
          <div className="hero-trust">
            <span>Repo-generated pages</span>
            <span>Searchable by section</span>
            <span>Public and operator-friendly</span>
          </div>
        </section>

        <div className="docs-directory">
          {sections.map(([section, docs]) => (
            <section key={section} className="docs-directory-section">
              <div className="docs-directory-head">
                <h2>{section}</h2>
                <span>{docs.length} docs</span>
              </div>
              <div className="docs-directory-grid">
                {docs.map((doc) => (
                  <Link key={doc.href} href={doc.href} className="docs-directory-card">
                    <h3>{doc.title}</h3>
                    <p>{doc.summary}</p>
                    <small>{doc.filePath}</small>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </SiteChrome>
  );
}
