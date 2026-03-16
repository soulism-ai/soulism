import {
  POLICY_DECISION_SCHEMA_VERSION,
  PolicyBudgetSnapshot,
  PolicyDecision,
  PolicyDecisionState,
  PolicyReasonCode,
  PolicyRequirement,
  PolicyRequest
} from './contracts.js';

type RiskClass = PolicyRequest['riskClass'];

export const POLICY_CONFIRMATION_ERROR = 'confirmation_required';
export const POLICY_DENIED_ERROR = 'policy_denied';
export const POLICY_UNAVAILABLE_ERROR = 'policy_unavailable';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRequirement = (value: unknown): value is PolicyRequirement =>
  isRecord(value) && typeof value.type === 'string' && typeof value.message === 'string';

const normalizeBudgetSnapshot = (snapshot: unknown): PolicyBudgetSnapshot => {
  if (snapshot && isRecord(snapshot)) {
    const remainingBudget = Number(snapshot.remainingBudget);
    const maxBudget = Number(snapshot.maxBudget);
    return {
      remainingBudget: Number.isFinite(remainingBudget) && remainingBudget >= 0 ? Math.floor(remainingBudget) : 0,
      maxBudget: Number.isFinite(maxBudget) && maxBudget > 0 ? Math.floor(maxBudget) : 1,
      windowStart:
        typeof snapshot.windowStart === 'string' && snapshot.windowStart.length > 0 ? snapshot.windowStart : new Date().toISOString(),
      windowEnd: typeof snapshot.windowEnd === 'string' && snapshot.windowEnd.length > 0 ? snapshot.windowEnd : new Date().toISOString()
    };
  }

  return {
    remainingBudget: 0,
    maxBudget: 1,
    windowStart: new Date().toISOString(),
    windowEnd: new Date().toISOString()
  };
};

const isValidReasonCode = (value: unknown): value is PolicyReasonCode =>
  typeof value === 'string' && Object.values(PolicyReasonCode).includes(value as PolicyReasonCode);

const isValidDecisionState = (value: unknown): value is PolicyDecisionState =>
  value === PolicyDecisionState.Allow || value === PolicyDecisionState.Confirm || value === PolicyDecisionState.Deny;

const defaultRequirements = (): PolicyRequirement[] => [{ type: 'policy', message: 'policy decision unavailable' }];

const normalizeRequirements = (value: unknown): PolicyRequirement[] => {
  if (!Array.isArray(value)) {
    return defaultRequirements();
  }
  const requirements = value.filter(isRequirement);
  return requirements.length > 0 ? requirements : defaultRequirements();
};

const defaultDecisionId = (): string => `decision-${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000)}`;
const normalizeRiskClass = (value: unknown): RiskClass => {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') return value;
  return 'low';
};

export interface PolicyAccessNormalizedDecision extends PolicyDecision {
  schemaVersion: string;
  issuedAt: string;
}

export interface PolicyAccessInput {
  state?: unknown;
  reasonCode?: unknown;
  reason?: unknown;
  requirements?: unknown;
  budgetSnapshot?: unknown;
  traceId?: unknown;
  personaId?: unknown;
  tool?: unknown;
  riskClass?: unknown;
  policyVersion?: unknown;
  decisionId?: unknown;
  schemaVersion?: unknown;
  issuedAt?: unknown;
}

export interface PolicyAccessContext {
  personaId?: string;
  tool?: string;
  riskClass?: RiskClass;
}

export interface PolicyAccessDecisionResponse extends PolicyAccessNormalizedDecision {
  error?: string;
}

const resolveTraceId = (value: unknown): string => {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return `policy-${Date.now()}`;
};

const normalizeDecision = (
  decision: PolicyAccessInput,
  context: PolicyAccessContext = {}
): PolicyAccessNormalizedDecision => {
  const state = isValidDecisionState(decision.state) ? decision.state : PolicyDecisionState.Deny;
  return {
    state,
    reasonCode: isValidReasonCode(decision.reasonCode) ? (decision.reasonCode as PolicyReasonCode) : PolicyReasonCode.PolicyUnavailable,
    reason: typeof decision.reason === 'string' ? decision.reason : undefined,
    requiresConfirmation: state === PolicyDecisionState.Confirm,
    requirements: normalizeRequirements(decision.requirements),
    budgetSnapshot: normalizeBudgetSnapshot(decision.budgetSnapshot),
    traceId: resolveTraceId(decision.traceId),
    personaId:
      typeof decision.personaId === 'string' && decision.personaId.trim().length > 0
        ? decision.personaId
        : context.personaId || 'unknown',
    tool:
      typeof decision.tool === 'string' && decision.tool.trim().length > 0 ? decision.tool : context.tool || 'unknown',
    riskClass: normalizeRiskClass(decision.riskClass ?? context.riskClass),
    policyVersion:
      typeof decision.policyVersion === 'string' && decision.policyVersion.trim().length > 0 ? decision.policyVersion : 'v1',
    decisionId:
      typeof decision.decisionId === 'string' && decision.decisionId.trim().length > 0
        ? decision.decisionId
        : defaultDecisionId(),
    schemaVersion:
      typeof decision.schemaVersion === 'string' && decision.schemaVersion.trim().length > 0
        ? decision.schemaVersion
        : POLICY_DECISION_SCHEMA_VERSION,
    issuedAt:
      typeof decision.issuedAt === 'string' && decision.issuedAt.trim().length > 0
        ? decision.issuedAt
        : new Date().toISOString()
  };
};

const normalizeErrorType = (state: PolicyDecisionState): string =>
  state === PolicyDecisionState.Confirm ? POLICY_CONFIRMATION_ERROR : POLICY_DENIED_ERROR;

export const buildPolicyDecisionEnvelope = (decision: PolicyAccessInput, context: PolicyAccessContext = {}): PolicyAccessNormalizedDecision =>
  normalizeDecision(decision, context);

export const buildPolicyAccessDenied = (
  decision: PolicyAccessInput,
  context: PolicyAccessContext = {}
): PolicyAccessDecisionResponse => {
  const normalized = normalizeDecision(decision, context);
  return {
    ...normalized,
    error: normalizeErrorType(normalized.state),
    requiresConfirmation: normalized.state === PolicyDecisionState.Confirm
  };
};
