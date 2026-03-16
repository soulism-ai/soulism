import {
  PolicyBudgetSnapshot,
  PolicyDecision as SharedPolicyDecision,
  PolicyRequirement,
  PolicyReasonCode,
  normalizePolicyRequest,
  isPolicyState,
  newTraceId,
  clampBudgetWindow,
  PolicyDecisionState
} from '@soulism/shared/contracts.js';
import { isBudgetExhausted, BudgetWindow, reserveBudget, makeBudget } from './budgets.js';
import { PolicyDecision, PolicyRequest, PolicyState, ReasonCode } from './decision.js';
import { ToolScope, RiskClass } from './scopes.js';

export interface PolicyRule {
  id: string;
  scope: ToolScope;
  personaIds?: string[];
  userIds?: string[];
  tenantIds?: string[];
  deniedPersonaIds?: string[];
  deniedUserIds?: string[];
  deniedTenantIds?: string[];
  allowedActions?: string[];
  deniedActions?: string[];
  riskClassMax: RiskClass;
  requireSignature: boolean;
  requireConfirmed?: boolean;
  requiresConfirmation?: boolean;
  allowBypass?: boolean;
  confidenceFloor?: number;
  isEnabled?: boolean;
  policyPriority?: number;
  maintenanceWindow?: {
    from: string;
    to: string;
  };
  metadata?: Record<string, unknown>;
  allowOnWeekdayOnly?: {
    startUtcHour: number;
    endUtcHour: number;
  };
}

export interface PolicyEngineContext {
  policyVersion: string;
  rules: PolicyRule[];
  budget: (request: PolicyRequest) => {
    remaining: number;
    max: number;
    windowStartedAt: number;
    windowEnd: number;
  };
  now?: () => number;
}

type BudgetProjection = {
  remaining: number;
  max: number;
  windowStartedAt: number;
  windowEnd: number;
};

type PolicyRuleHit = {
  rule: PolicyRule;
  rationale: string;
};

const riskOrder: Record<RiskClass, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const reasonByRisk = (allowed: RiskClass, requested: RiskClass): PolicyReasonCode => {
  if (riskOrder[requested] <= riskOrder[allowed]) return PolicyReasonCode.Ok;
  return PolicyReasonCode.ToolNotInPolicy;
};

const normalizeId = (value: string | undefined): string => (value || '').trim().toLowerCase();

const includesIgnoreCase = (collection: string[] | undefined, value: string): boolean => {
  if (!Array.isArray(collection) || collection.length === 0) return false;
  const normalized = normalizeId(value);
  return collection.some((entry) => normalizeId(entry) === normalized);
};

const normalizeTool = (value: unknown): ToolScope => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim() as ToolScope;
  }
  return ToolScope.WebFetch;
};

const normalizeAction = (value: unknown): string => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'invoke');

const toBudgetProjection = (request: PolicyRequest, budget: PolicyEngineContext['budget']): BudgetProjection => {
  const now = request.traceId ? Date.now() : Date.now();
  const raw = budget(request);
  return {
    remaining: Number.isFinite(raw?.remaining) ? Math.max(0, Math.floor(raw.remaining)) : 0,
    max: Number.isFinite(raw?.max) ? Math.max(1, Math.floor(raw.max)) : 1,
    windowStartedAt: Number.isFinite(raw?.windowStartedAt) ? Math.max(0, Math.floor(raw.windowStartedAt)) : now,
    windowEnd: Number.isFinite(raw?.windowEnd) ? Math.max(raw.windowStartedAt, Math.floor(raw.windowEnd)) : now
  };
};

const buildBudgetSnapshot = (projection: BudgetProjection): PolicyBudgetSnapshot => {
  const windowStart = projection.windowStartedAt > 0 ? new Date(projection.windowStartedAt).toISOString() : new Date(0).toISOString();
  const windowEnd = projection.windowEnd >= projection.windowStartedAt ? new Date(projection.windowEnd).toISOString() : windowStart;
  return clampBudgetWindow({
    remainingBudget: projection.remaining,
    maxBudget: projection.max,
    windowStart,
    windowEnd
  });
};

