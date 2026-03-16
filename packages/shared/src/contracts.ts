export const POLICY_DECISION_SCHEMA_VERSION = '1.0.0';

export const PolicyDecisionState = {
  Allow: 'allow',
  Confirm: 'confirm',
  Deny: 'deny'
} as const;

export type PolicyDecisionState = (typeof PolicyDecisionState)[keyof typeof PolicyDecisionState];

export const PolicyReasonCode = {
  ToolNotInPolicy: 'tool_not_in_policy',
  RiskLimitReached: 'risk_limit_reached',
  UserRiskLimit: 'user_risk_limit',
  PersonaRiskLimit: 'persona_risk_limit',
  MaintenanceWindow: 'maintenance_window',
  PolicyViolation: 'policy_violation',
  ActionBlocked: 'action_blocked',
  MissingSignature: 'missing_signature',
  ConfirmRequired: 'confirm_required',
  Ok: 'ok',
  InvalidRequest: 'invalid_request',
  ToolNotAllowed: 'tool_not_allowed',
  InvalidPolicyResponse: 'invalid_policy_response',
  PolicyUnavailable: 'policy_unavailable',
  PolicyRejected: 'policy_rejected',
  SignatureModeMismatch: 'signature_mode_mismatch'
} as const;

export type PolicyReasonCode = (typeof PolicyReasonCode)[keyof typeof PolicyReasonCode];

export type PolicyRequirement = {
  type: string;
  value?: string | number | boolean;
  message: string;
};

export type PolicyBudgetSnapshot = {
  remainingBudget: number;
  maxBudget: number;
  windowStart: string;
  windowEnd: string;
};

export interface PolicyDecision {
  state: PolicyDecisionState;
  reasonCode: PolicyReasonCode;
  reason?: string;
  personaId: string;
  tool: string;
  riskClass: 'low' | 'medium' | 'high' | 'critical';
  requiresConfirmation: boolean;
  requirements: PolicyRequirement[];
  budgetSnapshot: PolicyBudgetSnapshot;
  policyVersion: string;
  decisionId: string;
  traceId: string;
  schemaVersion?: string;
  expiresAt?: string;
  issuedAt: string;
};

export interface PolicyRequest {
  personaId: string;
  userId: string;
  tenantId: string;
  tool: string;
  action: string;
  riskClass: 'low' | 'medium' | 'high' | 'critical';
  traceId?: string;
  requestId?: string;
  userAgent?: string;
  ip?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyEnvelope extends PolicyDecision {
  schemaVersion: string;
}

export interface PolicyError {
  code: string;
  message: string;
  status: number;
  reasonCode?: PolicyReasonCode;
  state?: PolicyDecisionState;
  traceId?: string;
  decision?: PolicyDecision;
}

export type PolicyDecisionResponse = PolicyEnvelope | PolicyError;

export interface PolicyGuardDecision {
  state: PolicyDecisionState;
  reasonCode: PolicyReasonCode;
  reason?: string;
  requirements: PolicyRequirement[];
  budgetSnapshot: PolicyBudgetSnapshot;
  traceId: string;
  policyVersion: string;
  decisionId?: string;
}

export interface AuditEvent {
  id: string;
  schemaVersion: string;
  service: string;
  action: string;
  principal: string;
  traceId?: string;
  riskClass?: string;
  personaId?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  prevHash: string;
  hash: string;
}

export interface AuditQuery {
  principal?: string;
  service?: string;
  action?: string;
  from?: string;
  to?: string;
  traceId?: string;
  minRemainingBudget?: number;
  schemaVersion?: string;
  limit?: number;
  offset?: number;
}

export interface AuditExportOptions {
  format: 'json' | 'ndjson' | 'csv';
  includeMetadata: boolean;
  fields?: string[];
}

export interface AuditExport {
  generatedAt: string;
  schemaVersion: string;
  count: number;
  query?: AuditQuery;
  fields: string[];
  items: AuditEvent[] | string;
}

export interface PolicyGatewayConfig {
  url: string;
  timeoutMs: number;
  retries: number;
  retryBaseMs: number;
  retryMaxMs: number;
  requireConfirmationOnTimeout: boolean;
}

export interface ServiceHealth {
  ok: boolean;
  service: string;
  ready?: boolean;
  errors?: string[];
  latencyMs?: number;
  version?: string;
}

export type ApiErrorShape = {
  error: string;
  status: number;
  reasonCode?: string;
  traceId?: string;
  details?: Record<string, unknown>;
};

export interface PolicyDecisionSummary {
  total: number;
  allow: number;
  confirm: number;
  deny: number;
  confirmRatio: number;
  denyRatio: number;
}

export const isPolicyState = (value: unknown): value is PolicyDecisionState =>
  value === PolicyDecisionState.Allow || value === PolicyDecisionState.Confirm || value === PolicyDecisionState.Deny;

export const isRiskClass = (value: unknown): value is PolicyRequest['riskClass'] =>
  value === 'low' || value === 'medium' || value === 'high' || value === 'critical';

export const normalizeRiskClass = (value: unknown): PolicyRequest['riskClass'] => {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value;
  }
  return 'low';
};

