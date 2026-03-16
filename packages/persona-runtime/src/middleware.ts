import { IncomingMessage, ServerResponse } from 'node:http';
import { parseTraceHeaders, TraceContext } from '@soulism/shared/trace.js';
import { composePersona } from '@soulism/persona-core/compose.js';
import { PersonaRegistry } from '@soulism/persona-core/registry.js';
import { checkPolicy } from './policyClient.js';
import { PolicyDecisionState } from '@soulism/shared/contracts.js';
import { RiskClass } from '@soulism/persona-policy/scopes.js';

export type PersonaRuntimeContext = TraceContext & {
  persona?: any;
  policyState?: PolicyDecisionState;
  policyReasonCode?: string;
};

export interface MiddlewareContext {
  req: IncomingMessage & { context?: PersonaRuntimeContext };
  res: ServerResponse;
}

const extractPersonaRisk = (persona: { riskClass?: string } | undefined): RiskClass => {
  const risk = (persona?.riskClass || 'low').toString();
  if (risk === 'low' || risk === 'medium' || risk === 'high' || risk === 'critical') return risk;
  return 'low';
};

const sanitizeTrace = (headers: Record<string, string | string[] | undefined>): TraceContext =>
  parseTraceHeaders(
    Object.entries(headers).reduce(
      (acc, [key, value]) => ({ ...acc, [key.toLowerCase()]: value }),
      {} as Record<string, string | string[] | undefined>
    )
  );

export const requestPersonaMiddleware = (registry: PersonaRegistry, policyUrl: string) =>
  async (req: IncomingMessage & { context?: PersonaRuntimeContext }, _res: ServerResponse) => {
    const headers = req.headers as Record<string, string | string[] | undefined>;
    const tenantId = headers['x-tenant-id']?.toString() ?? 'default';
    const userId = headers['x-user-id']?.toString() ?? 'anonymous';
    const requestId = headers['x-request-id']?.toString() ?? `req-${Date.now()}`;
    const traceId = requestId;
    const trace = sanitizeTrace(headers);
    req.context = {
      tenantId,
      userId,
      traceId,
      requestId: trace.requestId,
      spanId: trace.spanId
    };

    const personaId = headers['x-persona-id']?.toString();
    if (!personaId) {
      req.context.persona = null;
      return;
    }

    const persona = await composePersona(registry, personaId);
    req.context.persona = persona;

    const policyRequest = {
      personaId,
      userId,
      tenantId,
      tool: 'persona:registry' as const,
      action: 'resolve',
      riskClass: extractPersonaRisk(persona),
      traceId,
      metadata: {
        requestId,
        userId,
        tenantId,
        policyUrl
      }
    };

    const decision = await checkPolicy(policyRequest, policyUrl).catch((error) => {
      return {
        state: 'deny' as const,
        reasonCode: 'policy_unavailable',
        personaId,
        tool: 'persona:registry' as const,
        riskClass: extractPersonaRisk(persona),
        requiresConfirmation: false,
        requirements: [{ type: 'policy', message: String(error), value: policyUrl }],
        budgetSnapshot: {
          remainingBudget: 0,
          maxBudget: 0,
          windowStart: new Date().toISOString(),
          windowEnd: new Date().toISOString()
        },
        policyVersion: 'v1',
        traceId,
        decisionId: `decision-${Date.now()}`,
        schemaVersion: '1.0.0',
        issuedAt: new Date().toISOString()
      } as any;
    });

    req.context.policyState = decision.state;
    req.context.policyReasonCode = decision.reasonCode;
    req.context.persona = decision.state === 'deny' ? undefined : req.context.persona;
  };
