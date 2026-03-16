import { chargeBudget, makeBudget } from '@soulism/persona-policy/budgets.js';
import { evaluatePolicy, PolicyEngineContext } from '@soulism/persona-policy/policy.js';
import { ToolScope } from '@soulism/persona-policy/scopes.js';
import { PolicyDecision, PolicyRequest } from '@soulism/persona-policy/decision.js';

const budgetStore = new Map<string, ReturnType<typeof makeBudget>>();
const budgetKey = (request: PolicyRequest): string => `${request.tenantId}:${request.userId}:${request.personaId}:${request.tool}`;

const budgetContext = (request: PolicyRequest) => {
  const key = budgetKey(request);
  const entry = budgetStore.get(key) ?? makeBudget(100, request.riskClass);
  const now = Date.now();
  const active = chargeBudget(entry, 1, now);
  budgetStore.set(key, { ...active, riskClass: request.riskClass, key });

  return {
    remaining: active.remaining,
    max: active.max,
    windowStartedAt: active.windowStartedAt,
    windowEnd: active.windowStartedAt + active.windowMs
  };
};

const persistDecisionBudget = (request: PolicyRequest, decision: PolicyDecision): void => {
  if (decision.state === 'deny') {
    return;
  }
  const key = budgetKey(request);
  const windowStart = Date.parse(decision.budgetSnapshot.windowStart);
  const windowEnd = Date.parse(decision.budgetSnapshot.windowEnd);
  budgetStore.set(key, {
    key,
    remaining: decision.budgetSnapshot.remainingBudget,
    max: decision.budgetSnapshot.maxBudget,
    riskClass: request.riskClass,
    lastChargeAt: Date.now(),
    windowStartedAt: Number.isFinite(windowStart) ? windowStart : Date.now(),
    windowMs: Number.isFinite(windowEnd - windowStart) && windowEnd > windowStart ? windowEnd - windowStart : 60_000
  });
};

const policyContext: PolicyEngineContext = {
  policyVersion: 'v1',
  rules: [
    {
      id: 'all_persona_read',
      scope: ToolScope.PersonaRegistry,
      allowedActions: ['read'],
      riskClassMax: 'critical',
      requireSignature: false,
      requiresConfirmation: false,
      isEnabled: true
    },
    {
      id: 'persona_registry_upsert',
      scope: ToolScope.PersonaRegistry,
      allowedActions: ['upsert'],
      riskClassMax: 'high',
      requireSignature: false,
      requiresConfirmation: false,
      isEnabled: true
    },
    {
      id: 'all_tool_allow',
      scope: ToolScope.WebFetch,
      riskClassMax: 'high',
      requireSignature: false,
      requiresConfirmation: false,
      isEnabled: true
    },
    {
      id: 'memory_read_allow',
      scope: ToolScope.MemoryRead,
      riskClassMax: 'high',
      requireSignature: false,
      requiresConfirmation: false,
      isEnabled: true
    },
    {
      id: 'filesystem_read_allow',
      scope: ToolScope.FilesystemRead,
      riskClassMax: 'high',
      requireSignature: false,
      requiresConfirmation: false,
      isEnabled: true
    },
    {
      id: 'memory_write_confirm',
      scope: ToolScope.MemoryWrite,
      riskClassMax: 'medium',
      requireSignature: true,
      requiresConfirmation: true,
      isEnabled: true
    },
    {
      id: 'files_confirm',
      scope: ToolScope.FilesystemWrite,
      riskClassMax: 'medium',
      requireSignature: true,
      requiresConfirmation: true,
      isEnabled: true
    }
  ],
  budget: (request) => budgetContext(request)
};

export const assertPolicyEngineReady = (): void => {
  if (!policyContext.policyVersion) {
    throw new Error('policy_version_missing');
  }
  if (policyContext.rules.length === 0) {
    throw new Error('policy_rules_missing');
  }
};

export const runPolicyCheck = (request: PolicyRequest): PolicyDecision => {
  const decision = evaluatePolicy(request, policyContext);
  persistDecisionBudget(request, decision);
  return {
    ...decision,
    budgetSnapshot: {
      ...decision.budgetSnapshot,
      remainingBudget: decision.budgetSnapshot.remainingBudget,
      maxBudget: decision.budgetSnapshot.maxBudget,
      windowStart: decision.budgetSnapshot.windowStart,
      windowEnd: decision.budgetSnapshot.windowEnd
    }
  };
};
