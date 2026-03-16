import { createServer } from 'node:http';
import { setInterval } from 'node:timers';
import process from 'node:process';

type ServiceStatus = {
  endpoint: string;
  healthy: boolean;
  status: number;
  payload?: string;
};

const defaultTargets: Array<[string, string]> = [
  ['api-gateway', process.env.COGNITIVE_API_GATEWAY_URL ?? 'http://localhost:8080'],
  ['policy-gate', process.env.COGNITIVE_POLICY_SERVICE_URL ?? 'http://localhost:4001'],
  ['persona-registry', process.env.COGNITIVE_PERSONA_REGISTRY_URL ?? 'http://localhost:3001'],
  ['memory', process.env.COGNITIVE_MEMORY_SERVICE_URL ?? 'http://localhost:3002'],
  ['tool-webfetch', process.env.COGNITIVE_WEBFETCH_SERVICE_URL ?? 'http://localhost:3004'],
  ['tool-files', process.env.COGNITIVE_FILES_SERVICE_URL ?? 'http://localhost:3003'],
  ['risk-budget', process.env.COGNITIVE_RISK_BUDGET_URL ?? 'http://localhost:4002'],
  ['audit-ledger', process.env.COGNITIVE_AUDIT_LEDGER_URL ?? 'http://localhost:4003']
];

const probe = async (): Promise<Record<string, ServiceStatus>> => {
  const status: Record<string, ServiceStatus> = {};

  await Promise.all(
    defaultTargets.map(async ([name, endpoint]) => {
      try {
        const response = await fetch(`${endpoint}/health`, { method: 'GET' });
        const payload = await response.text();
        status[name] = {
          endpoint,
          healthy: response.ok,
          status: response.status,
          payload: payload.slice(0, 120)
        };
      } catch {
        status[name] = {
          endpoint,
          healthy: false,
          status: 0,
          payload: 'unreachable'
        };
      }
    })
  );

  return status;
};

export const runServer = async (): Promise<void> => {
  const port = Number(process.env.COGNITIVE_CLI_SERVER_PORT ?? '4009');
  const pollIntervalMs = Number(process.env.COGNITIVE_CLI_SERVER_POLL_MS ?? '5000');
  let latest = await probe();

  const server = createServer((req, res) => {
    if (req.url === '/health' || req.url === '/status') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, generatedAt: Date.now(), services: latest }));
      return;
    }

    if (req.url === '/' || req.url === '/json') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          service: 'soulism-cli',
          message: 'control server running',
          generatedAt: Date.now(),
          services: latest
        })
      );
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  const interval = setInterval(async () => {
    latest = await probe();
  }, pollIntervalMs);

  server.listen(port, () => {
    console.log(`soulism control server listening on http://localhost:${port}`);
    console.log(`Probe every ${pollIntervalMs}ms. Endpoints: /health and /status`);
  });

  process.on('SIGINT', () => {
    clearInterval(interval);
    server.close(() => process.exit(0));
  });

  await new Promise<void>((resolve) => {
    server.on('close', () => resolve());
  });
};
