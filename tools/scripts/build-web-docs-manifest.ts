import { promises as fs } from 'node:fs';
import path from 'node:path';

type DocManifestEntry = {
  slug: string[];
  href: string;
  title: string;
  section: string;
  summary: string;
  body: string;
  filePath: string;
};

const root = process.cwd();
const docsRoot = path.join(root, 'docs');
const outPath = path.join(root, 'apps/web-control-plane/src/generated/docs.generated.json');

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

const stripMarkdown = (value: string): string =>
  value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseSummary = (body: string): string => {
  const lines = body.split('\n').map((line) => line.trim());
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('```') || line.startsWith('- ') || line.startsWith('* ')) continue;
    const clean = stripMarkdown(line);
    if (clean.length > 40) return clean;
  }
  return 'Operational guidance, architecture, and product references for the Cognitive AI platform.';
};

const readMarkdownFiles = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const resolved = path.join(dir, entry.name);
      if (entry.isDirectory()) return readMarkdownFiles(resolved);
      return entry.isFile() && entry.name.endsWith('.md') ? [resolved] : [];
    })
  );
  return files.flat().sort();
};

const buildManifest = async (): Promise<DocManifestEntry[]> => {
  const files = await readMarkdownFiles(docsRoot);
  const docs = await Promise.all(
    files.map(async (filePath) => {
      const relative = path.relative(docsRoot, filePath).replace(/\\/g, '/');
      const slug = relative.replace(/\.md$/, '').split('/');
      const body = await fs.readFile(filePath, 'utf8');
      const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || titleCase(slug.at(-1) || 'Document');
      return {
        slug,
        href: `/docs/${slug.join('/')}`,
        title,
        section: sectionTitle(slug[0] || 'docs'),
        summary: parseSummary(body),
        body,
        filePath: relative
      };
    })
  );

  return docs.sort((left, right) => left.href.localeCompare(right.href));
};

const run = async () => {
  const manifest = await buildManifest();
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`wrote ${manifest.length} docs to ${path.relative(root, outPath)}`);
};

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
