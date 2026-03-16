import type { PolicyRequest } from '@soulism/persona-policy/decision.js';
import { requestPolicyDecision } from '@soulism/persona-policy/transport.js';
import { normalizeServiceDecision, withFallbackDecision, type ServicePolicyDecision } from '@soulism/persona-policy/guards.js';

export const canMutate = async (_policyUrl: string, req: PolicyRequest): Promise<ServicePolicyDecision> => {
  try {
    const decision = await requestPolicyDecision(_policyUrl, req);
    return normalizeServiceDecision(decision as Parameters<typeof normalizeServiceDecision>[0], _policyUrl);
  } catch (error) {
    return withFallbackDecision(error, req.traceId);
  }
};
