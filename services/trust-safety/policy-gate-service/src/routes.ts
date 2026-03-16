import { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendJson } from '@soulism/shared/http.js';
import {
  PolicyDecisionState,
  PolicyReasonCode,
  PolicyRequest,
  normalizePolicyRequest,
  PolicyDecision as SharedPolicyDecision,
  PolicyBudgetSnapshot
} from '@soulism/shared/contracts.js';
import { createReadinessReport, probeTaskDependency } from '@soulism/shared/readiness.js';
import { ServiceMetricsCollector, observeHttpRequest } from '@soulism/shared/telemetry.js';
import { assertPolicyEngineReady, runPolicyCheck } from './engine.js';

const missingTraceId = (): string => `policy-${Date.now()}`;
const telemetry = new ServiceMetricsCollector('policy-gate');

const normalizePath = (url: string | undefined): string => {
  const base = (url || '/').split('?')[0];
  const withoutV1 = base.replace(/^\/v1(?=\/|$)/, '');
  return withoutV1.length ? withoutV1 : '/';
};

const trimTrailingSlash = (value: string): string => {
  if (value.length > 1 && value.endsWith('/')) {
    return value.slice(0, -1);
  }
  return value;
};

const decodeUrl = (req: IncomingMessage, path: string): boolean => trimTrailingSlash(normalizePath(req.url)) === path;

const nowIso = (): string => new Date().toISOString();

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const normalizeRequest = (raw: unknown): PolicyRequest | null => {
  const parsed = normalizePolicyRequest(raw);
  if (!parsed) {
    return null;
  }
  if (!isNonEmptyString(parsed.personaId) || !isNonEmptyString(parsed.userId) || !isNonEmptyString(parsed.tenantId)) {
    return null;
  }
  if (!isNonEmptyString((raw as Record<string, unknown> | undefined)?.tool) || !isNonEmptyString((raw as Record<string, unknown> | undefined)?.action)) {
    return null;
  }
  return parsed;
};

const responseDecision = (decision: SharedPolicyDecision): Record<string, unknown> => ({
  state: decision.state,
  reasonCode: decision.reasonCode,
  reason: decision.reason,
  requirements: decision.requirements,
  budgetSnapshot: decision.budgetSnapshot as PolicyBudgetSnapshot,
  personaId: decision.personaId,
  tool: decision.tool,
  riskClass: decision.riskClass,
  requiresConfirmation: decision.requiresConfirmation,
  policyVersion: decision.policyVersion || 'v1',
  decisionId: decision.decisionId || `decision-${Date.now().toString(36)}-${Math.floor(Math.random() * 10_000_000).toString(16)}`,
  traceId: decision.traceId || missingTraceId(),
  schemaVersion: decision.schemaVersion || '1.0.0',
  issuedAt: decision.issuedAt || nowIso()
});

const buildPolicyError = (error: string, reasonCode: string, message: string, traceId = missingTraceId()): Record<string, unknown> => ({
  error,
  status: 400,
  reasonCode,
  traceId,
  state: PolicyDecisionState.Deny,
  requirements: [
    {
      type: 'policy',
      message
    }
  ],
  budgetSnapshot: {
    remainingBudget: 0,
    maxBudget: 0,
    windowStart: nowIso(),
    windowEnd: nowIso()
  },
  personaId: 'unknown',
  tool: 'policy:check',
  riskClass: 'low',
  requiresConfirmation: false,
  policyVersion: 'v1',
  decisionId: `decision-${Date.now().toString(36)}-${Math.floor(Math.random() * 10_000_000).toString(16)}`,
  schemaVersion: '1.0.0',
  issuedAt: nowIso()
});

const buildMethodNotAllowed = (method: string): Record<string, unknown> => ({
  error: 'method_not_allowed',
  status: 405,
  reasonCode: PolicyReasonCode.PolicyRejected,
  state: PolicyDecisionState.Deny,
  reason: `method ${method} not supported for /policy/check`,
  requirements: [{ type: 'policy', message: 'policy check endpoint accepts POST only' }],
  traceId: missingTraceId(),
  budgetSnapshot: {
    remainingBudget: 0,
    maxBudget: 0,
    windowStart: nowIso(),
    windowEnd: nowIso()
  },
  personaId: 'unknown',
  tool: 'policy:check',
  riskClass: 'low',
  requiresConfirmation: false,
  policyVersion: 'v1',
  decisionId: `decision-${Date.now().toString(36)}-${Math.floor(Math.random() * 10_000_000).toString(16)}`,
  schemaVersion: '1.0.0',
  issuedAt: nowIso()
});

export async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { method = 'GET' } = req;
  const path = normalizePath(req.url);
  const traceId = missingTraceId();
  observeHttpRequest(telemetry, res, { method, route: path, traceId });
  const traceHeaders = {
    'x-trace-id': traceId,
    'x-request-id': traceId
  };
  res.setHeader('x-trace-id', traceId);
  res.setHeader('x-request-id', traceId);

  if (method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true, service: 'policy-gate' }, { headers: traceHeaders });
    return;
  }

  if (method === 'GET' && path === '/metrics') {
    sendJson(res, 200, telemetry.snapshot(), { headers: traceHeaders });
    return;
  }

  if (method === 'GET' && path === '/ready') {
    const startedAt = Date.now();
    const checks = [
      await probeTaskDependency('policy-engine', () => {
        assertPolicyEngineReady();
      })
    ];
    const report = createReadinessReport('policy-gate', checks, startedAt);
    sendJson(res, report.ready ? 200 : 503, report, { headers: traceHeaders });
    return;
  }

  if (method === 'POST' && path === '/policy/check') {
    let raw: unknown;
    try {
      raw = await readJsonBody(req);
    } catch {
      sendJson(
        res,
        400,
        buildPolicyError('invalid_request', PolicyReasonCode.InvalidRequest, 'policy check payload must be valid JSON', traceId),
        { headers: traceHeaders }
      );
      return;
    }

    const request = normalizeRequest(raw);
    if (!request) {
      sendJson(
        res,
        400,
        buildPolicyError(
          'invalid_request',
          PolicyReasonCode.InvalidRequest,
          'Missing personaId/userId/tenantId/tool/action/riskClass',
          traceId
        ),
        { headers: traceHeaders }
      );
      return;
    }

    const requestWithTrace: PolicyRequest = {
      ...request,
      traceId: request.traceId || traceId
    };

    const decision = runPolicyCheck(requestWithTrace as Parameters<typeof runPolicyCheck>[0]);
    sendJson(res, 200, responseDecision(decision), { headers: traceHeaders });
    return;
  }

  if (decodeUrl(req, '/policy/check')) {
    sendJson(res, 405, buildMethodNotAllowed(method), { headers: traceHeaders });
    return;
  }

  sendJson(res, 404, { error: 'not_found' }, { headers: traceHeaders });
}
