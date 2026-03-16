export interface PolicyRequirement {
  type: string;
  message: string;
  value?: string | number | boolean;
}

export interface PolicyBudgetSnapshot {
  remainingBudget: number;
  maxBudget: number;
  windowStart: string;
  windowEnd: string;
}

export interface PolicyDecision {
  state: 'allow' | 'confirm' | 'deny';
  reasonCode: string;
  reason?: string;
  requirements: PolicyRequirement[];
  budgetSnapshot: PolicyBudgetSnapshot;
  traceId: string;
  policyVersion: string;
  decisionId: string;
  schemaVersion: string;
  issuedAt: string;
  requestedPolicyUrl?: string;
}

export interface PersonaInfo {
  id: string;
  name?: string;
  description?: string;
}

export interface SoulismRunResult {
  traceId: string;
  personaId: string;
  persona: PersonaInfo | null;
  policy: PolicyDecision;
  tool: {
    status: number;
    ok: boolean;
    contentType: string;
    body: string;
    url: string;
  };
  confirmed?: boolean;
}

export const buildPolicyRequest = (params: {
  personaId: string;
  userId: string;
  tenantId: string;
  tool: string;
  action: string;
  riskClass: 'low' | 'medium' | 'high' | 'critical';
  traceId: string;
}) => ({
  ...params,
  reason: 'runtime-request'
});

export const formatDecision = (decision: PolicyDecision): string =>
  `[${decision.state.toUpperCase()}] ${decision.reasonCode}${decision.reason ? `: ${decision.reason}` : ''}`;

export const formatRequirements = (requirements: PolicyDecision['requirements']): string =>
  requirements.map((entry) => `  - ${entry.type}: ${entry.message}`).join('\n') || '  (no requirements)';

export const formatBudget = (snapshot?: PolicyDecision['budgetSnapshot']): string =>
  snapshot
    ? `${snapshot.remainingBudget}/${snapshot.maxBudget} (window ${snapshot.windowStart} → ${snapshot.windowEnd})`
    : 'n/a';

export const renderResult = (result: SoulismRunResult): string => {
  const personaLabel = `${result.persona?.name ?? result.personaId} (${result.persona?.id ?? result.personaId})`;
  const tool = result.tool;
  return [
    `Persona: ${personaLabel}`,
    `Decision: ${formatDecision(result.policy)}`,
    `Budget: ${formatBudget(result.policy.budgetSnapshot)}`,
    `Requirements:\n${formatRequirements(result.policy.requirements)}`,
    `Tool call: ${tool.url}`,
    `HTTP ${tool.status} - ${tool.contentType}`,
    `Tool Trace: ${result.traceId}`,
    `Policy Trace: ${result.policy.traceId}`,
    `Policy Decision ID: ${result.policy.decisionId}`,
    `Body preview: ${tool.body.slice(0, 512)}`
  ].join('\n');
};
