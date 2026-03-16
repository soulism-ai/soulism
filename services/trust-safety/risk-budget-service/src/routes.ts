import { IncomingMessage, ServerResponse } from 'node:http';
import { PolicyRequest } from '@soulism/persona-policy/decision.js';
import { RiskClass, ToolScope } from '@soulism/persona-policy/scopes.js';
import { PolicyReasonCode } from '@soulism/shared/contracts.js';
import { emitAuditEvent } from '@soulism/shared/audit.js';
import {
  BudgetEntry,
  canSpendBudget,
  chargeBudget,
  ensureWindow,
  makeBudget,
  normalizeBudgetKey
} from '@soulism/persona-policy/budgets.js';
import { readJsonBody, sendJson } from '@soulism/shared/http.js';
import { createReadinessReport, probeTaskDependency } from '@soulism/shared/readiness.js';
import { ServiceMetricsCollector, observeHttpRequest } from '@soulism/shared/telemetry.js';
import { config } from './common/config.js';
import { BudgetStore } from './budget.store.js';

type BudgetCheckRequest = Pick<PolicyRequest, 'personaId' | 'userId' | 'tenantId' | 'tool' | 'riskClass'>;

type BudgetSnapshot = {
  key: string;
  remaining: number;
  max: number;
  windowMs: number;
  windowStartedAt: number;
  windowEndsAt: number;
  remainingBudget: number;
  maxBudget: number;
  windowStart: string;
  windowEnd: string;
  nextResetAt: string;
  riskClass: RiskClass;
};

const budgetStore = new BudgetStore(config.storePath, {
  stateBackend: config.stateBackend,
  stateRedisUrl: config.stateRedisUrl,
  stateStoreKey: config.stateStoreKey
});
const telemetry = new ServiceMetricsCollector('risk-budget');

const isRiskClass = (value: unknown): value is RiskClass =>
  value === 'low' || value === 'medium' || value === 'high' || value === 'critical';

const isToolScope = (value: unknown): value is ToolScope =>
  typeof value === 'string' && Object.values(ToolScope).includes(value as ToolScope);

const asBudgetRequest = (value: unknown): BudgetCheckRequest | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<BudgetCheckRequest>;
  if (
    typeof candidate.personaId !== 'string' ||
    typeof candidate.userId !== 'string' ||
    typeof candidate.tenantId !== 'string' ||
    !isToolScope(candidate.tool) ||
    !isRiskClass(candidate.riskClass)
  ) {
    return null;
  }
  return candidate as BudgetCheckRequest;
};

const normalizePath = (url: string | undefined): string => {
  const base = (url || '/').split('?')[0];
  const withoutV1 = base.replace(/^\/v1(?=\/|$)/, '');
  return withoutV1.length ? withoutV1 : '/';
};

const normalizeRisk = (value: unknown): RiskClass => (isRiskClass(value) ? value : 'low');

const makeSnapshot = (key: string, entry: BudgetEntry & { key?: string }): BudgetSnapshot => {
  const windowStartedAt = Math.max(0, Math.floor(entry.windowStartedAt));
  const windowMs = Math.max(1, Math.floor(entry.windowMs));
  const remaining = Math.max(0, Math.floor(entry.remaining));
  const max = Math.max(1, Math.floor(entry.max));
  const windowEndsAt = windowStartedAt + windowMs;
  const remainingBudget = remaining;
  return {
    key,
    remaining,
    max,
    windowMs,
    windowStartedAt,
    windowEndsAt,
    remainingBudget,
    maxBudget: max,
    windowStart: new Date(windowStartedAt).toISOString(),
    windowEnd: new Date(windowEndsAt).toISOString(),
    nextResetAt: new Date(windowEndsAt).toISOString(),
    riskClass: normalizeRisk(entry.riskClass)
  };
};

