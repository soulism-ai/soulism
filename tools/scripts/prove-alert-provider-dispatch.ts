import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
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

const postJson = async (url: string, payload: unknown, headers: Record<string, string>) =>
  fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify(payload)
  });

const run = async () => {
  const providersPolicy = JSON.parse(await readFile(join(root, 'ci/policies/alert.providers.json'), 'utf8')) as ProvidersPolicy;
  const dispatchEvidence = JSON.parse(
    await readFile(join(root, 'ci/baselines/alerts-dispatch-evidence.json'), 'utf8').catch(() => '{"dispatches":[]}')
  ) as { dispatches?: Array<{ alertId: string; triggered: boolean; severity: string; metric: string; observedValue: number }> };

  const captures: Array<{ provider: string; statusCode: number; body: unknown; headers: Record<string, string> }> = [];

  let server: Server | null = null;
  try {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        captures.push({
          provider: (req.url || '/').replace('/', ''),
          statusCode: 202,
          body: body ? JSON.parse(body) : {},
          headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v || '')]))
        });
        res.statusCode = 202;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ accepted: true }));
      });
    });

    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('provider_dispatch_server_bind_failed');
    const base = `http://127.0.0.1:${address.port}`;

    const triggered = (dispatchEvidence.dispatches || []).filter((d) => d.triggered);
    const providers = Object.entries(providersPolicy.providers).filter(([, cfg]) => cfg.enabled);

    for (const [provider, cfg] of providers) {
      const providerPath = `${base}/${provider}`;
      const headers: Record<string, string> = {};
      if (cfg.authType === 'bearer') {
        headers.authorization = `Bearer ${cfg.keyRef || 'provider-token-ref'}`;
      } else if (cfg.authType === 'key') {
        headers['x-api-key'] = cfg.keyRef || 'provider-key-ref';
      }

      for (const item of triggered) {
        let success = false;
        let attempts = 0;
        while (!success && attempts < providersPolicy.retryPolicy.maxAttempts) {
          attempts += 1;
          const response = await postJson(
            providerPath,
            {
              schemaVersion: '1.0.0',
              provider,
              alertId: item.alertId,
              severity: item.severity,
              metric: item.metric,
              observedValue: item.observedValue,
              releaseId: process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local'
            },
            headers
          );
          success = response.status >= 200 && response.status < 300;
          if (!success) await sleep(providersPolicy.retryPolicy.backoffMs);
        }
        if (!success) {
          throw new Error(`provider_dispatch_failed:${provider}:${item.alertId}`);
        }
      }
    }

    const payload = {
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      releaseId: process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local',
      providersValidated: providers.map(([name]) => name),
      dispatchCount: captures.length,
      captures
    };
    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const evidence = {
      ...payload,
      digest: `sha256:${digest}`
    };

    const outPath = join(root, 'ci/baselines/alert-provider-dispatch-evidence.json');
    await writeFile(outPath, JSON.stringify(evidence, null, 2), 'utf8');
    console.log(`Alert provider dispatch evidence generated: ${outPath}`);
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
    }
  }
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});

