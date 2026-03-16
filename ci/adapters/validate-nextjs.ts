import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const failures: string[] = [];

const run = async () => {
  const descriptorPath = join(root, 'ci/adapters/nextjs.adapter.json');
  const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as {
    id?: string;
    status?: string;
    runtime?: string;
    artifacts?: string[];
    channels?: string[];
  };

  if (descriptor.id !== 'nextjs-adapter') failures.push('nextjs_adapter_id_mismatch');
  if (descriptor.status !== 'active') failures.push('nextjs_adapter_not_active');
  if (descriptor.runtime !== 'edge-http') failures.push('nextjs_adapter_runtime_invalid');
  if (!Array.isArray(descriptor.channels) || !descriptor.channels.includes('nextjs-app-router')) {
    failures.push('nextjs_adapter_channel_missing');
  }
  if (!Array.isArray(descriptor.artifacts) || descriptor.artifacts.length < 2) {
    failures.push('nextjs_adapter_artifacts_missing');
  }

  for (const artifact of descriptor.artifacts || []) {
    const file = await readFile(join(root, artifact)).catch(() => null);
    if (!file || file.byteLength === 0) failures.push(`nextjs_artifact_missing_or_empty:${artifact}`);
  }

  if (failures.length > 0) {
    console.error(`Next.js adapter validation failed: ${failures.join(',')}`);
    process.exit(1);
  }

  console.log('Next.js adapter validation passed.');
};

void run();

