import { randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendJson } from '@soulism/shared/http.js';
import { createReadinessReport, probeTaskDependency } from '@soulism/shared/readiness.js';
import { ServiceMetricsCollector, observeHttpRequest } from '@soulism/shared/telemetry.js';
import { config } from './common/config.js';
import { AuditLedgerRepository } from './audit.repository.js';

const repo = new AuditLedgerRepository(config.storePath, {
  stateBackend: config.stateBackend,
  stateRedisUrl: config.stateRedisUrl,
  stateStoreKey: config.stateStoreKey
});
const telemetry = new ServiceMetricsCollector('audit-ledger');

export async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method || 'GET';
  const url = req.url || '/';
  const path = url.split('?')[0];
  const traceId = req.headers['x-trace-id']?.toString() ?? req.headers['x-request-id']?.toString();
  observeHttpRequest(telemetry, res, { method, route: path, traceId });

  if (method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true, service: 'audit-ledger' });
    return;
  }

  if (method === 'GET' && path === '/metrics') {
    sendJson(res, 200, telemetry.snapshot());
    return;
  }

  if (method === 'GET' && path === '/ready') {
    const startedAt = Date.now();
    const checks = [
      await probeTaskDependency('audit-store', () => repo.ready(), { target: config.stateReadyTarget }),
      await probeTaskDependency('hash-chain', async () => {
        const verification = await repo.verifyChain();
        if (!verification.ok) {
          throw new Error(verification.error || 'hash_chain_invalid');
        }
      })
    ];
    const report = createReadinessReport('audit-ledger', checks, startedAt);
    sendJson(res, report.ready ? 200 : 503, report);
    return;
  }

  try {
    await repo.ready();
  } catch (error) {
    sendJson(res, 503, { ok: false, error: 'audit_store_unavailable', reason: String(error) });
    return;
  }

  if (method === 'POST' && path === '/audit/events') {
    const body = await readJsonBody(req);
    const record = await repo.append({
      schemaVersion: String((body as Record<string, unknown>)?.['schemaVersion'] || '1.0.0'),
      id: randomUUID(),
      ...((body as Record<string, unknown>) || {}),
      service: String((body as Record<string, unknown>)?.['service'] || 'unknown'),
      action: String((body as Record<string, unknown>)?.['action'] || 'unknown'),
      principal: String((body as Record<string, unknown>)?.['principal'] || 'unknown')
    });
    sendJson(res, 200, record);
    return;
  }

  if (method === 'GET' && path === '/audit/events') {
    const query = new URLSearchParams(url.split('?')[1] || '');
    const principal = query.get('principal') ?? undefined;
    const service = query.get('service') ?? undefined;
    sendJson(res, 200, await repo.query({ principal: principal ?? undefined, service: service ?? undefined }));
    return;
  }

  if (method === 'GET' && path === '/audit/hash-chain/verify') {
    sendJson(res, 200, await repo.verifyChain());
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}
