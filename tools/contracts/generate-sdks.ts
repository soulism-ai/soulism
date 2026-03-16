import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { collectFiles, readDocument } from './lib/contract-validation';

type ContractKind = 'openapi' | 'asyncapi' | 'mcp-tools';

type ContractDescriptor = {
  id: string;
  kind: ContractKind;
  sourcePath: string;
  packageName: string;
  title: string;
  version: string;
  schemaVersion: string;
  routeCount: number;
  toolCount: number;
  sourceSize: number;
  sourceSha256: string;
  generatedClient: string;
};

type ContractGenerationSummary = {
  schemaVersion: string;
  generatedAt: string;
  status: 'generated' | 'failed';
  sourceRoot: string;
  generatedRoot: string;
  total: number;
  byKind: Record<ContractKind, number>;
  contracts: ContractDescriptor[];
};

const root = process.cwd();
const snapshotPath = join(root, 'testdata', 'snapshots', 'sdk-generation.json');
const generatedRoot = join(root, 'testdata', 'sdks');

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string => {
  return typeof value === 'string' ? value : '';
};

const asArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

const toSafeIdentifier = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[\\/.]/g, '__')
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const inferPackageName = (filePath: string): string => {
  const parts = relative(root, filePath).split(sep);
  const serviceIndex = parts.indexOf('services');
  if (serviceIndex >= 0 && parts[serviceIndex + 1]) {
    return parts[parts.length - 2] || 'unknown-service';
  }
  const packagesIndex = parts.indexOf('packages');
  if (packagesIndex >= 0 && parts[packagesIndex + 1]) {
    return parts[parts.length - 2] || 'unknown-package';
  }
  return parts.length >= 2 ? parts[parts.length - 2] || 'unknown-package' : 'unknown-package';
};

const countOpenApiRoutes = (document: Record<string, unknown>): number => {
  const paths = asRecord(document.paths);
  if (!paths) return 0;
  return Object.keys(paths).length;
};

const countAsyncApiChannels = (document: Record<string, unknown>): number => {
  const channels = asRecord(document.channels);
  if (!channels) return 0;
  return Object.keys(channels).length;
};

const buildContractDescriptor = async (sourcePath: string, kind: ContractKind): Promise<ContractDescriptor> => {
  const sourceRaw = await readFile(sourcePath, 'utf8');
  const { data } = await readDocument(sourcePath);
  const document = asRecord(data) || {};
  const sourceSha256 = sha256(sourceRaw);
  const packageName = inferPackageName(sourcePath);

  if (kind === 'openapi') {
    const info = asRecord(document.info);
    const title = asString(info?.title || packageName);
    const version = asString(info?.version || '0.0.0');
    const schemaVersion = asString(document.openapi || '3.0.0');
    const routeCount = countOpenApiRoutes(document);
    return {
      id: `openapi:${packageName}:${version}`,
      kind,
      sourcePath,
      packageName,
      title,
      version,
      schemaVersion,
      routeCount,
      toolCount: 0,
      sourceSize: Buffer.byteLength(sourceRaw),
      sourceSha256,
      generatedClient: ''
    };
  }

  if (kind === 'asyncapi') {
    const info = asRecord(document.info);
    const title = asString(info?.title || packageName);
    const version = asString(info?.version || '0.0.0');
    const schemaVersion = asString(document.asyncapi || '2.0.0');
    const routeCount = countAsyncApiChannels(document);
    return {
      id: `asyncapi:${packageName}:${version}`,
      kind,
      sourcePath,
      packageName,
      title,
      version,
      schemaVersion,
      routeCount,
      toolCount: 0,
      sourceSize: Buffer.byteLength(sourceRaw),
      sourceSha256,
      generatedClient: ''
    };
  }

  const title = asString(document.name || packageName);
  const tools = asArray(document.tools);
  const schemaVersion = asString(document.schemaVersion || '1.0.0');
  return {
    id: `mcp-tools:${packageName}:${schemaVersion}`,
    kind,
    sourcePath,
    packageName,
    title,
    version: schemaVersion,
    schemaVersion,
    routeCount: 0,
    toolCount: tools.length,
    sourceSize: Buffer.byteLength(sourceRaw),
    sourceSha256,
    generatedClient: ''
  };
};

