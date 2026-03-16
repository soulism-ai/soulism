import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
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

const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isPlaceholderEndpoint = (endpoint: string): boolean => {
  return endpoint.includes('example.com') || endpoint.includes('T000/B000/XXXX') || endpoint.includes('placeholder');
};

const run = async () => {
  const policy = JSON.parse(await readFile(join(root, 'ci/policies/alert.providers.json'), 'utf8')) as ProvidersPolicy;
  const releaseId = process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local';

  const results: Array<{ provider: string; endpoint: string; status: number; attempts: number; success: boolean }> = [];

  for (const [provider, config] of Object.entries(policy.providers)) {
    if (!config.enabled) continue;

    const endpointEnv = process.env[`ALERT_PROVIDER_ENDPOINT_${provider.toUpperCase()}`];
    const endpoint = endpointEnv || config.endpoint;
    if (!endpoint || isPlaceholderEndpoint(endpoint)) {
      throw new Error(`provider_endpoint_not_configured:${provider}`);
    }

    const keyValue = process.env[`ALERT_PROVIDER_KEY_${provider.toUpperCase()}`] || '';
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (config.authType === 'bearer') {
      if (!keyValue) throw new Error(`missing_bearer_token:${provider}`);
      headers.authorization = `Bearer ${keyValue}`;
    } else if (config.authType === 'key') {
      if (!keyValue) throw new Error(`missing_api_key:${provider}`);
      headers['x-api-key'] = keyValue;
    }

    let attempt = 0;
    let success = false;
    let status = 0;
    while (!success && attempt < policy.retryPolicy.maxAttempts) {
      attempt += 1;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          schemaVersion: '1.0.0',
          releaseId,
          provider,
          event: 'staging-alert-provider-connectivity-check',
          timestamp: new Date().toISOString()
        })
      });
      status = response.status;
      success = status >= 200 && status < 300;
      if (!success) await sleep(policy.retryPolicy.backoffMs);
    }

    results.push({
      provider,
      endpoint,
      status,
      attempts: attempt,
      success
    });

    if (!success) {
      throw new Error(`provider_live_dispatch_failed:${provider}:status=${status}`);
    }
  }

  const payload = {
    schemaVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    releaseId,
    results,
    passed: results.length > 0 && results.every((x) => x.success)
  };
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const evidence = {
    ...payload,
    digest: `sha256:${digest}`
  };

  const outPath = join(root, 'ci/baselines/alert-provider-live-evidence.json');
  await writeFile(outPath, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`Live alert provider evidence generated: ${outPath}`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});