const normalizeBudget = (
  key: string,
  riskClass: RiskClass,
  candidate: (BudgetEntry & { key?: string }) | undefined
): BudgetEntry & { key: string } => {
  const baseline =
    candidate ??
    ({
      ...makeBudget(config.max, riskClass, config.windowMs),
      key
    } as BudgetEntry & { key: string });
  const normalized = ensureWindow(baseline, config.max, riskClass, config.windowMs);
  return {
    ...normalized,
    key,
    riskClass,
    max: Math.max(1, normalized.max),
    remaining: Math.max(0, Math.min(normalized.max, normalized.remaining))
  };
};

const buildInvalidRequest = (message: string, traceId: string) => ({
  error: 'invalid_request',
  status: 400,
  reasonCode: PolicyReasonCode.InvalidRequest,
  state: 'deny',
  reason: message,
  requirements: [{ type: 'budget', message }],
  budgetSnapshot: {
    remainingBudget: 0,
    maxBudget: 0,
    windowStart: new Date().toISOString(),
    windowEnd: new Date().toISOString()
  },
  message,
  traceId
});

const listBudgets = async (): Promise<BudgetSnapshot[]> => {
  const stored = await budgetStore.list();
  const out: BudgetSnapshot[] = [];
  for (const budget of stored) {
    const normalized = normalizeBudget(budget.key, normalizeRisk(budget.riskClass), budget);
    await budgetStore.set(normalized);
    out.push(makeSnapshot(budget.key, normalized));
  }
  return out;
};

const buildCheckDecision = (spendOk: boolean, budget: BudgetSnapshot, traceId: string, request: BudgetCheckRequest) => ({
  allowed: spendOk,
  ok: spendOk,
  state: spendOk ? 'allow' : 'deny',
  reasonCode: spendOk ? PolicyReasonCode.Ok : PolicyReasonCode.RiskLimitReached,
  reason: spendOk ? 'budget available' : 'budget exhausted',
  requirements: spendOk
    ? [{ type: 'budget', message: 'remaining budget remains' }]
    : [{ type: 'budget', message: 'remaining budget depleted' }],
  budgetSnapshot: {
    remainingBudget: budget.remaining,
    maxBudget: budget.max,
    windowStart: budget.windowStart,
    windowEnd: budget.windowEnd
  },
  personaId: request.personaId,
  tool: request.tool,
  riskClass: request.riskClass,
  requiresConfirmation: false,
  policyVersion: 'v1',
  decisionId: `budget-${Date.now().toString(36)}-${Math.floor(Math.random() * 10_000_000).toString(16)}`,
  schemaVersion: '1.0.0',
  issuedAt: new Date().toISOString(),
  traceId,
  key: budget.key,
  remaining: budget.remaining,
  max: budget.max,
  remainingBudget: budget.remaining,
  maxBudget: budget.maxBudget,
  windowMs: budget.windowMs,
  windowStartedAt: budget.windowStartedAt,
  windowEndsAt: budget.windowEndsAt,
  nextResetAt: budget.nextResetAt
});

