import { dirname } from 'node:path';
import { promises as fsp } from 'node:fs';
import { mkdirSync, existsSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendJson } from '@soulism/shared/http.js';
import { emitAuditEvent } from '@soulism/shared/audit.js';
import { buildPolicyAccessDenied } from '@soulism/shared/policy-access.js';
import { createReadinessReport, probeDirectoryDependency, probeHttpDependency } from '@soulism/shared/readiness.js';
import { ServiceMetricsCollector, observeHttpRequest } from '@soulism/shared/telemetry.js';
import { readConfig } from './common/config.js';
import { isMimeAllowed, isPathAllowed, preflightPolicy, safeJoin } from './guards.js';
import type { ServicePolicyDecision } from '@soulism/persona-policy/guards.js';

const config = readConfig();
const telemetry = new ServiceMetricsCollector('tool-files');
mkdirSync(config.rootDir, { recursive: true });

const findNestedFileByBasename = async (rootDir: string, basename: string): Promise<string | null> => {
  const pending = [rootDir];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const entries = await fsp.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const target = safeJoin(current, entry.name);
      if (!target) continue;
      if (entry.isDirectory()) {
        pending.push(target);
        continue;
      }
      if (entry.isFile() && entry.name === basename) {
        return target;
      }
    }
  }
  return null;
};

