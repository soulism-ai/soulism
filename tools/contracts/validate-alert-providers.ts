import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type ProviderConfig = {
  enabled: boolean;
  endpoint: string;
  authType: 'none' | 'bearer' | 'key';
  keyRef?: string;
};

type ProvidersPolicy = {
  schemaVersion: string;
  providers: Record<string, ProviderConfig>;
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
  };
};

const root = process.cwd();
const failures: string[] = [];

const run = async () => {
  const path = join(root, 'ci/policies/alert.providers.json');
  const policy = JSON.parse(await readFile(path, 'utf8')) as ProvidersPolicy;

  if (policy.schemaVersion !== '1.0.0') failures.push(`${path}: invalid_schemaVersion`);
  if (!Number.isFinite(policy.retryPolicy?.maxAttempts) || policy.retryPolicy.maxAttempts < 1) {
    failures.push(`${path}: invalid_retry_maxAttempts`);
  }
  if (!Number.isFinite(policy.retryPolicy?.backoffMs) || policy.retryPolicy.backoffMs < 0) {
    failures.push(`${path}: invalid_retry_backoffMs`);
  }

  const providerEntries = Object.entries(policy.providers || {});
  if (providerEntries.length === 0) failures.push(`${path}: missing_providers`);

  for (const [name, cfg] of providerEntries) {
    if (!cfg.endpoint || !/^https?:\/\//.test(cfg.endpoint)) {
      failures.push(`${path}: invalid_endpoint(${name})`);
    }
    if (!['none', 'bearer', 'key'].includes(cfg.authType)) {
      failures.push(`${path}: invalid_authType(${name})`);
    }
    if ((cfg.authType === 'bearer' || cfg.authType === 'key') && !cfg.keyRef) {
      failures.push(`${path}: missing_keyRef(${name})`);
    }
  }

  if (failures.length > 0) {
    console.error('Alert provider validation failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Alert provider validation passed.');
};

void run();
