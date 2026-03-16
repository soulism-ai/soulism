import {
  POLICY_DECISION_SCHEMA_VERSION,
  PolicyBudgetSnapshot,
  PolicyDecision,
  PolicyGatewayConfig,
  PolicyReasonCode,
  PolicyDecisionState,
  normalizeBudgetSnapshot,
  normalizePolicyDecision,
  PolicyGuardDecision
} from '@soulism/shared/contracts.js';
import { PolicyRequest } from './decision.js';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const nowIso = (): string => new Date().toISOString();

const defaultDecisionId = (): string => `decision-${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000)}`;

const normalizeTrace = (request: Omit<PolicyRequest, 'traceId'> & { traceId?: string }): string =>
  request.traceId && request.traceId.trim().length > 0 ? request.traceId : `policy-${Date.now()}`;

const normalizeBudget = (snapshot: unknown): PolicyBudgetSnapshot =>
  normalizeBudgetSnapshot(
    snapshot && typeof snapshot === 'object'
      ? (snapshot as Record<string, unknown>)
      : {
          remainingBudget: 0,
          maxBudget: 0,
          windowStart: nowIso(),
          windowEnd: nowIso()
        }
  );

const parsePolicyError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const toPolicyDecision = (
  request: Omit<PolicyRequest, 'traceId'> & { traceId: string },
  normalized: PolicyGuardDecision
): PolicyDecision => ({
  state: normalized.state,
  reasonCode: normalized.reasonCode,
  reason: normalized.reason,
  personaId: request.personaId,
  tool: request.tool,
  riskClass: request.riskClass,
  requiresConfirmation: normalized.state === PolicyDecisionState.Confirm,
  requirements: normalized.requirements,
  budgetSnapshot: normalizeBudget(normalized.budgetSnapshot),
  policyVersion: normalized.policyVersion || 'v1',
  traceId: normalized.traceId || request.traceId,
  decisionId: normalized.decisionId || defaultDecisionId(),
  schemaVersion: POLICY_DECISION_SCHEMA_VERSION,
  issuedAt: nowIso()
});

const fallbackDecision = (
  request: Omit<PolicyRequest, 'traceId'> & { traceId: string },
  policyBaseUrl: string,
  config: PolicyGatewayConfig,
  reasonCode: PolicyReasonCode,
  reason: string
): PolicyDecision => ({
  state: config.requireConfirmationOnTimeout ? PolicyDecisionState.Confirm : PolicyDecisionState.Deny,
  reasonCode,
  reason,
  personaId: request.personaId,
  tool: request.tool,
  riskClass: request.riskClass,
  requiresConfirmation: config.requireConfirmationOnTimeout,
  requirements: [
    {
      type: 'policy',
      message: `policy-gateway:${reason}`,
      value: policyBaseUrl
    }
  ],
  budgetSnapshot: {
    remainingBudget: 0,
    maxBudget: 0,
    windowStart: nowIso(),
    windowEnd: nowIso()
  },
  policyVersion: 'v1',
  traceId: request.traceId,
  decisionId: defaultDecisionId(),
  schemaVersion: POLICY_DECISION_SCHEMA_VERSION,
  issuedAt: nowIso()
});

const defaultPolicyGatewayConfig = (): PolicyGatewayConfig => ({
  url: 'http://localhost:4001',
  timeoutMs: 2_000,
  retries: 2,
  retryBaseMs: 75,
  retryMaxMs: 400,
  requireConfirmationOnTimeout: false
});

const normalizePolicyConfig = (policyBaseUrl: string, overrides: Partial<PolicyGatewayConfig>): PolicyGatewayConfig => {
  const normalized = {
    ...defaultPolicyGatewayConfig(),
    ...overrides,
    url: policyBaseUrl.replace(/\/$/, '')
  };

  return {
    ...normalized,
    timeoutMs: Math.max(250, normalized.timeoutMs),
    retries: Math.max(0, normalized.retries),
    retryBaseMs: Math.max(25, normalized.retryBaseMs),
    retryMaxMs: Math.max(100, normalized.retryMaxMs)
  };
};

const shouldRetry = (status: number): boolean => status >= 500;

export const requestPolicyDecision = async (
  policyBaseUrl: string,
  request: Omit<PolicyRequest, 'traceId'> & { traceId?: string },
  config: Partial<PolicyGatewayConfig> = {}
): Promise<PolicyDecision> => {
  const normalizedRequest: Omit<PolicyRequest, 'traceId'> & { traceId: string } = {
    ...request,
    traceId: normalizeTrace(request)
  };
  const policyConfig = normalizePolicyConfig(policyBaseUrl, config);
  const endpoint = `${policyConfig.url}/policy/check`;
  const payload = JSON.stringify(normalizedRequest);

  let attempt = 0;
  let lastError: string | undefined;

  while (attempt <= policyConfig.retries) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), policyConfig.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-trace-id': normalizedRequest.traceId
        },
        body: payload,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (shouldRetry(response.status) && attempt <= policyConfig.retries) {
          lastError = `status_${response.status}`;
          await delay(Math.min(policyConfig.retryBaseMs * attempt, policyConfig.retryMaxMs));
          continue;
        }

        return fallbackDecision(
          normalizedRequest,
          endpoint,
          policyConfig,
          PolicyReasonCode.PolicyRejected,
          `status_${response.status}`
        );
      }

      const body = (await response.json().catch(() => null)) as unknown;
      const normalized = normalizePolicyDecision(body);
      return toPolicyDecision(normalizedRequest, normalized);
    } catch (error) {
      clearTimeout(timeout);
      lastError = parsePolicyError(error);
      if (attempt <= policyConfig.retries) {
        await delay(Math.min(policyConfig.retryBaseMs * attempt, policyConfig.retryMaxMs));
      }
    }
  }

  return fallbackDecision(
    normalizedRequest,
    endpoint,
    policyConfig,
    policyConfig.requireConfirmationOnTimeout ? PolicyReasonCode.ConfirmRequired : PolicyReasonCode.PolicyUnavailable,
    `policy_transport_failed:${lastError || 'timeout'}`
  );
};
