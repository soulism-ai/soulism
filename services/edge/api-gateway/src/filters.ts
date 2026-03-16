type ErrorDetails = Record<string, unknown> | undefined;

type PolicyState = 'allow' | 'confirm' | 'deny';

export interface ErrorResponse {
  status: number;
  error: string;
  reasonCode?: string;
  traceId?: string;
  service: 'api-gateway';
  errorId: string;
  details?: ErrorDetails;
}

export interface PolicyDecisionResponse {
  state: PolicyState;
  reasonCode: string;
  reason?: string;
  requirements: Array<{ type: string; message: string; value?: string | number | boolean }>;
  budgetSnapshot: {
    remainingBudget: number;
    maxBudget: number;
    windowStart: string;
    windowEnd: string;
  };
  personaId: string;
  tool: string;
  riskClass: 'low' | 'medium' | 'high' | 'critical';
  traceId: string;
  policyVersion: string;
  decisionId: string;
  requiresConfirmation: boolean;
  schemaVersion: string;
  issuedAt: string;
  requestedPolicyUrl?: string;
}

const nowIso = (): string => new Date().toISOString();

const makeTrace = (): string => `gw-${Date.now().toString(36)}-${Math.floor(Math.random() * 9_999_999).toString(16)}`;

const makeDecisionId = (): string => `decision-${Date.now().toString(36)}-${Math.floor(Math.random() * 9_999_999).toString(16)}`;

const safeString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;

const isPolicyState = (value: unknown): value is PolicyState =>
  value === 'allow' || value === 'confirm' || value === 'deny';

const safeRiskClass = (value: unknown): 'low' | 'medium' | 'high' | 'critical' =>
  value === 'low' || value === 'medium' || value === 'high' || value === 'critical' ? value : 'low';

const normalizeBudgetSnapshot = (value: unknown): PolicyDecisionResponse['budgetSnapshot'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const now = nowIso();
    return {
      remainingBudget: 0,
      maxBudget: 0,
      windowStart: now,
      windowEnd: now
    };
  }

  const snapshot = value as Record<string, unknown>;
  const asInt = (candidate: unknown): number => {
    const numeric = Number(candidate);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Math.floor(numeric);
  };

  const now = nowIso();
  return {
    remainingBudget: asInt(snapshot.remainingBudget),
    maxBudget: Math.max(1, asInt(snapshot.maxBudget)),
    windowStart: safeString(snapshot.windowStart, now),
    windowEnd: safeString(snapshot.windowEnd, now)
  };
};

const normalizeRequirements = (value: unknown): PolicyDecisionResponse['requirements'] => {
  if (!Array.isArray(value)) {
    return [{ type: 'policy', message: 'policy decision unavailable' }];
  }

  const normalizeRequirementValue = (candidate: unknown): string | number | boolean | undefined =>
    typeof candidate === 'string' || typeof candidate === 'number' || typeof candidate === 'boolean' ? candidate : undefined;

  const requirements = value
    .filter(
      (entry): entry is { type: string; message: string; value?: string | number | boolean } =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>).type === 'string' &&
        typeof (entry as Record<string, unknown>).message === 'string'
    )
    .map((entry) => ({
      type: safeString((entry as Record<string, unknown>).type),
      message: safeString((entry as Record<string, unknown>).message),
      value: normalizeRequirementValue((entry as Record<string, unknown>).value)
    }));

  return requirements.length > 0 ? requirements : [{ type: 'policy', message: 'policy decision unavailable' }];
};

export const normalizePolicyDecision = (raw: unknown, traceIdFallback = makeTrace()): PolicyDecisionResponse | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (!isPolicyState(body.state)) return null;

  const reasonCode = safeString(body.reasonCode);
  if (!reasonCode) return null;

  const traceId = safeString(body.traceId, traceIdFallback);
  const budgetSnapshot = normalizeBudgetSnapshot(body.budgetSnapshot);
  const requirements = normalizeRequirements(body.requirements);

  return {
    state: body.state,
    reasonCode,
    reason: safeString(body.reason),
    requirements,
    budgetSnapshot,
    personaId: safeString(body.personaId, 'unknown'),
    tool: safeString(body.tool, 'unknown'),
    riskClass: safeRiskClass(body.riskClass),
    traceId,
    policyVersion: safeString(body.policyVersion, 'v1'),
    decisionId: safeString(body.decisionId, makeDecisionId()),
    requiresConfirmation: body.requiresConfirmation === true,
    schemaVersion: safeString(body.schemaVersion, '1.0.0'),
    issuedAt: safeString(body.issuedAt, nowIso()),
    requestedPolicyUrl: safeString(body.requestedPolicyUrl)
  };
};

export const toErrorResponse = (
  status: number,
  message: string,
  options: {
    reasonCode?: string;
    traceId?: string;
    details?: ErrorDetails;
  } = {}
): ErrorResponse => ({
  status,
  error: message,
  reasonCode: options.reasonCode,
  traceId: options.traceId,
  service: 'api-gateway',
  errorId: options.traceId ? `${makeTrace()}-${options.traceId}` : makeTrace(),
  details: options.details
});