export async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = normalizePath(req.url);
  const method = req.method || 'GET';
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const traceId = headers['x-trace-id']?.toString() ?? headers['x-request-id']?.toString() ?? `risk-budget-${Date.now()}`;
  observeHttpRequest(telemetry, res, { method, route: path, traceId });
  const traceHeaders = {
    'x-trace-id': traceId,
    'x-request-id': traceId
  };
  const principal = headers['x-user-id']?.toString() ?? 'anonymous';
  const riskClass = headers['x-risk-class']?.toString() ?? 'low';
  const emitAudit = (action: string, resource: string, metadata: Record<string, unknown> = {}) => {
    emitAuditEvent(config.auditService, {
      service: 'risk-budget',
      action,
      principal,
      traceId,
      riskClass,
      resource,
      metadata
    }).catch(() => {});
  };

  res.setHeader('x-trace-id', traceId);
  res.setHeader('x-request-id', traceId);

  if (method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true, service: 'risk-budget', ready: true }, { headers: traceHeaders });
    return;
  }

  if (method === 'GET' && path === '/metrics') {
    sendJson(res, 200, telemetry.snapshot(), { headers: traceHeaders });
    return;
  }

  if (method === 'GET' && path === '/ready') {
    const startedAt = Date.now();
    const checks = [
      await probeTaskDependency('budget-store', () => budgetStore.ready(), { target: config.stateReadyTarget })
    ];
    const report = createReadinessReport('risk-budget', checks, startedAt);
    sendJson(res, report.ready ? 200 : 503, report, { headers: traceHeaders });
    return;
  }

  try {
    await budgetStore.ready();
  } catch (error) {
    sendJson(res, 503, { ok: false, error: 'budget_store_unavailable', reason: String(error) }, { headers: traceHeaders });
    return;
  }

  if (method === 'GET' && path === '/budgets') {
    emitAudit('budgets:list', 'all', { outcome: 'success', count: await budgetStore.count() });
    sendJson(res, 200, await listBudgets(), { headers: traceHeaders });
    return;
  }

  if (method === 'POST' && path === '/budgets/check') {
    let body: BudgetCheckRequest | null = null;
    try {
      body = asBudgetRequest(await readJsonBody(req));
    } catch {
      sendJson(res, 400, buildInvalidRequest('request body must be JSON object', traceId), { headers: traceHeaders });
      emitAudit('budgets:check', 'unknown', { outcome: 'invalid_request', reason: 'request_body_invalid' });
      return;
    }
    if (!body) {
      sendJson(res, 400, buildInvalidRequest('Missing personaId/userId/tenantId/tool/riskClass', traceId), { headers: traceHeaders });
      emitAudit('budgets:check', 'unknown', { outcome: 'invalid_request', reason: 'missing_fields' });
      return;
    }

    const key = normalizeBudgetKey(body.personaId, body.userId, body.tenantId, body.tool);
    const requestBudget = normalizeBudget(key, body.riskClass, await budgetStore.get(key));
    const now = Date.now();
    const spend = canSpendBudget(requestBudget, 1, now);
    const current = spend.ok ? chargeBudget(requestBudget, 1, now) : requestBudget;
    const budget = makeSnapshot(key, current);

    await budgetStore.set({
      ...current,
      key
    });

    emitAudit('budgets:check', body.tool, {
      outcome: spend.ok ? 'allowed' : 'denied',
      allowed: spend.ok,
      personaId: body.personaId,
      tenantId: body.tenantId,
      userId: body.userId,
      reasonCode: spend.ok ? PolicyReasonCode.Ok : PolicyReasonCode.RiskLimitReached
    });
    sendJson(res, 200, {
      ...buildCheckDecision(spend.ok, budget, traceId, body),
      service: 'risk-budget'
    });
    return;
  }

  if (method === 'POST' && path === '/budgets/reset') {
    const body = await readJsonBody(req, { allowEmpty: true }).catch(() => ({} as Record<string, unknown>));
    const resetPayload =
      body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : ({} as Record<string, unknown>);
    const resetKey = typeof resetPayload.key === 'string' ? resetPayload.key.trim() : '';
    if (resetKey.length > 0) {
      await budgetStore.delete(resetKey);
      emitAudit('budgets:reset', resetKey, { outcome: 'single' });
      sendJson(
        res,
        200,
        {
          ok: true,
          schemaVersion: '1.0.0',
          service: 'risk-budget',
          mode: 'single',
          key: resetKey
        },
        { headers: traceHeaders }
      );
      return;
    }
    await budgetStore.clear();
    emitAudit('budgets:reset', 'all', { outcome: 'all' });
    sendJson(
      res,
      200,
      { ok: true, schemaVersion: '1.0.0', service: 'risk-budget', mode: 'all' },
      { headers: traceHeaders }
    );
    return;
  }

  sendJson(res, 404, { error: 'not_found' }, { headers: traceHeaders });
}
