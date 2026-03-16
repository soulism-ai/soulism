import { IncomingMessage, ServerResponse } from 'node:http';
import { PolicyRequest, PolicyDecision } from '@soulism/persona-policy/decision.js';
import { ToolScope, RiskClass } from '@soulism/persona-policy/scopes.js';
import { checkPolicy } from './policyClient.js';

export type PolicyContext = {
  persona?: { id?: string; packId?: string; riskClass?: string; [key: string]: unknown };
  userId?: string;
  tenantId?: string;
  traceId: string;
  requestId: string;
  personaRuntimeResource?: string;
};

type MiddlewareNext = () => Promise<void>;

type PolicyHandler = (
  req: IncomingMessage & { context?: PolicyContext },
  res: ServerResponse,
  decision: PolicyDecision
) => Promise<void> | void;

const readPolicyDecision = (decision: PolicyDecision): PolicyDecision => decision;

const headerValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const riskFromPersona = (riskClass: unknown): RiskClass => {
  if (riskClass === 'low' || riskClass === 'medium' || riskClass === 'high' || riskClass === 'critical') return riskClass;
  return 'low';
};

const toolToScope = (tool: string): ToolScope => {
  const normalized = (tool || '').trim();
  if ((Object.values(ToolScope) as string[]).includes(normalized)) {
    return normalized as ToolScope;
  }
  return ToolScope.WebFetch;
};

export const withToolPolicy = (policyUrl: string, toolScope: ToolScope, opts: { onDecision?: PolicyHandler } = {}): (
  req: IncomingMessage & { context?: PolicyContext },
  res: ServerResponse,
  next: MiddlewareNext
) => Promise<void> => {
  return async (req, res, next) => {
    const context = req.context;
    const headers = req.headers as Record<string, string | string[] | undefined>;
    const personaId = context?.persona?.id || context?.persona?.packId || headerValue(headers['x-persona-id']) || 'default';
    const userId = context?.userId || headerValue(headers['x-user-id']) || 'anonymous';
    const tenantId = context?.tenantId || headerValue(headers['x-tenant-id']) || 'default';
    const traceId = context?.traceId || headerValue(headers['x-trace-id']) || `trace-${Date.now()}`;
    const requestId = context?.requestId || headerValue(headers['x-request-id']) || `request-${Date.now()}`;
    const ip = headerValue(headers['x-forwarded-for']) || req.socket?.remoteAddress || '';
    const resource = context?.personaRuntimeResource || headerValue(headers['x-resource']) || req.url || '/';
    const action = headerValue(headers['x-tool-action']) || req.method?.toLowerCase() || 'invoke';

    if (!context?.persona) {
      req.context = {
        ...(context || ({} as PolicyContext)),
        traceId,
        requestId,
        userId,
        tenantId
      };
      await next();
      return;
    }

    const riskClass = riskFromPersona(context.persona.riskClass);
    const request: PolicyRequest = {
      personaId,
      userId,
      tenantId,
      tool: toolToScope(toolScope),
      action,
      riskClass,
      traceId,
      payload: {
        requestId,
        userAgent: headerValue(headers['user-agent']),
        ip,
        resource
      }
    };

    let decision: PolicyDecision;
    try {
      decision = await checkPolicy(request, policyUrl);
    } catch (error) {
      decision = {
        state: 'deny',
        reasonCode: 'policy_unavailable',
        reason: `policy check failed: ${String(error)}`,
        personaId,
        tool: toolToScope(toolScope),
        riskClass,
        requiresConfirmation: false,
        requirements: [{ type: 'policy', message: 'policy check transport failed', value: String(error) }],
        budgetSnapshot: {
          remainingBudget: 0,
          maxBudget: 0,
          windowStart: new Date().toISOString(),
          windowEnd: new Date().toISOString()
        },
        policyVersion: 'unknown',
        traceId,
        decisionId: `decision-${Date.now()}`,
        schemaVersion: '1.0.0',
        issuedAt: new Date().toISOString()
      };
    }

    const policyDecision = readPolicyDecision(decision);
    req.context = {
      ...(context || {}),
      traceId,
      requestId,
      userId,
      tenantId,
      persona: context?.persona
    };

    if (opts.onDecision) {
      await Promise.resolve(opts.onDecision(req, res, policyDecision));
      return;
    }

    await next();
  };
};
