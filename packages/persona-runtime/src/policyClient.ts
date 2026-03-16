import { PolicyGatewayConfig, PolicyReasonCode, normalizeBudgetSnapshot } from '@soulism/shared/contracts.js';
import { PolicyRequest, PolicyDecision } from '@soulism/persona-policy/decision.js';
import { RiskClass, ToolScope } from '@soulism/persona-policy/scopes.js';
import { requestPolicyDecision } from '@soulism/persona-policy/transport.js';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const validToolScope = (value: string): value is PolicyDecision['tool'] => {
  return Object.values(ToolScope).includes(value as PolicyDecision['tool']);
};

const validRiskClass = (value: string): value is PolicyDecision['riskClass'] => {
  return Object.values(RiskClass).includes(value as PolicyDecision['riskClass']);
};

const validReasonCode = (value: string): value is PolicyDecision['reasonCode'] => {
  return Object.values(PolicyReasonCode).includes(value as PolicyDecision['reasonCode']);
};

const toRuntimeDecision = (
  response: Awaited<ReturnType<typeof requestPolicyDecision>>,
  request: Omit<PolicyRequest, 'traceId'> & { traceId: string }
): PolicyDecision => {
  const tool = validToolScope(response.tool) ? response.tool : request.tool;
  const riskClass = validRiskClass(response.riskClass) ? response.riskClass : request.riskClass;
  const reasonCode = validReasonCode(response.reasonCode) ? response.reasonCode : PolicyReasonCode.PolicyUnavailable;

  return {
    state: response.state,
    reasonCode,
    reason: response.reason,
    personaId: response.personaId || request.personaId,
    tool,
    riskClass,
    requiresConfirmation: response.requiresConfirmation === true,
    requirements: response.requirements,
    budgetSnapshot: normalizeBudgetSnapshot(response.budgetSnapshot),
    policyVersion: response.policyVersion || 'v1',
    traceId: response.traceId || request.traceId,
    decisionId: response.decisionId || `decision-${Date.now()}`,
    schemaVersion: response.schemaVersion || '1.0.0',
    issuedAt: response.issuedAt || new Date().toISOString()
  };
};

export const buildPolicyGatewayConfig = (policyBaseUrl: string): PolicyGatewayConfig => ({
  url: policyBaseUrl.replace(/\/$/, ''),
  timeoutMs: 2_000,
  retries: 2,
  retryBaseMs: 75,
  retryMaxMs: 400,
  requireConfirmationOnTimeout: false
});

export async function checkPolicy(
  request: Omit<PolicyRequest, 'traceId'> & { traceId: string },
  policyBaseUrl: string,
  config: Partial<PolicyGatewayConfig> = {}
): Promise<PolicyDecision> {
  const policyConfig: PolicyGatewayConfig = { ...buildPolicyGatewayConfig(policyBaseUrl), ...config };
  const response = await requestPolicyDecision(policyBaseUrl, request, policyConfig);
  await delay(0);
  return toRuntimeDecision(response, request);
}