const matchesIdList = (list: string[] | undefined, requestValue: string): boolean => !list?.length || includesIgnoreCase(list, requestValue);

const isActionAllowed = (rule: PolicyRule, action: string): boolean => {
  if (!Array.isArray(rule.allowedActions) || rule.allowedActions.length === 0) return true;
  return includesIgnoreCase(rule.allowedActions, action);
};

const isActionDenied = (rule: PolicyRule, action: string): boolean =>
  Array.isArray(rule.deniedActions) && includesIgnoreCase(rule.deniedActions, action);

const isRuleAllowedListMatch = (rule: PolicyRule, request: PolicyRequest): boolean =>
  matchesIdList(rule.personaIds, request.personaId) &&
  matchesIdList(rule.userIds, request.userId) &&
  matchesIdList(rule.tenantIds, request.tenantId) &&
  isActionAllowed(rule, request.action);

const isRuleDeniedListMatch = (rule: PolicyRule, request: PolicyRequest): boolean =>
  includesIgnoreCase(rule.deniedPersonaIds, request.personaId) ||
  includesIgnoreCase(rule.deniedUserIds, request.userId) ||
  includesIgnoreCase(rule.deniedTenantIds, request.tenantId) ||
  isActionDenied(rule, request.action);

const isMaintenanceWindowActive = (window: PolicyRule['maintenanceWindow'], now = Date.now()): boolean => {
  if (!window?.from || !window?.to) return false;
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  if (from === to) return false;
  return now >= from && now <= to;
};

const isWeekdayWindowActive = (window: PolicyRule['allowOnWeekdayOnly'] | undefined, now = Date.now()): boolean => {
  if (!window) return true;
  const date = new Date(now);
  const hour = date.getUTCHours();
  const start = Math.max(0, Math.min(23, Math.floor(window.startUtcHour)));
  const end = Math.max(0, Math.min(23, Math.floor(window.endUtcHour)));
  const day = date.getUTCDay();
  const isWeekday = day >= 1 && day <= 5;
  if (!isWeekday) return false;
  if (start <= end) return isWeekday && hour >= start && hour < end;
  return isWeekday && (hour >= start || hour < end);
};

const isDeniedByRule = (rule: PolicyRule, request: PolicyRequest, now: number): boolean => {
  if (rule.isEnabled === false) return true;
  if (!isRuleAllowedListMatch(rule, request)) return true;
  if (isRuleDeniedListMatch(rule, request)) return true;
  if (!isWeekdayWindowActive(rule.allowOnWeekdayOnly, now)) return true;
  if (isMaintenanceWindowActive(rule.maintenanceWindow, now)) return true;
  return false;
};

const isPolicyMatch = (rule: PolicyRule, request: PolicyRequest, now: number): rule is PolicyRule =>
  !isDeniedByRule(rule, request, now);

const sortRules = (rules: PolicyRule[]): PolicyRule[] =>
  [...rules].sort((left, right) => {
    const leftPriority = Number(left.policyPriority ?? 0);
    const rightPriority = Number(right.policyPriority ?? 0);
    if (rightPriority !== leftPriority) return rightPriority - leftPriority;
    return left.scope.localeCompare(right.scope);
  });

const findMatchedRule = (rules: PolicyRule[], request: PolicyRequest, now: number): PolicyRuleHit | null => {
  for (const rule of sortRules(rules)) {
    if (rule.scope !== request.tool) continue;
    if (isPolicyMatch(rule, request, now)) {
      return {
        rule,
        rationale: `matched rule '${rule.id}' for scope '${rule.scope}'`
      };
    }
  }
  return null;
};

const buildRequirement = (type: string, message: string, value?: string | number): PolicyRequirement => ({
  type,
  message,
  value
});

