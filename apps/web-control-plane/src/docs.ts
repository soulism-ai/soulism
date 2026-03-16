import path from 'node:path';
import docsManifest from './generated/docs.generated.json';

export type DocEntry = {
  slug: string[];
  href: string;
  title: string;
  section: string;
  summary: string;
  body: string;
  filePath: string;
};

const titleCase = (value: string): string =>
  value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const sectionTitle = (section: string): string => {
  if (section === 'adr') return 'Architecture Decisions';
  if (section === 'api') return 'APIs';
  return titleCase(section);
};

const docs = docsManifest as DocEntry[];

export const getDocs = async (): Promise<DocEntry[]> => docs;

export const getDocsBySection = async () => {
  const docs = await getDocs();
  return docs.reduce<Record<string, DocEntry[]>>((grouped, doc) => {
    grouped[doc.section] ||= [];
    grouped[doc.section].push(doc);
    return grouped;
  }, {});
};

export const getDoc = async (slug: string[]): Promise<DocEntry | null> => {
  const docs = await getDocs();
  return docs.find((doc) => doc.slug.join('/') === slug.join('/')) ?? null;
};

export const normalizeDocHref = (currentSlug: string[], href: string | undefined): string | undefined => {
  if (!href) return href;
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) return href;
  if (href.startsWith('/')) return href;
  if (!href.endsWith('.md')) return href;

  const resolved = path.posix.normalize(path.posix.join('/docs', currentSlug.slice(0, -1).join('/'), href.replace(/\.md$/, '')));
  return resolved;
};
