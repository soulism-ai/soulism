import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();

const run = async () => {
  const descriptorPath = join(root, 'ci/adapters/expo.adapter.json');
  const descriptorRaw = await readFile(descriptorPath, 'utf8');
  const descriptor = JSON.parse(descriptorRaw) as {
    id: string;
    runtime: string;
    integrationBoundary: string;
    artifacts: string[];
  };

  const artifactDigests: Array<{ path: string; digest: string }> = [];
  for (const artifact of descriptor.artifacts) {
    const body = await readFile(join(root, artifact), 'utf8');
    artifactDigests.push({
      path: artifact,
      digest: `sha256:${createHash('sha256').update(body).digest('hex')}`
    });
  }

  const report = {
    schemaVersion: '1.0.0',
    adapter: descriptor.id,
    runtime: descriptor.runtime,
    integrationBoundary: descriptor.integrationBoundary,
    passed: descriptor.runtime === 'mobile-http' && descriptor.integrationBoundary === 'sdk-http-transport',
    artifactDigests,
    createdAt: new Date().toISOString()
  };

  await writeFile(join(root, 'ci/baselines/adapter-expo.probe.json'), JSON.stringify(report, null, 2), 'utf8');
  if (!report.passed) {
    throw new Error('expo_adapter_probe_failed');
  }
  console.log('Expo adapter probe passed.');
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});

