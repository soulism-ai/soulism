import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();

const run = async () => {
  const descriptorPath = join(root, 'ci/adapters/hf.adapter.json');
  const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as {
    id?: string;
    status?: string;
    runtime?: string;
    artifacts?: string[];
    channels?: string[];
  };

  const failures: string[] = [];
  if (descriptor.id !== 'hf-space') failures.push('hf_adapter_id_mismatch');
  if (descriptor.status !== 'active') failures.push('hf_adapter_not_active');
  if (descriptor.runtime !== 'http') failures.push('hf_adapter_runtime_invalid');
  if (!Array.isArray(descriptor.channels) || !descriptor.channels.includes('huggingface-space')) {
    failures.push('hf_adapter_channel_missing');
  }
  if (!Array.isArray(descriptor.artifacts) || descriptor.artifacts.length < 2) {
    failures.push('hf_adapter_artifacts_missing');
  }

  const artifactDigests: Array<{ path: string; digest: string }> = [];
  for (const artifact of descriptor.artifacts || []) {
    const file = await readFile(join(root, artifact)).catch(() => null);
    if (!file || file.byteLength === 0) {
      failures.push(`hf_artifact_missing_or_empty:${artifact}`);
      continue;
    }
    artifactDigests.push({
      path: artifact,
      digest: `sha256:${createHash('sha256').update(file).digest('hex')}`
    });
  }

  const report = {
    schemaVersion: '1.0.0',
    adapter: descriptor.id || 'hf-space',
    runtime: descriptor.runtime || 'http',
    integrationBoundary: 'gateway-rest',
    passed: failures.length === 0,
    artifactDigests,
    createdAt: new Date().toISOString()
  };

  await writeFile(join(root, 'ci/baselines/adapter-hf.probe.json'), JSON.stringify(report, null, 2), 'utf8');

  if (failures.length > 0) {
    console.error(`HF adapter validation failed: ${failures.join(',')}`);
    throw new Error(`hf_adapter_probe_failed:${failures.join(',')}`);
  }

  console.log('HF adapter probe passed.');
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
