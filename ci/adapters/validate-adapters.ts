import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type AdapterStatus = 'active' | 'planned';

type AdapterTarget = {
  id: string;
  status: AdapterStatus;
  descriptor: string;
};

type AdapterMatrix = {
  schemaVersion: string;
  updatedAt: string;
  targets: AdapterTarget[];
};

type AdapterDescriptor = {
  id: string;
  status: AdapterStatus;
  runtime: string;
  integrationBoundary: string;
  artifacts: string[];
  channels: string[];
};

const root = process.cwd();
const failures: string[] = [];

const readJson = async <T>(path: string): Promise<T> => {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as T;
};

const run = async () => {
  const matrixPath = join(root, 'ci/adapters/adapter-matrix.json');
  const matrix = await readJson<AdapterMatrix>(matrixPath);

  if (!matrix.schemaVersion) failures.push('adapter-matrix.json: missing schemaVersion');
  if (!Array.isArray(matrix.targets) || matrix.targets.length === 0) {
    failures.push('adapter-matrix.json: targets must be non-empty');
  }

  for (const target of matrix.targets) {
    const descriptorPath = join(root, target.descriptor);
    let descriptor: AdapterDescriptor | null = null;

    try {
      descriptor = await readJson<AdapterDescriptor>(descriptorPath);
    } catch (error) {
      failures.push(`${target.id}: descriptor parse error (${String(error)})`);
      continue;
    }

    if (descriptor.id !== target.id) failures.push(`${target.id}: descriptor id mismatch`);
    if (descriptor.status !== target.status) failures.push(`${target.id}: descriptor status mismatch`);
    if (!descriptor.runtime) failures.push(`${target.id}: missing runtime`);
    if (!descriptor.integrationBoundary) failures.push(`${target.id}: missing integrationBoundary`);
    if (!Array.isArray(descriptor.channels) || descriptor.channels.length === 0) {
      failures.push(`${target.id}: channels must be non-empty`);
    }
    if (!Array.isArray(descriptor.artifacts) || descriptor.artifacts.length === 0) {
      failures.push(`${target.id}: artifacts must be non-empty`);
    }

    for (const artifact of descriptor.artifacts) {
      const artifactPath = join(root, artifact);
      try {
        const data = await readFile(artifactPath);
        if (data.byteLength === 0) {
          failures.push(`${target.id}: artifact empty (${artifact})`);
        }
      } catch {
        failures.push(`${target.id}: artifact missing (${artifact})`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('Adapter validation failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`Adapter validation passed (${matrix.targets.length} targets).`);
};

void run();
