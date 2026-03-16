import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendJson } from '@soulism/shared/http.js';
import { emitAuditEvent } from '@soulism/shared/audit.js';
import { buildPolicyAccessDenied } from '@soulism/shared/policy-access.js';
import { createReadinessReport, probeHttpDependency, probeTaskDependency } from '@soulism/shared/readiness.js';
import { ServiceMetricsCollector, observeHttpRequest } from '@soulism/shared/telemetry.js';
import { config } from './common/config.js';
import { requireReadPermission, requireWritePermission } from './guards.js';
import type { ServicePolicyDecision } from '@soulism/persona-policy/guards.js';
import { MemoryRecord, MemoryRepository } from './memory.repository.js';

const scopeRegex = /^[a-zA-Z0-9._-]{1,64}$/;
const repository = new MemoryRepository(config.storePath, {
  stateBackend: config.stateBackend,
  stateRedisUrl: config.stateRedisUrl,
  stateStoreKey: config.stateStoreKey
});
const telemetry = new ServiceMetricsCollector('memory');

const recordId = (userId: string, tenantId: string, scope: string) => `${tenantId}:${userId}:${scope}`;

const normalizeScope = (value: unknown): string => {
  if (typeof value !== 'string') return 'session';
  const trimmed = value.trim();
  if (trimmed.length === 0 || !scopeRegex.test(trimmed)) {
    return 'session';
  }
  return trimmed;
};

const recordPrefix = (userId: string, tenantId: string, scope: string) => `${recordId(userId, tenantId, scope)}:`;