export async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method || 'GET';
  const path = req.url || '/';
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const userId = headers['x-user-id']?.toString() ?? 'anonymous';
  const tenantId = headers['x-tenant-id']?.toString() ?? 'default';
  const personaId = headers['x-persona-id']?.toString() ?? 'default';
  const traceId = headers['x-trace-id']?.toString() ?? headers['x-request-id']?.toString() ?? `trace-${Date.now()}`;
  const confirmed = headers['x-policy-confirmed']?.toString() === 'true';
  const riskClassHeader = headers['x-risk-class']?.toString() ?? 'low';
  const riskClass = riskClassHeader === 'low' || riskClassHeader === 'medium' || riskClassHeader === 'high' || riskClassHeader === 'critical'
    ? riskClassHeader
    : 'low';
  const auditPrincipal = userId;
  const traceHeaders = {
    'x-trace-id': traceId,
    'x-request-id': traceId
  };
  observeHttpRequest(telemetry, res, { method, route: path.split('?')[0] || '/', traceId });

  const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  };

  const normalizePath = (candidate: unknown): string => {
    if (typeof candidate !== 'string') return '';
    const trimmed = candidate.trim();
    return trimmed.length === 0 ? '' : trimmed;
  };

  const parseBodyObject = async (): Promise<Record<string, unknown> | null> => {
    const raw = await safeReadBody();
    if (!raw || !isRecord(raw)) {
      sendAuditFailure('payload_parse', 'tool-files', 'invalid_payload');
      sendJson(res, 400, { error: 'invalid_payload', details: 'payload must be a JSON object' }, { headers: traceHeaders });
      return null;
    }
    return raw;
  };
  const sendPolicyDeny = (action: string, decision: ServicePolicyDecision, resource: string, status = 403) => {
    const payload = buildPolicyAccessDenied({
      ...decision,
      personaId,
      tool: action,
      riskClass
    });
    emitAuditEvent(config.auditService, {
      service: 'tool-files',
      action: action,
      principal: auditPrincipal,
      traceId: payload.traceId,
      riskClass,
      personaId,
      resource,
      metadata: {
        outcome: payload.state === 'confirm' ? 'confirm_required' : 'deny',
        reasonCode: payload.reasonCode,
        requirements: payload.requirements
      }
    }).catch(() => {});
    sendJson(res, status, payload, { headers: traceHeaders });
  };
  const sendAuditFailure = (action: string, resource: string, outcome: string, metadata: Record<string, unknown> = {}) => {
    emitAuditEvent(config.auditService, {
      service: 'tool-files',
      action,
      principal: auditPrincipal,
      traceId,
      riskClass,
      personaId,
      resource,
      metadata
    }).catch(() => {});
  };
  const safeReadBody = async () => {
    try {
      return await readJsonBody(req);
    } catch (error) {
      sendAuditFailure('payload_parse', '', 'invalid_payload', { error: String(error) });
      sendJson(res, 400, { error: 'invalid_payload', details: String(error) }, { headers: traceHeaders });
      return null;
    }
  };
  res.setHeader('x-trace-id', traceId);
  res.setHeader('x-request-id', traceId);

  if (method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true, service: 'tool-files' }, { headers: traceHeaders });
    return;
  }

  if (method === 'GET' && path === '/metrics') {
    sendJson(res, 200, telemetry.snapshot(), { headers: traceHeaders });
    return;
  }

  if (method === 'GET' && path === '/ready') {
    const startedAt = Date.now();
    const checks = await Promise.all([
      probeDirectoryDependency('tool-files-root', config.rootDir, { writable: true }),
      probeHttpDependency('policy-gate', config.policyService),
      probeHttpDependency('audit-ledger', config.auditService, { required: false })
    ]);
    const report = createReadinessReport('tool-files', checks, startedAt);
    sendJson(res, report.ready ? 200 : 503, report, { headers: traceHeaders });
    return;
  }

  if (method === 'POST' && path === '/files/read') {
    const body = await parseBodyObject();
    if (!body) return;
    const relativePath = normalizePath(body.path);
    if (!relativePath) {
      sendAuditFailure('filesystem:read', 'tool-files', 'missing_path');
      sendJson(res, 400, { error: 'missing_path' }, { headers: traceHeaders });
      return;
    }
    const target = safeJoin(config.rootDir, relativePath);
    if (!target || !isPathAllowed(config.rootDir, target)) {
      sendAuditFailure('filesystem:read', relativePath, 'path_escape');
      sendJson(res, 403, { error: 'path_escape' }, { headers: traceHeaders });
      return;
    }

    const decision = await preflightPolicy(config.policyService, {
      personaId,
      userId,
      tenantId,
      tool: 'filesystem:read',
      action: 'read',
      riskClass,
      traceId
    });

    const permitted = decision.state === 'allow' || (decision.state === 'confirm' && confirmed);
    if (!permitted) {
      sendPolicyDeny('filesystem:read', decision, target);
      return;
    }

    try {
      const content = await fsp.readFile(target, 'utf8');
      emitAuditEvent(config.auditService, {
        service: 'tool-files',
        action: 'read',
        principal: auditPrincipal,
        traceId,
        riskClass,
        personaId,
        resource: relativePath,
        metadata: {
          outcome: 'success',
          bytes: content.length
        }
      }).catch(() => {});
      sendJson(res, 200, { path: relativePath, content });
    } catch {
      sendAuditFailure('filesystem:read', relativePath, 'not_found');
      sendJson(res, 404, { error: 'not_found' }, { headers: traceHeaders });
    }
    return;
  }

  if (method === 'POST' && path === '/files/write') {
    const body = await parseBodyObject();
    if (!body) return;
    const relativePath = normalizePath(body.path);
    if (!relativePath) {
      sendAuditFailure('filesystem:write', 'tool-files', 'missing_path');
      sendJson(res, 400, { error: 'missing_path' }, { headers: traceHeaders });
      return;
    }
    if (typeof body.content !== 'string') {
      sendAuditFailure('filesystem:write', relativePath, 'invalid_content');
      sendJson(res, 400, { error: 'invalid_content', details: 'content must be a string' }, { headers: traceHeaders });
      return;
    }
    const content = body.content;
    const target = safeJoin(config.rootDir, relativePath);
    if (!target || !isPathAllowed(config.rootDir, target) || !isMimeAllowed(config.allowlistedExtensions, target)) {
      sendAuditFailure('filesystem:write', relativePath, 'path_or_mime_denied');
      sendJson(res, 403, { error: 'path_or_mime_denied' }, { headers: traceHeaders });
      return;
    }

    const decision = await preflightPolicy(config.policyService, {
      personaId,
      userId,
      tenantId,
      tool: 'filesystem:write',
      action: 'write',
      riskClass: 'medium',
      traceId
    });

    const permitted = decision.state === 'allow' || (decision.state === 'confirm' && confirmed);
    if (!permitted) {
      sendPolicyDeny('filesystem:write', decision, target);
      return;
    }

    if (!config.overwriteAllowed && existsSync(target)) {
      sendAuditFailure('filesystem:write', target, 'exists');
      sendJson(res, 409, { error: 'exists' }, { headers: traceHeaders });
      return;
    }

    await fsp.mkdir(dirname(target), { recursive: true }).catch(() => undefined);
    await fsp.writeFile(target, content);
    emitAuditEvent(config.auditService, {
      service: 'tool-files',
      action: 'write',
      principal: auditPrincipal,
      traceId,
      riskClass: 'medium',
      personaId,
      resource: relativePath,
      metadata: {
        bytes: content.length,
        overwriteAllowed: config.overwriteAllowed,
        outcome: 'success'
      }
    }).catch(() => {});
    sendJson(res, 200, { ok: true, path: relativePath });
    return;
  }

  if (method === 'DELETE' && path.startsWith('/files/')) {
    const relativePath = path.replace('/files/', '');
    if (!relativePath) {
      sendAuditFailure('filesystem:delete', 'tool-files', 'missing_path');
      sendJson(res, 400, { error: 'missing_path' }, { headers: traceHeaders });
      return;
    }
    let target = safeJoin(config.rootDir, relativePath);
    if (!target || !isPathAllowed(config.rootDir, target)) {
      sendAuditFailure('filesystem:delete', relativePath, 'path_escape');
      sendJson(res, 403, { error: 'path_escape' }, { headers: traceHeaders });
      return;
    }
    if (!relativePath.includes('/')) {
      const exactExists = await fsp.stat(target).then((entry) => entry.isFile()).catch(() => false);
      if (!exactExists) {
        target = (await findNestedFileByBasename(config.rootDir, relativePath)) || target;
      }
    }

    const decision = await preflightPolicy(config.policyService, {
      personaId,
      userId,
      tenantId,
      tool: 'filesystem:write',
      action: 'delete',
      riskClass: 'medium',
      traceId
    });
    const permitted = decision.state === 'allow' || (decision.state === 'confirm' && confirmed);
    if (!permitted) {
      sendPolicyDeny('filesystem:write', decision, target, 403);
      return;
    }

    try {
      const existing = await fsp.stat(target).then((entry) => entry.isFile()).catch(() => false);
      if (!existing) {
        sendJson(res, 404, { error: 'not_found' }, { headers: traceHeaders });
        return;
      }
      await fsp.rm(target, { force: true });
      emitAuditEvent(config.auditService, {
        service: 'tool-files',
        action: 'delete',
        principal: auditPrincipal,
        traceId,
        riskClass: 'medium',
        personaId,
        resource: relativePath,
        metadata: {
          outcome: 'success'
        }
      }).catch(() => {});
      sendJson(res, 200, { ok: true, deleted: relativePath });
    } catch (error) {
      sendAuditFailure('filesystem:write', relativePath, 'delete_failed', { error: String(error) });
      sendJson(res, 500, { error: 'delete_failed', message: String(error) }, { headers: traceHeaders });
    }
    return;
  }

  sendJson(res, 404, { error: 'not_found' }, { headers: traceHeaders });
}