const buildDecision = (
  state: PolicyState,
  request: PolicyRequest,
  snapshot: PolicyBudgetSnapshot,
  opts: {
    code: ReasonCode;
    reason: string;
    requiresConfirmation?: boolean;
    requirements: PolicyDecision['requirements'];
    policyVersion?: string;
    metadata?: Record<string, unknown>;
  }
): PolicyDecision => {
  const decisionId = `decision-${Date.now().toString(36)}-${Math.floor(Math.random() * 9e6).toString(36)}`;
  return {
    state,
    reasonCode: opts.code,
    reason: opts.reason,
    personaId: request.personaId,
    tool: request.tool,
    riskClass: request.riskClass,
    requiresConfirmation: Boolean(opts.requiresConfirmation),
    requirements: opts.requirements,
    budgetSnapshot: snapshot,
    policyVersion: opts.policyVersion || 'v1',
    traceId: request.traceId || newTraceId(request.personaId),
    decisionId,
    schemaVersion: '1.0.0',
    issuedAt: new Date().toISOString(),
    metadata: opts.metadata
  };
};

export const evaluatePolicy = (request: PolicyRequest, context: PolicyEngineContext, now = Date.now()): PolicyDecision => {
  const normalizedRequest = normalizePolicyRequest({
    ...request,
    tool: request.tool,
    action: request.action,
    riskClass: request.riskClass
  });
  const requestWithDefaults: PolicyRequest = normalizedRequest
    ? {
        personaId: normalizedRequest.personaId,
        userId: normalizedRequest.userId,
        tenantId: normalizedRequest.tenantId,
        tool: normalizeTool(normalizedRequest.tool),
        action: normalizeAction(normalizedRequest.action),
        riskClass: normalizedRequest.riskClass as RiskClass,
        traceId: normalizedRequest.traceId || newTraceId(normalizedRequest.personaId)
      }
    : {
        personaId: 'anonymous',
        userId: 'anonymous',
        tenantId: 'default',
        tool: normalizeTool(request.tool),
        action: normalizeAction(request.action),
        riskClass: request.riskClass,
        traceId: request.traceId || newTraceId(request.personaId)
      };

  if (!request.traceId) {
    request.traceId = newTraceId(requestWithDefaults.personaId);
  }
  request.tool = normalizeTool(request.tool);
  request.action = normalizeAction(request.action);
  request.riskClass = requestWithDefaults.riskClass;

  const projection = toBudgetProjection(
    request,
    context?.budget ||
      (() => {
        const budget = makeBudget(100, request.riskClass);
        return {
          remaining: budget.remaining,
          max: budget.max,
          windowStartedAt: budget.windowStartedAt,
          windowEnd: budget.windowStartedAt + budget.windowMs
        };
      })
  );

  const budgetWindow = {
    ...projection,
    riskClass: request.riskClass,
    lastChargeAt: now,
    windowMs: Math.max(1_000, projection.windowEnd - projection.windowStartedAt)
  } as BudgetWindow;
  const reasonBudget: ReasonCode = isBudgetExhausted(budgetWindow, 1)
    ? PolicyReasonCode.RiskLimitReached
    : PolicyReasonCode.Ok;
  const rules = sortRules(context?.rules || []);

  if (rules.length === 0) {
    return buildDecision(
      PolicyDecisionState.Deny,
      requestWithDefaults,
      buildBudgetSnapshot(projection),
      {
        code: PolicyReasonCode.ToolNotInPolicy,
        reason: 'policy rules are empty',
        requirements: [buildRequirement('policy', 'no policy rules configured')],
        policyVersion: context?.policyVersion || 'v1'
      }
    );
  }

  const matched = findMatchedRule(rules, request, now);
  if (!matched) {
    return buildDecision(
      PolicyDecisionState.Deny,
      requestWithDefaults,
      buildBudgetSnapshot(projection),
      {
        code: PolicyReasonCode.ToolNotInPolicy,
        reason: `No matching allow policy for '${request.tool}'`,
        requirements: [buildRequirement('policy', `tool '${request.tool}' denied by all rules`)],
        policyVersion: context?.policyVersion || 'v1'
      }
    );
  }

  const rule = matched.rule;
  const riskCheck = reasonByRisk(rule.riskClassMax, request.riskClass);
  if (riskCheck !== PolicyReasonCode.Ok) {
    return buildDecision(
      PolicyDecisionState.Deny,
      requestWithDefaults,
      buildBudgetSnapshot(projection),
      {
        code: riskCheck,
        reason: `risk '${request.riskClass}' exceeds max '${rule.riskClassMax}' for '${rule.id}'`,
        requirements: [
          buildRequirement(
            'risk',
            `rule '${rule.id}' permits maximum risk ${rule.riskClassMax}, request used ${request.riskClass}`
          )
        ],
        policyVersion: context?.policyVersion || 'v1',
        metadata: { rule: rule.id, rationale: matched.rationale }
      }
    );
  }

  const budgetState = reserveBudget(
    {
      key: `${request.tenantId}:${request.userId}:${request.personaId}:${request.tool}`,
      remaining: projection.remaining,
      max: projection.max,
      riskClass: request.riskClass,
      lastChargeAt: now,
      windowMs: projection.windowEnd - projection.windowStartedAt,
      windowStartedAt: projection.windowStartedAt
    },
    1
  );
  const postBudgetSnapshot = buildBudgetSnapshot({
    remaining: budgetState.remaining,
    max: budgetState.max,
    windowStartedAt: budgetState.windowStartedAt,
    windowEnd: budgetState.windowStartedAt + budgetState.windowMs
  });

  if (reasonBudget !== PolicyReasonCode.Ok && !rule.allowBypass) {
    return buildDecision(PolicyDecisionState.Deny, requestWithDefaults, buildBudgetSnapshot(projection), {
      code: reasonBudget,
      reason: `budget exhausted for key '${requestWithDefaults.personaId}'`,
      requirements: [buildRequirement('budget', 'insufficient budget for request')],
      policyVersion: context?.policyVersion || 'v1',
      metadata: { reasonBudget, postBudgetSnapshot, matchedRuleId: rule.id }
    });
  }

  const needsConfirmation =
    rule.requireSignature ||
    rule.requireConfirmed ||
    rule.requiresConfirmation ||
    Boolean(rule.confidenceFloor && request.riskClass === 'high') ||
    Boolean(rule.confidenceFloor && request.riskClass === 'critical');

  if (needsConfirmation) {
    return buildDecision(
      PolicyDecisionState.Confirm,
      requestWithDefaults,
      postBudgetSnapshot,
      {
        code: rule.requireSignature ? PolicyReasonCode.MissingSignature : PolicyReasonCode.ConfirmRequired,
        reason: rule.requireSignature
          ? 'tool requires valid persona pack signature'
          : 'tool requires operator confirmation',
        requirements: [
          buildRequirement(
            rule.requireSignature ? 'signature' : 'human_approval',
            rule.requireSignature ? 'signature must be provided and valid' : 'operator confirmation required'
          )
        ],
        policyVersion: context?.policyVersion || 'v1',
        requiresConfirmation: true,
        metadata: { matchedRuleId: rule.id, rationale: matched.rationale, budgetSnapshot: postBudgetSnapshot }
      }
    );
  }

  if (!isActionAllowed(rule, request.action)) {
    return buildDecision(
      PolicyDecisionState.Deny,
      requestWithDefaults,
      postBudgetSnapshot,
      {
        code: PolicyReasonCode.ActionBlocked,
        reason: `action '${request.action}' not permitted by '${rule.id}'`,
        requirements: [buildRequirement('policy', `allowed action missing for rule ${rule.id}`)],
        policyVersion: context?.policyVersion || 'v1'
      }
    );
  }

  return buildDecision(
    PolicyDecisionState.Allow,
    requestWithDefaults,
    postBudgetSnapshot,
    {
      code: PolicyReasonCode.Ok,
      reason: `allowed by rule '${rule.id}'`,
      requirements: [
        buildRequirement('policy', matched.rationale),
        buildRequirement('rule', `ruleId:${rule.id}`, rule.id)
      ],
      policyVersion: context?.policyVersion || 'v1',
      metadata: {
        matchedRuleId: rule.id,
        allowBypass: Boolean(rule.allowBypass),
        confidenceFloor: rule.confidenceFloor,
        maintenanceWindow: rule.maintenanceWindow || null
      }
    }
  );
};

export const normalizePolicyDecision = (decision: PolicyDecision): SharedPolicyDecision =>
  isPolicyState(decision.state) ? decision : {
    ...decision,
    state: PolicyDecisionState.Deny,
    reasonCode: PolicyReasonCode.PolicyUnavailable,
    reason: decision.reason || 'policy_state_invalid'
  };