const readRequestBody = async (req: IncomingMessage, res: ServerResponse, traceHeaders: Record<string, string>): Promise<Record<string, unknown> | null> => {
  try {
    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      await sendJson(res, 400, { error: 'invalid_payload', details: 'payload must be a JSON object' }, { headers: traceHeaders });
      return null;
    }
    return body as Record<string, unknown>;
  } catch (error) {
    await sendJson(res, 400, { error: 'invalid_payload', details: String(error) }, { headers: traceHeaders });
    return null;
  }
};
export async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const method = req.method || 'GET';
  const path = req.url || '/';
  const personaId = headers['x-persona-id']?.toString() ?? 'default';
  const userId = headers['x-user-id']?.toString() ?? 'anonymous';
  const tenantId = headers['x-tenant-id']?.toString() ?? 'default';
  const riskClassHeader = headers['x-risk-class']?.toString() ?? 'low';
  const riskClass = riskClassHeader === 'low' || riskClassHeader === 'medium' || riskClassHeader === 'high' || riskClassHeader === 'critical'
    ? riskClassHeader
    : 'low';
  const traceId = headers['x-trace-id']?.toString() ?? headers['x-request-id']?.toString() ?? `trace-${Date.now()}`;
  const traceHeaders = {
    'x-trace-id': traceId,
    'x-request-id': traceId
  };
  observeHttpRequest(telemetry, res, { method, route: path.split('?')[0] || '/', traceId });
  const sendPolicyError = (
    state: 'allow' | 'confirm' | 'deny',
    decision: ServicePolicyDecision,
    action: string
  ) => {
    const payload = buildPolicyAccessDenied(decision, {
      personaId,
      tool: action,
      riskClass
    });
    if (action !== 'memory:delete') {
      emitAuditEvent(config.auditService, {
        service: 'memory',
        action,
        principal: userId,
        traceId: payload.traceId,
        riskClass,
        personaId,
        metadata: {
          decisionId: payload.decisionId,
          reasonCode: payload.reasonCode,
          outcome: state === 'confirm' ? 'confirm_required' : 'deny'
        }
      }).catch(() => {});
    }
    sendJson(res, 403, payload);
  };
  res.setHeader('x-trace-id', traceId);
  res.setHeader('x-request-id', traceId);
  const confirmed = headers['x-policy-confirmed']?.toString() === 'true';

  if (method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true, service: 'memory' });
    return;
  }

  if (method === 'GET' && path === '/metrics') {
    sendJson(res, 200, telemetry.snapshot(), { headers: traceHeaders });
    return;
  }

  if (method === 'GET' && path === '/ready') {
    const startedAt = Date.now();
    const checks = await Promise.all([
      probeTaskDependency('memory-store', () => repository.ready(), { target: config.stateReadyTarget }),
      probeHttpDependency('policy-gate', config.policyService),
      probeHttpDependency('audit-ledger', config.auditService, { required: false })
    ]);
    const report = createReadinessReport('memory', checks, startedAt);
    sendJson(res, report.ready ? 200 : 503, report, { headers: traceHeaders });
    return;
  }

  try {
    await repository.ready();
  } catch (error) {
    sendJson(
      res,
      503,
      { ok: false, error: 'memory_store_unavailable', reason: String(error) },
      { headers: traceHeaders }
    );
    return;
  }

  if (method === 'POST' && path === '/memory/write') {
    const decision = await requireWritePermission(config.policyService, personaId, userId, tenantId, riskClass as any);
    const permitted = decision.state === 'allow' || (decision.state === 'confirm' && confirmed);
    if (!permitted) {
      sendPolicyError(decision.state, decision, 'memory:write');
      return;
    }

    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      sendJson(res, 400, { error: 'invalid_payload', details: 'payload must be a JSON object' });
      return;
    }

    const scopeRaw = (body as Record<string, unknown>).scope;
    const scope = normalizeScope(scopeRaw);
    const value = (body as Record<string, unknown>)?.['value'];
    const ttlRaw = Number((body as Record<string, unknown>)?.['ttlMs']);
    const ttlMs = Number.isFinite(ttlRaw) ? Math.max(Math.trunc(ttlRaw), 1) : config.defaultTtlMs;

    const id = randomUUID();
    const key = recordId(userId, tenantId, scope);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + Math.max(ttlMs, 1)).toISOString();

    const record: MemoryRecord = { id, userId, tenantId, scope, value, createdAt, expiresAt };
    await repository.write(`${key}:${id}`, record);
    emitAuditEvent(config.auditService, {
      service: 'memory',
      action: 'write',
      principal: userId,
      traceId: decision.traceId,
      riskClass,
      personaId,
      resource: key,
      metadata: {
        scope,
        result: 'success',
        recordId: id
      }
    }).catch(() => {});

    sendJson(res, 200, record);
    return;
  }

  if (method === 'GET' && path.startsWith('/memory/list')) {
    const decision = await requireReadPermission(config.policyService, personaId, userId, tenantId);
    const permitted = decision.state === 'allow' || (decision.state === 'confirm' && confirmed);
    if (!permitted) {
      sendPolicyError(decision.state, decision, 'memory:list');
      return;
    }
    const scope = normalizeScope(new URL(path, 'http://localhost').searchParams.get('scope'));
    const entries = await repository.list(userId, tenantId, scope);
    emitAuditEvent(config.auditService, {
      service: 'memory',
      action: 'list',
      principal: userId,
      traceId,
      riskClass,
      personaId,
      resource: scope,
      metadata: { count: entries.length }
    }).catch(() => {});
    sendJson(res, 200, { items: entries });
    return;
  }

  if (method === 'POST' && path === '/memory/read') {
    const body = await readRequestBody(req, res, traceHeaders);
    if (!body) return;

    const scope = normalizeScope(body.scope);
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      sendJson(res, 400, { error: 'missing_id' });
      return;
    }

    const decision = await requireReadPermission(config.policyService, personaId, userId, tenantId);
    const permitted = decision.state === 'allow' || (decision.state === 'confirm' && confirmed);
    if (!permitted) {
      sendPolicyError(decision.state, decision, 'memory:read');
      return;
    }

    const key = `${recordPrefix(userId, tenantId, scope)}${id}`;
    const record = await repository.read(key);
    if (!record) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

      emitAuditEvent(config.auditService, {
      service: 'memory',
      action: 'read',
      principal: userId,
      traceId,
      riskClass,
      personaId,
      resource: key,
      metadata: {
        scope,
        recordId: id,
        result: 'success'
      }
    }).catch(() => {});
    sendJson(res, 200, record);
    return;
  }

  if (method === 'DELETE' && path.startsWith('/memory/scope/')) {
    const scope = normalizeScope(path.replace('/memory/scope/', ''));
    if (!scope) {
      sendJson(res, 400, { error: 'invalid_scope' });
      return;
    }
    const decision = await requireWritePermission(config.policyService, personaId, userId, tenantId, riskClass as any);
    const permitted = decision.state === 'allow' || (decision.state === 'confirm' && confirmed);
    if (!permitted) {
      sendPolicyError(decision.state, decision, 'memory:scope:delete');
      return;
    }

    const prefix = recordPrefix(userId, tenantId, scope);
    const removed = await repository.deleteScope(prefix);

    emitAuditEvent(config.auditService, {
      service: 'memory',
      action: 'delete_scope',
      principal: userId,
      traceId,
      riskClass,
      personaId,
      resource: scope,
      metadata: {
        scope,
        removed
      }
    }).catch(() => {});

    sendJson(res, 200, { ok: true, scope, removed });
    return;
  }

  if (method === 'DELETE' && path.startsWith('/memory/')) {
    const decision = await requireWritePermission(config.policyService, personaId, userId, tenantId, riskClass as any);
    const permitted = decision.state === 'allow' || (decision.state === 'confirm' && confirmed);
    if (!permitted) {
      sendPolicyError(decision.state, decision, 'memory:delete');
      return;
    }
    const id = path.replace('/memory/', '');
    const found = await repository.deleteById(userId, tenantId, id);
    emitAuditEvent(config.auditService, {
      service: 'memory',
      action: found ? 'delete' : 'delete-miss',
      principal: userId,
      traceId,
      riskClass,
      personaId,
      resource: id,
      metadata: {
        scope: 'global',
        found
      }
    }).catch(() => {});
    sendJson(res, found ? 200 : 404, found ? { ok: true } : { error: 'not_found' });
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}
