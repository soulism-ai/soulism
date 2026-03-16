import { readFile, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

type LockDependency = {
  name: string;
  version: string;
  specifier?: string;
  transitive?: boolean;
};

type PackageJson = {
  name?: string;
  version?: string;
  description?: string;
  license?: unknown;
  author?: unknown;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type CycloneComponent = {
  type: 'application' | 'library';
  'bom-ref': string;
  name: string;
  version: string;
  supplier?: {
    name: string;
  };
  description?: string;
  licenses?: Array<{
    license: {
      name: string;
    };
  }>;
  properties?: Array<{
    name: string;
    value: string;
  }>;
};

type CycloneDependency = {
  ref: string;
  dependsOn: string[];
};

type CycloneOutput = {
  bomFormat: 'CycloneDX';
  specVersion: '1.5';
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: Array<{
      vendor: string;
      name: string;
      version: string;
    }>;
    component: {
      type: 'application';
      name: string;
      version: string;
      'bom-ref': string;
      description?: string;
    };
  };
  components: CycloneComponent[];
  dependencies: CycloneDependency[];
  externalReferences?: Array<{
    type: string;
    url: string;
  }>;
};

const root = process.cwd();
const excludedDirs = new Set(['node_modules', 'dist', '.git', '.turbo', '.next', 'coverage', 'ci/baselines']);
const outPath = join(root, 'ci', 'baselines', 'sbom.cdx.json');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const bomRef = (name: string, version: string): string =>
  `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;

const hashContent = (content: string): string => createHash('sha256').update(content).digest('hex');

const sanitizeLicense = (license: unknown): string | undefined => {
  if (typeof license === 'string' && license.trim().length > 0) {
    return license.trim();
  }
  if (isRecord(license) && typeof license.type === 'string' && license.type.trim().length > 0) {
    return license.type.trim();
  }
  return undefined;
};

const normalizeAuthor = (author: unknown): string | undefined => {
  if (typeof author === 'string' && author.trim().length > 0) return author.trim();
  if (isRecord(author) && typeof author.name === 'string' && author.name.trim().length > 0) return author.name.trim();
  return undefined;
};

const walkPackageJsonFiles = async (dir: string, acc: string[] = []): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === '.turbo') {
      continue;
    }

    const next = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkPackageJsonFiles(next, acc);
      continue;
    }
    if (entry.isFile() && entry.name === 'package.json') {
      acc.push(next);
    }
  }
  return acc;
};

const parsePackageName = (filePath: string): { workspace: string } => {
  const rel = filePath.replace(root.endsWith('/') ? root.length : root.length + 1, '');
  return { workspace: rel.replace('/package.json', '') || 'root' };
};

const parseLockfileDependencies = async (): Promise<LockDependency[]> => {
  const lockfilePath = join(root, 'pnpm-lock.yaml');
  try {
    const raw = await readFile(lockfilePath, 'utf8');
    const lines = raw.split('\n');
    const deps: LockDependency[] = [];
    for (const line of lines) {
      const match = line.match(/^\s{2,}(?<name>@?[^:]+):$/);
      if (!match?.groups?.name) continue;
      const spec = match.groups.name;
      if (spec.includes('/')) continue;
      const [name, version] = spec.split('@');
      if (!name || !version) continue;
      deps.push({ name, version, transitive: true });
    }
    return deps;
  } catch {
    return [];
  }
};

const collectComponents = async (): Promise<{
  components: CycloneComponent[];
  dependencyLinks: Array<{ packageName: string; packageVersion: string; packageRef: string; references: string[] }>;
}> => {
  const packagePaths = await walkPackageJsonFiles(root);
  const componentsMap = new Map<string, CycloneComponent>();
  const dependencyLinks: Array<{ packageName: string; packageVersion: string; packageRef: string; references: string[] }> = [];

  for (const filePath of packagePaths) {
    const raw = await readFile(filePath, 'utf8');
    const packageJson = JSON.parse(raw) as PackageJson;
    const name = packageJson.name;
    const version = packageJson.version;
    if (!name || !version) continue;

    const sourceRef = bomRef(name, version);
    const { workspace } = parsePackageName(filePath);
    const dependencies = Object.entries({
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {})
    });
    const refs: string[] = [];

    for (const [dependencyName, dependencyVersion] of dependencies) {
      const normalizedDependencyVersion = String(dependencyVersion).replace(/^[\^~]/, '').replace(/^v/, '');
      const dependencyRef = bomRef(dependencyName, normalizedDependencyVersion);
      refs.push(dependencyRef);

      if (!componentsMap.has(dependencyRef)) {
        const dependencyComponent: CycloneComponent = {
          type: 'library',
          'bom-ref': dependencyRef,
          name: dependencyName,
          version: normalizedDependencyVersion,
          description: `Dependency inferred from workspace manifest ${workspace}`,
          properties: [
            {
              name: 'soulism:manifest-path',
              value: filePath.replace(root.endsWith('/') ? root.length : root.length + 1, '')
            },
            {
              name: 'soulism:declared-in',
              value: workspace
            }
          ]
        };
        const license = sanitizeLicense(packageJson.license);
        if (license) {
          dependencyComponent.licenses = [{ license: { name: license } }];
        }
        componentsMap.set(dependencyRef, dependencyComponent);
      }
    }

    const component: CycloneComponent = {
      type: workspace === 'root' ? 'application' : 'library',
      'bom-ref': sourceRef,
      name,
      version,
      description: packageJson.description || `${workspace} workspace`,
      supplier: {
        name: normalizeAuthor(packageJson.author) || 'unknown'
      },
      properties: [
        {
          name: 'soulism:workspace',
          value: workspace
        },
        {
          name: 'soulism:manifest-basename',
          value: basename(filePath)
        },
        {
          name: 'soulism:private',
          value: String(Boolean(packageJson.private))
        }
      ]
    };
    const license = sanitizeLicense(packageJson.license);
    if (license) component.licenses = [{ license: { name: license } }];

    componentsMap.set(sourceRef, component);
    dependencyLinks.push({
      packageName: name,
      packageVersion: version,
      packageRef: sourceRef,
      references: refs
    });
  }

  return { components: [...componentsMap.values()], dependencyLinks };
};

const collectLockfileDependencies = async (componentMap: Map<string, CycloneComponent>): Promise<CycloneComponent[]> => {
  const lockDependencies = await parseLockfileDependencies();
  for (const lockDep of lockDependencies) {
    const ref = bomRef(lockDep.name, lockDep.version);
    if (componentMap.has(ref)) {
      continue;
    }
    componentMap.set(ref, {
      type: 'library',
      'bom-ref': ref,
      name: lockDep.name,
      version: lockDep.version,
      description: lockDep.transitive ? 'Transitive dependency from lockfile' : 'Dependency from lockfile',
      properties: [
        {
          name: 'soulism:source',
          value: 'pnpm-lock.yaml'
        }
      ]
    });
  }
  return [...componentMap.values()];
};

const run = async (): Promise<void> => {
  const discovered = await collectComponents();
  const componentMap = new Map<string, CycloneComponent>();
  for (const component of discovered.components) {
    componentMap.set(component['bom-ref'], component);
  }
  await collectLockfileDependencies(componentMap);

  const components = [...componentMap.values()].sort((left, right) => {
    if (left.name === right.name) return left.version.localeCompare(right.version);
    return left.name.localeCompare(right.name);
  });

  const dependencyIndex = new Map<string, string[]>();
  for (const link of discovered.dependencyLinks) {
    dependencyIndex.set(link.packageRef, link.references.filter(Boolean));
  }

  const dependencies: CycloneDependency[] = components
    .map((component) => ({
      ref: component['bom-ref'],
      dependsOn: dependencyIndex.get(component['bom-ref']) || []
    }))
    .filter((dependency) => dependency.dependsOn.length > 0);

  const appComponent = componentMap.get('pkg:npm/soulism-platform@0.1.0') || components[0];
  const bom: CycloneOutput = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [
        {
          vendor: 'soulism-platform',
          name: 'tsc',
          version: process.version
        }
      ],
      component: {
        type: 'application',
        name: appComponent?.name || 'soulism-platform',
        version: appComponent?.version || '0.1.0',
        'bom-ref': bomRef(appComponent?.name || 'soulism-platform', appComponent?.version || '0.1.0'),
        description: 'Policy-gated persona runtime and MCP services'
      }
    },
    components,
    dependencies,
    externalReferences: [
      {
        type: 'vcs',
        url: 'https://github.com/example/soulism-platform'
      },
      {
        type: 'issue-tracker',
        url: 'https://github.com/example/soulism-platform/issues'
      }
    ]
  };

  const payload = JSON.stringify(bom, null, 2);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, payload);
  const digest = hashContent(payload).slice(0, 20);
  console.log(`SBOM generated: ${outPath} (components=${components.length}, digest=${digest})`);
};

void run();
