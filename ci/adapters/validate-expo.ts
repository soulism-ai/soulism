import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const failures: string[] = [];

const run = async () => {
  const descriptorPath = join(root, 'ci/adapters/expo.adapter.json');
  const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as {
    id?: string;
    status?: string;
    runtime?: string;
    artifacts?: string[];
    channels?: string[];
  };

  if (descriptor.id !== 'expo-adapter') failures.push('expo_adapter_id_mismatch');
  if (descriptor.status !== 'active') failures.push('expo_adapter_not_active');
  if (descriptor.runtime !== 'mobile-http') failures.push('expo_adapter_runtime_invalid');
  if (!Array.isArray(descriptor.channels) || !descriptor.channels.includes('expo')) {
    failures.push('expo_adapter_channel_missing');
  }
  if (!Array.isArray(descriptor.artifacts) || descriptor.artifacts.length < 2) {
    failures.push('expo_adapter_artifacts_missing');
  }

  for (const artifact of descriptor.artifacts || []) {
    const file = await readFile(join(root, artifact)).catch(() => null);
    if (!file || file.byteLength === 0) failures.push(`expo_artifact_missing_or_empty:${artifact}`);
  }

  if (failures.length > 0) {
    console.error(`Expo adapter validation failed: ${failures.join(',')}`);
    process.exit(1);
  }

  console.log('Expo adapter validation passed.');
};

void run();

