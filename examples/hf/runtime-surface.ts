import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

type RuntimeProbeResult = {
  runtime: 'hf-space';
  adapterId: string;
  p95LatencyMs: number;
  errorRate: number;
  totalChecks: number;
  policyStateCounts: Record<'allow' | 'confirm' | 'deny', number>;
  statuses: {
    policyAllow: number;
    policyConfirm: number;
    policyDeny: number;
    personaList: number;
    memoryWrite: number;
    memoryList: number;
  };
};

export type RuntimeSurfaceServer = {
  url: string;
  close: () => Promise<void>;
};

const percentile95 = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
};

const readJson = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
};

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
};

const callJson = async (
  url: string,
  init: RequestInit = {}
): Promise<{ status: number; body: Record<string, unknown>; durationMs: number }> => {
  const start = performance.now();
  const response = await fetch(url, init);
  const durationMs = performance.now() - start;
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body, durationMs };
};

const runProbe = async (gatewayUrl: string, adapterId: string): Promise<RuntimeProbeResult> => {
  const baseHeaders = {
    'content-type': 'application/json',
    'x-adapter-id': adapterId,
    'x-user-id': `${adapterId}-user`,
    'x-tenant-id': 'runtime-parity-tenant',
    'x-persona-id': 'runtime-parity-persona',
    'x-risk-class': 'low',
    'x-policy-confirmed': 'true'
  };

  const durations: number[] = [];
  let errors = 0;
  const policyStateCounts: Record<'allow' | 'confirm' | 'deny', number> = {
    allow: 0,
    confirm: 0,
    deny: 0
  };

  const allow = await callJson(`${gatewayUrl}/policy/check`, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({
      personaId: 'runtime-parity-persona',
      userId: `${adapterId}-user`,
      tenantId: 'runtime-parity-tenant',
      tool: 'persona:registry',
      action: 'read',
      riskClass: 'low',
      traceId: `${adapterId}-allow`
    })
  });
  durations.push(allow.durationMs);
  if (allow.body.state !== 'allow' || allow.status !== 200) errors += 1;
  if (allow.body.state in policyStateCounts) {
    policyStateCounts[allow.body.state as keyof typeof policyStateCounts] += 1;
  }

  const confirm = await callJson(`${gatewayUrl}/policy/check`, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({
      personaId: 'runtime-parity-persona',
      userId: `${adapterId}-user`,
      tenantId: 'runtime-parity-tenant',
      tool: 'memory:write',
      action: 'write',
      riskClass: 'low',
      traceId: `${adapterId}-confirm`
    })
  });
  durations.push(confirm.durationMs);
  if (confirm.body.state !== 'confirm' || confirm.status !== 200) errors += 1;
  if (confirm.body.state in policyStateCounts) {
    policyStateCounts[confirm.body.state as keyof typeof policyStateCounts] += 1;
  }

  const deny = await callJson(`${gatewayUrl}/policy/check`, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({
      personaId: 'runtime-parity-persona',
      userId: `${adapterId}-user`,
      tenantId: 'runtime-parity-tenant',
      tool: 'unknown:tool',
      action: 'write',
      riskClass: 'critical',
      traceId: `${adapterId}-deny`
    })
  });
  durations.push(deny.durationMs);
  if (deny.body.state !== 'deny' || deny.status !== 200) errors += 1;
  if (deny.body.state in policyStateCounts) {
    policyStateCounts[deny.body.state as keyof typeof policyStateCounts] += 1;
  }

  const personas = await callJson(`${gatewayUrl}/personas`, { method: 'GET', headers: baseHeaders });
  durations.push(personas.durationMs);
  if (personas.status !== 200) errors += 1;

  const memoryWrite = await callJson(`${gatewayUrl}/memory/write`, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({
      scope: 'session',
      value: {
        adapterId,
        runtime: 'hf-space',
        probe: 'adapter-runtime-parity'
      },
      ttlMs: 60_000
    })
  });
  durations.push(memoryWrite.durationMs);
  if (memoryWrite.status !== 200) errors += 1;

  const memoryList = await callJson(`${gatewayUrl}/memory/list?scope=session`, {
    method: 'GET',
    headers: baseHeaders
  });
  durations.push(memoryList.durationMs);
  if (memoryList.status !== 200) errors += 1;

  const totalChecks = 6;

  return {
    runtime: 'hf-space',
    adapterId,
    p95LatencyMs: percentile95(durations),
    errorRate: errors / totalChecks,
    totalChecks,
    policyStateCounts,
    statuses: {
      policyAllow: allow.status,
      policyConfirm: confirm.status,
      policyDeny: deny.status,
      personaList: personas.status,
      memoryWrite: memoryWrite.status,
      memoryList: memoryList.status
    }
  };
};

export const startHfRuntimeSurface = async (gatewayUrl: string): Promise<RuntimeSurfaceServer> => {
  const server = createServer(async (req, res) => {
    const method = req.method || 'GET';
    const path = (req.url || '/').split('?')[0];

    if (method === 'GET' && path === '/health') {
      sendJson(res, 200, { ok: true, runtime: 'hf-space' });
      return;
    }

    if (method === 'POST' && path === '/parity/run') {
      const body = await readJson(req);
      const adapterId = String(body.adapterId || 'hf-space');
      const result = await runProbe(gatewayUrl, adapterId);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('hf_runtime_surface_bind_failed');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () =>
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
};

if (process.argv[1] && process.argv[1].endsWith('runtime-surface.ts')) {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:8080';
  void startHfRuntimeSurface(gatewayUrl)
    .then((running) => {
      console.log(`hf-runtime-surface_ready:${running.url}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