export const normalizePolicyDecision = (value: unknown): PolicyGuardDecision => {
  const fallback: PolicyGuardDecision = {
    state: PolicyDecisionState.Deny,
    reasonCode: PolicyReasonCode.PolicyUnavailable,
    reason: 'default-deny',
    requirements: [{ type: 'policy', message: 'policy service not available' }],
    budgetSnapshot: {
      remainingBudget: 0,
      maxBudget: 0,
      windowStart: new Date().toISOString(),
      windowEnd: new Date().toISOString()
    },
    traceId: `fallback-${Date.now()}`,
    policyVersion: 'unknown'
  };

  if (!value || typeof value !== 'object') return fallback;
  const body = value as Record<string, unknown>;
  const state = isPolicyState(body.state) ? body.state : PolicyDecisionState.Deny;
  const reasonCode = typeof body.reasonCode === 'string' && body.reasonCode.length > 0 ? (body.reasonCode as PolicyReasonCode) : PolicyReasonCode.PolicyUnavailable;
  const reason = typeof body.reason === 'string' ? body.reason : undefined;
  const requirements = Array.isArray(body.requirements)
    ? body.requirements.filter(
        (entry): entry is PolicyRequirement =>
          Boolean(entry) && typeof entry === 'object' && typeof (entry as Record<string, unknown>).type === 'string'
      )
    : [];
  const budgetSnapshot = normalizeBudgetSnapshot(body.budgetSnapshot);
  const traceId = typeof body.traceId === 'string' && body.traceId.length > 0 ? body.traceId : `policy-${Date.now()}`;
  const policyVersion = typeof body.policyVersion === 'string' ? body.policyVersion : 'v1';
  const decisionId = typeof body.decisionId === 'string' ? body.decisionId : undefined;
  return {
    state,
    reasonCode,
    reason,
    requirements,
    budgetSnapshot,
    traceId,
    policyVersion,
    decisionId
  };
};

export const newTraceId = (seed = ''): string => {
  const base = seed && seed.trim() ? seed.trim() : cryptoRandomId();
  const ms = Date.now().toString(36);
  return `policy-${ms}-${base}`;
};

export const normalizeBudgetSnapshot = (value: unknown): PolicyBudgetSnapshot => {
  if (!value || typeof value !== 'object') {
    return {
      remainingBudget: 0,
      maxBudget: 0,
      windowStart: new Date().toISOString(),
      windowEnd: new Date().toISOString()
    };
  }

  const snapshot = value as Record<string, unknown>;
  const normalizeBudgetValue = (candidate: unknown): number => {
    const numeric = Number(candidate);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Math.floor(numeric);
  };
  const rawWindowStart = typeof snapshot.windowStart === 'string' ? snapshot.windowStart : undefined;
  const rawWindowEnd = typeof snapshot.windowEnd === 'string' ? snapshot.windowEnd : undefined;
  const windowStart = typeof rawWindowStart === 'string' && validIsoTimestamp(rawWindowStart) ? rawWindowStart : new Date().toISOString();
  const windowEnd = typeof rawWindowEnd === 'string' && validIsoTimestamp(rawWindowEnd) ? rawWindowEnd : new Date().toISOString();
  return {
    remainingBudget: normalizeBudgetValue(snapshot.remainingBudget),
    maxBudget: Math.max(1, normalizeBudgetValue(snapshot.maxBudget)),
    windowStart,
    windowEnd
  };
};

export const normalizePolicyRequest = (request: unknown): PolicyRequest | null => {
  if (!request || typeof request !== 'object') return null;
  const body = request as Record<string, unknown>;
  const tool = typeof body.tool === 'string' ? body.tool : '';
  const action = typeof body.action === 'string' ? body.action : '';
  if (!tool || !action) return null;
  const traceId = typeof body.traceId === 'string' ? body.traceId : undefined;
  const requestId = typeof body.requestId === 'string' ? body.requestId : undefined;
  return {
    personaId: String(body.personaId ?? 'default'),
    userId: String(body.userId ?? 'anonymous'),
    tenantId: String(body.tenantId ?? 'default'),
    tool,
    action,
    riskClass: normalizeRiskClass(body.riskClass),
    traceId,
    requestId,
    userAgent: typeof body.userAgent === 'string' ? body.userAgent : undefined,
    ip: typeof body.ip === 'string' ? body.ip : undefined,
    resource: typeof body.resource === 'string' ? body.resource : undefined,
    metadata: typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? (body.metadata as Record<string, unknown>) : undefined
  };
};

