import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type ProviderConfig = {
  enabled: boolean;
  keyId: string;
  algorithm: string;
  allowMockInCi: boolean;
};

type KmsPolicy = {
  schemaVersion: string;
  providers: Record<string, ProviderConfig>;
};

const root = process.cwd();
const failures: string[] = [];

const run = async () => {
  const path = join(root, 'ci/policies/kms.providers.json');
  const policy = JSON.parse(await readFile(path, 'utf8')) as KmsPolicy;

  if (policy.schemaVersion !== '1.0.0') failures.push(`${path}: invalid_schemaVersion`);

  const allowedProviders = ['aws', 'gcp', 'azure'];
  const providers = Object.entries(policy.providers || {});
  if (providers.length === 0) failures.push(`${path}: missing_providers`);

  let enabledCount = 0;
  for (const [name, config] of providers) {
    if (!allowedProviders.includes(name)) failures.push(`${path}: unsupported_provider(${name})`);
    if (config.enabled) enabledCount += 1;
    if (!config.keyId) failures.push(`${path}: missing_keyId(${name})`);
    if (!config.algorithm) failures.push(`${path}: missing_algorithm(${name})`);
    if (config.algorithm.toLowerCase() !== 'ed25519') failures.push(`${path}: unsupported_algorithm(${name})`);
    if (typeof config.allowMockInCi !== 'boolean') failures.push(`${path}: invalid_allowMockInCi(${name})`);
  }

  if (enabledCount === 0) failures.push(`${path}: no_enabled_providers`);

  if (failures.length > 0) {
    console.error('KMS provider policy validation failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('KMS provider policy validation passed.');
};

void run();

