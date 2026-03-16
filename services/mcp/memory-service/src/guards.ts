import type { PolicyRequest } from '@soulism/persona-policy/decision.js';
import { requestPolicyDecision } from '@soulism/persona-policy/transport.js';
import { normalizeServiceDecision, withFallbackDecision, type ServicePolicyDecision } from '@soulism/persona-policy/guards.js';

const buildRequest = (payload: Omit<PolicyRequest, 'traceId'> & { traceId: string }): PolicyRequest => ({
  ...payload,
  traceId: payload.traceId
});

const checkPolicy = async (policyUrl: string, payload: Omit<PolicyRequest, 'traceId'> & { traceId: string }): Promise<ServicePolicyDecision> => {
  const request: PolicyRequest = buildRequest(payload);
  try {
    const decision = await requestPolicyDecision(policyUrl, request);
    return normalizeServiceDecision(decision as Parameters<typeof normalizeServiceDecision>[0], policyUrl);
  } catch (error) {
    return withFallbackDecision(error, request.traceId);
  }
};

export const requireWritePermission = async (
  policyUrl: string,
  personaId: string,
  userId: string,
  tenantId: string,
  riskClass: 'low' | 'medium' | 'high' | 'critical'
): Promise<ServicePolicyDecision> => {
  return checkPolicy(policyUrl, {
    personaId,
    userId,
    tenantId,
    tool: 'memory:write',
    action: 'write',
    riskClass,
    traceId: `memory-${Date.now()}`
  });
};

export const requireReadPermission = async (
  policyUrl: string,
  personaId: string,
  userId: string,
  tenantId: string
): Promise<ServicePolicyDecision> => {
  return checkPolicy(policyUrl, {
    personaId,
    userId,
    tenantId,
    tool: 'memory:read',
    action: 'read',
    riskClass: 'low',
    traceId: `memory-${Date.now()}`
  });
};
