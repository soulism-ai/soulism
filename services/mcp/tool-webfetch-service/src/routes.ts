import { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendJson } from '@soulism/shared/http.js';
import { buildPolicyAccessDenied } from '@soulism/shared/policy-access.js';
import { emitAuditEvent } from '@soulism/shared/audit.js';
import { createReadinessReport, probeHttpDependency } from '@soulism/shared/readiness.js';
import { ServiceMetricsCollector, observeHttpRequest } from '@soulism/shared/telemetry.js';
import { readConfig } from './common/config.js';
import { isHostAllowed, policyPrecheck } from './guards.js';

type UnknownRecord = Record<string, unknown>;
type AuditMetadata = {
  outcome: string;
  status?: number;
  error?: string;
  method?: string;
  protocol?: string;
  host?: string;
};

const sanitize = (text: string, max = config.maxPayloadBytes) => text.slice(0, max);

const allowedMethods = new Set(['GET', 'POST']);
const methodFromInput = (value: unknown): string | undefined => {
  if (!value) return 'GET';
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  return allowedMethods.has(normalized) ? normalized : undefined;
};

const parseTargetUrl = (raw: string): URL => {
  const target = String(raw || '').trim();
  if (!target) {
    throw new Error('missing_url');
  }
  return new URL(target);
};

const emitAudited = async (
  service: string,
  action: string,
  principal: string,
  traceId: string,
  riskClass: string,
  personaId: string,
  resource: string,
  metadata: AuditMetadata
): Promise<void> => {
  try {
    await emitAuditEvent(config.auditService, {
      service,
      action,
      principal,
      traceId,
      riskClass,
      personaId,
      resource,
      metadata
    });
  } catch {}
};

const buildResourceIdentifier = (url: URL): string => url.href;
const config = readConfig();
const telemetry = new ServiceMetricsCollector('tool-webfetch');

export async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method || 'GET';
  const path = req.url || '/';
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const personaId = headers['x-persona-id']?.toString() ?? 'default';
  const userId = headers['x-user-id']?.toString() ?? 'anonymous';
  const tenantId = headers['x-tenant-id']?.toString() ?? 'default';
  const traceId = headers['x-trace-id']?.toString() ?? `trace-${Date.now()}`;
  const confirmed = headers['x-policy-confirmed']?.toString() === 'true';
  observeHttpRequest(telemetry, res, { method, route: path.split('?')[0] || '/', traceId });
  res.setHeader('x-trace-id', traceId);
  res.setHeader('x-request-id', traceId);

  if (method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true, service: 'tool-webfetch' });
    return;
  }

  if (method === 'GET' && path === '/metrics') {
    sendJson(res, 200, telemetry.snapshot());
    return;
  }

  if (method === 'GET' && path === '/ready') {
    const startedAt = Date.now();
    const checks = await Promise.all([
      probeHttpDependency('policy-gate', config.policyService),
      probeHttpDependency('audit-ledger', config.auditService, { required: false })
    ]);
    const report = createReadinessReport('tool-webfetch', checks, startedAt);
    sendJson(res, report.ready ? 200 : 503, report);
    return;
  }

  if (method === 'POST' && path === '/webfetch') {
    const body = (await readJsonBody(req)) as UnknownRecord;
    const rawTarget = body?.url;
    if (typeof rawTarget !== 'string' || !rawTarget.trim()) {
      sendJson(res, 400, { error: 'missing_url' });
      await emitAudited('tool-webfetch', 'webfetch', userId, traceId, 'medium', personaId, '', {
        outcome: 'invalid_payload'
      });
      return;
    }

    const requestMethod = methodFromInput(body?.method);
    if (!requestMethod) {
      sendJson(res, 400, { error: 'invalid_method' });
      await emitAudited('tool-webfetch', 'webfetch', userId, traceId, 'medium', personaId, rawTarget, {
        outcome: 'invalid_method',
        method: typeof body?.method === 'string' ? body?.method : undefined
      });
      return;
    }

    let url: URL;
    try {
      url = parseTargetUrl(rawTarget);
    } catch (error) {
      sendJson(res, 400, {
        error: 'invalid_url',
        message: error instanceof Error ? error.message : 'invalid url'
      });
      await emitAudited('tool-webfetch', 'webfetch', userId, traceId, 'medium', personaId, rawTarget, {
        outcome: 'invalid_url',
        error: error instanceof Error ? error.message : 'invalid_url'
      });
      return;
    }

    if (!/^https?:$/.test(url.protocol)) {
      sendJson(res, 400, { error: 'unsupported_protocol' });
      await emitAudited('tool-webfetch', 'webfetch', userId, traceId, 'medium', personaId, rawTarget, {
        outcome: 'unsupported_protocol',
        protocol: url.protocol,
        host: url.hostname
      });
      return;
    }

    if (url.username || url.password) {
      sendJson(res, 400, { error: 'credentialed_url_blocked' });
      await emitAudited('tool-webfetch', 'webfetch', userId, traceId, 'medium', personaId, rawTarget, {
        outcome: 'blocked',
        protocol: url.protocol,
        host: url.hostname
      });
      return;
    }

    const allowed = await isHostAllowed(url.hostname, config.allowedDomains);
    if (!allowed) {
      sendJson(res, 403, { error: 'ssrf_blocked' });
      await emitAudited('tool-webfetch', 'webfetch', userId, traceId, 'medium', personaId, url.hostname, {
        outcome: 'blocked',
        protocol: url.protocol,
        host: url.hostname
      });
      return;
    }

    const decision = await policyPrecheck(config.policyService, {
      personaId,
      userId,
      tenantId,
      tool: 'tool:webfetch',
      action: 'fetch',
      riskClass: 'medium',
      traceId,
      payload: {
        target: rawTarget,
        method: requestMethod
      }
    });

    const permitted = decision.state === 'allow' || (decision.state === 'confirm' && confirmed);
    if (!permitted) {
      const decisionPayload = buildPolicyAccessDenied({
        ...decision,
        personaId,
        tool: 'tool:webfetch',
        riskClass: 'medium'
      });
      await emitAudited('tool-webfetch', 'policy', userId, decisionPayload.traceId, 'medium', personaId, rawTarget, {
        outcome: decisionPayload.state === 'confirm' ? 'confirm_required' : 'denied'
      });
      sendJson(res, 403, decisionPayload);
      return;
    }

    try {
      const requestBody = body?.body;
      const hasBody = requestMethod !== 'GET' && requestBody !== undefined;
      const response = await fetch(buildResourceIdentifier(url), {
        method: requestMethod,
        headers: {
          accept: 'text/plain'
        },
        redirect: 'error',
        body: hasBody ? (typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody)) : undefined
      });
      const text = await response.text();
      await emitAudited('tool-webfetch', 'webfetch', userId, traceId, 'medium', personaId, rawTarget, {
        outcome: 'success',
        status: response.status,
        method: requestMethod
      });
      sendJson(res, 200, {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type') || 'text/plain',
        body: sanitize(text),
        url: rawTarget
      });
      return;
    } catch (error) {
      await emitAudited('tool-webfetch', 'webfetch', userId, traceId, 'medium', personaId, rawTarget, {
        outcome: 'fetch_failed',
        error: String(error),
        method: requestMethod
      });
      sendJson(res, 502, {
        error: 'fetch_failed',
        message: String(error)
      });
      return;
    }
  }

  sendJson(res, 404, { error: 'not_found' });
}
