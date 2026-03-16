import { PolicyDecision as SharedPolicyDecision, PolicyGuardDecision } from '@soulism/shared/contracts.js';
import type { PolicyDecision } from './decision.js';

export interface ServicePolicyDecision {
  state: PolicyDecision['state'];
  reasonCode: string;
  reason?: string;
  requirements: PolicyDecision['requirements'];
  budgetSnapshot: PolicyDecision['budgetSnapshot'];
  traceId: string;
  policyVersion: string;
  decisionId: string;
  schemaVersion: string;
  issuedAt: string;
  requestedPolicyUrl?: string;
}

const buildDefaultDecisionId = (): string => `policy-${Date.now().toString(36)}-${Math.floor(Math.random() * 10_000_000)}`;

const buildDefaultIssuedAt = (): string => new Date().toISOString();

const emptyRequirements = (): PolicyGuardDecision['requirements'] => [
  {
    type: 'policy',
    message: 'policy decision unavailable'
  }
];

export const normalizeServiceDecision = (decision: PolicyDecision | SharedPolicyDecision, requestedPolicyUrl?: string): ServicePolicyDecision => ({
  state: decision.state,
  reasonCode: decision.reasonCode,
  reason: decision.reason,
  requirements: decision.requirements?.length ? decision.requirements : emptyRequirements(),
  budgetSnapshot: decision.budgetSnapshot,
  traceId: decision.traceId || `trace-${Date.now()}`,
  policyVersion: decision.policyVersion || 'v1',
  decisionId: decision.decisionId || buildDefaultDecisionId(),
  schemaVersion: decision.schemaVersion || '1.0.0',
  issuedAt: decision.issuedAt || buildDefaultIssuedAt(),
  requestedPolicyUrl
});

export const withFallbackDecision = (error: unknown, traceId: string, state: PolicyDecision['state'] = 'deny'): ServicePolicyDecision => ({
  state,
  reasonCode: 'policy_unavailable',
  reason: String(error),
  requirements: [
    {
      type: 'policy',
      message: 'policy check service error',
      value: error instanceof Error ? error.message : String(error)
    }
  ],
  budgetSnapshot: {
    remainingBudget: 0,
    maxBudget: 0,
    windowStart: new Date().toISOString(),
    windowEnd: new Date().toISOString()
  },
  traceId,
  policyVersion: 'v1',
  decisionId: buildDefaultDecisionId(),
  schemaVersion: '1.0.0',
  issuedAt: new Date().toISOString()
});