export const decisionToPolicyResponse = (decision: PolicyGuardDecision): PolicyDecision => {
  return {
    state: decision.state,
    reasonCode: decision.reasonCode,
    reason: decision.reason,
    personaId: 'unknown',
    tool: 'unknown',
    riskClass: 'low',
    requiresConfirmation: decision.state === PolicyDecisionState.Confirm,
    requirements: decision.requirements,
    budgetSnapshot: decision.budgetSnapshot,
    policyVersion: decision.policyVersion,
    decisionId: decision.decisionId ?? `decision-${Date.now()}`,
    traceId: decision.traceId,
    schemaVersion: POLICY_DECISION_SCHEMA_VERSION,
    issuedAt: new Date().toISOString()
  };
};

export const summarizePolicyDecisions = (decisions: PolicyGuardDecision[]): PolicyDecisionSummary => {
  const total = decisions.length;
  const allow = decisions.filter((decision) => decision.state === PolicyDecisionState.Allow).length;
  const confirm = decisions.filter((decision) => decision.state === PolicyDecisionState.Confirm).length;
  const deny = decisions.filter((decision) => decision.state === PolicyDecisionState.Deny).length;
  const denominator = total > 0 ? total : 1;
  return {
    total,
    allow,
    confirm,
    deny,
    confirmRatio: confirm / denominator,
    denyRatio: deny / denominator
  };
};

export const policyFailureEnvelope = (status: number, code: string, message: string, traceId: string, reasonCode?: PolicyReasonCode): PolicyError => ({
  code,
  message,
  status,
  reasonCode,
  traceId
});

export const buildApiError = (error: string, status: number, reasonCode?: string, traceId?: string): ApiErrorShape => ({
  error,
  status,
  reasonCode,
  traceId
});

export const validIsoTimestamp = (value: string | undefined): boolean => {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

export const cryptoRandomId = (): string => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const computeResourceFingerprint = (resource: string): string => {
  let hash = 0xcbf29ce484222325n;
  const fnvPrime = 0x100000001b3n;
  const asString = String(resource || '').trim();
  for (let i = 0; i < asString.length; i += 1) {
    const ch = BigInt(asString.charCodeAt(i));
    hash ^= ch;
    hash = (hash * fnvPrime) & 0xffffffffffffffffn;
  }
  return `fnv64:${hash.toString(16).padStart(16, '0')}`;
};

export const pickRiskClassForPersona = (rawRisk: unknown, defaultRisk: PolicyRequest['riskClass'] = 'low'): PolicyRequest['riskClass'] => {
  if (typeof rawRisk !== 'string') return defaultRisk;
  if (rawRisk === 'low' || rawRisk === 'medium' || rawRisk === 'high' || rawRisk === 'critical') return rawRisk;
  return defaultRisk;
};

export const clampBudgetWindow = (snapshot: PolicyBudgetSnapshot, now = Date.now()): PolicyBudgetSnapshot => {
  const start = Date.parse(snapshot.windowStart);
  const end = Date.parse(snapshot.windowEnd);
  const safeStart = Number.isFinite(start) ? start : now;
  const safeEnd = Number.isFinite(end) && end >= safeStart ? end : safeStart + 60_000;
  return {
    remainingBudget: Math.max(0, Math.floor(snapshot.remainingBudget)),
    maxBudget: Math.max(1, Math.floor(snapshot.maxBudget)),
    windowStart: new Date(safeStart).toISOString(),
    windowEnd: new Date(safeEnd).toISOString()
  };
};

export const policyEnvelopeHasPolicyDenial = (decision: PolicyDecision | PolicyGuardDecision): boolean =>
  decision.reasonCode === PolicyReasonCode.UserRiskLimit ||
  decision.reasonCode === PolicyReasonCode.PersonaRiskLimit ||
  decision.reasonCode === PolicyReasonCode.ToolNotInPolicy ||
  decision.reasonCode === PolicyReasonCode.ToolNotAllowed ||
  decision.reasonCode === PolicyReasonCode.ActionBlocked ||
  decision.reasonCode === PolicyReasonCode.PolicyViolation ||
  decision.reasonCode === PolicyReasonCode.InvalidRequest;

export const policyDecisionToRow = (decision: PolicyDecision): Record<string, string | number | boolean> => ({
  state: decision.state,
  reasonCode: decision.reasonCode,
  personaId: decision.personaId,
  tool: decision.tool,
  riskClass: decision.riskClass,
  requiresConfirmation: decision.requiresConfirmation,
  remainingBudget: decision.budgetSnapshot.remainingBudget,
  maxBudget: decision.budgetSnapshot.maxBudget,
  decisionId: decision.decisionId,
  traceId: decision.traceId,
  issuedAt: decision.issuedAt,
  reason: decision.reason ?? ''
});

export const decisionAsText = (decision: PolicyDecision): string =>
  `${decision.traceId}:${decision.state}/${decision.reasonCode}:${decision.personaId}:${decision.tool}`;