const buildClientStub = (contract: ContractDescriptor): string => {
  return `export const contract = ${JSON.stringify(
    {
      kind: contract.kind,
      id: contract.id,
      sourcePath: contract.sourcePath,
      packageName: contract.packageName,
      title: contract.title,
      version: contract.version,
      routeCount: contract.routeCount,
      toolCount: contract.toolCount
    },
    null,
    2
  )} as const;\n\nexport const metadata = {\n  schemaVersion: '${contract.schemaVersion}',\n  sourceSha256: '${contract.sourceSha256}',\n  sourceSize: ${contract.sourceSize}\n} as const;\n\nexport const getContractSummary = () => ({\n  kind: contract.kind,\n  packageName: contract.packageName,\n  title: contract.title,\n  version: contract.version\n});\n`;
};

const run = async () => {
  const paths: Array<{ file: string; kind: ContractKind }> = [];

  const openApiFiles = await collectFiles(root, (_, fullPath) => /openapi\.(json|ya?ml)$/i.test(fullPath));
  const asyncApiFiles = await collectFiles(root, (_, fullPath) => /asyncapi\.(json|ya?ml)$/i.test(fullPath));
  const mcpToolFiles = await collectFiles(root, (_, fullPath) => fullPath.endsWith('mcp.tools.json'));

  paths.push(...openApiFiles.map((file) => ({ file, kind: 'openapi' as const })));
  paths.push(...asyncApiFiles.map((file) => ({ file, kind: 'asyncapi' as const })));
  paths.push(...mcpToolFiles.map((file) => ({ file, kind: 'mcp-tools' as const })));

  if (paths.length === 0) {
    throw new Error('sdk_generator_no_contracts');
  }

  await mkdir(dirname(snapshotPath), { recursive: true });
  await mkdir(generatedRoot, { recursive: true });

  const descriptors: ContractDescriptor[] = [];
  const byKind: Record<ContractKind, number> = {
    openapi: 0,
    asyncapi: 0,
    'mcp-tools': 0
  };

  for (let i = 0; i < paths.length; i += 1) {
    const item = paths[i];
    const contract = await buildContractDescriptor(item.file, item.kind);
    byKind[item.kind] += 1;

    const slug = toSafeIdentifier(`${i}-${contract.packageName}-${item.kind}-${contract.schemaVersion}`);
    const outputFile = join(generatedRoot, `${slug}.client.ts`);
    const clientCode = buildClientStub(contract);

    await writeFile(outputFile, clientCode, 'utf8');
    contract.generatedClient = outputFile;
    descriptors.push(contract);
  }

  const summary: ContractGenerationSummary = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    status: 'generated',
    sourceRoot: root,
    generatedRoot,
    total: descriptors.length,
    byKind,
    contracts: descriptors
  };

  const indexEntries = descriptors
    .map((contract) => `export { contract as ${toSafeIdentifier(contract.id.replace(/[:.]/g, '_'))} } from './${relative(generatedRoot, contract.generatedClient).replace(/\\.ts$/, '')}';`)
    .join('\n');

  await writeFile(snapshotPath, JSON.stringify(summary, null, 2), 'utf8');
  await writeFile(
    join(generatedRoot, 'index.ts'),
    `// Generated by tools/contracts/generate-sdks.ts\n${indexEntries}\nexport const generatedAt = '${summary.generatedAt}';\n`,
    'utf8'
  );

  console.log(`SDK artifacts generated: ${descriptors.length} contracts -> ${snapshotPath}`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
